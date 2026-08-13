"""Orchestriert den Kickbase Trading Advisor fuer unser 3-Ligen-System.

Basierend auf https://github.com/LennardFe/Kickbase-Trading-Advisor (danke an
LennardFe fuer das Original-Tool!). Angepasst, um:
  - denselben Kickbase-Account/dieselben Secrets zu nutzen wie der Rest
    dieser App (KICKBASE_EMAIL, KICKBASE_PASS, KICKBASE_LEAGUE_1/2/3_NAME),
  - Budgets + Markt-Empfehlungen fuer ALLE 3 Ligen statt nur einer zu
    berechnen (das ML-Modell wird nur EINMAL trainiert und fuer alle 3
    Maerkte wiederverwendet - spart Laufzeit, die Marktwert-Entwicklung
    ist liga-unabhaengig),
  - Kader-Empfehlungen fuer ALLE Manager einer Liga zu berechnen (nicht nur
    fuer den eingeloggten Account) - ueber die Kickbase-API
    /leagues/{id}/managers/{managerId}/squad kann EIN technischer Account,
    der die Liga verwaltet, die Kader ALLER Manager abrufen. Jeder Nutzer
    sieht so personalisierte Kader-Empfehlungen fuer seinen eigenen Kader
    (per Kickbase-Name-Zuordnung im Account, siehe Profile.jsx), OHNE
    eigene Kickbase-Zugangsdaten hinterlegen zu muessen,
  - das Ergebnis als JSON-Datei zu speichern statt per E-Mail zu versenden
    (die App hat bereits eine eigene Push-Benachrichtigung/Admin-Oberflaeche).

Wird taeglich per GitHub Action (.github/workflows/advisor.yml) ausgefuehrt,
manuell antriggerbar ueber den "Trading Advisor aktualisieren"-Button im
Admin Panel (frontend/api/advisor-cron.js).
"""

import json
import os
import sys
from datetime import datetime, timezone

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kickbase_api.league import get_leagues_infos
from kickbase_api.manager import get_managers
from kickbase_api.user import login
from budgets import calc_manager_budgets
from predictions.data_handler import fetch_player_data
from predictions.preprocessing import preprocess_player_data, split_data
from predictions.modeling import train_model, evaluate_model
from predictions.predictions import live_data_predictions, join_current_market, join_current_squad

# ----------------- Konfiguration -----------------

LAST_MV_VALUES = 365   # Tage Marktwert-Historie pro Spieler
LAST_PFM_VALUES = 50   # Spieltage Performance-Historie pro Spieler
COMPETITION_IDS = [1]  # 1 = Bundesliga

FEATURES = [
    "p", "mv", "days_to_next",
    "mv_change_1d", "mv_trend_1d",
    "mv_change_3d", "mv_vol_3d",
    "mv_trend_7d", "market_divergence",
]
TARGET = "mv_target_clipped"

HISTORY_DAYS = 60  # Tage Marktwert-/Punkte-Verlauf, der pro Markt-Spieler exportiert wird

POSITION_LABELS = {1: "TW", 2: "ABW", 3: "MF", 4: "ST"}


def env_or_default(key, default):
    """os.getenv(key, default), aber behandelt auch einen LEEREN String als
    "nicht gesetzt". Wichtig, weil GitHub Actions bei "${{ vars.X }}" für
    eine nicht konfigurierte Repo-Variable einen leeren String liefert
    (nicht einfach die Variable weglässt) - os.getenv würde in dem Fall
    faelschlicherweise "" statt default zurueckgeben.
    """
    val = os.getenv(key)
    return val if val else default


# ----------------- Liga-Auswahl -----------------
# WICHTIG: Vorerst laeuft der Advisor bewusst nur gegen die einzelne
# "test"-Liga, um das Feature risikofrei zu testen, bevor er auf die 3
# echten Ligen losgelassen wird. Einfach den Block unten zurueckwechseln,
# sobald alles wie gewuenscht funktioniert.
LEAGUE_DEFS = [
    {"key": "TEST", "name": env_or_default("KICKBASE_TEST_LEAGUE_NAME", "test")},
]

# Echte 3-Ligen-Konfiguration (nutzt dieselben Secrets/Variablen wie das
# bestehende Node-Backend, siehe backend/kickbase.js) - fuer spaeter:
# LEAGUE_DEFS = [
#     {"key": "LIGA1", "name": env_or_default("KICKBASE_LEAGUE_1_NAME", "Liga 1")},
#     {"key": "LIGA2", "name": env_or_default("KICKBASE_LEAGUE_2_NAME", "Liga 2")},
#     {"key": "LIGA3", "name": env_or_default("KICKBASE_LEAGUE_3_NAME", "Liga 3")},
# ]

LEAGUE_START_DATE = env_or_default("ADVISOR_LEAGUE_START_DATE", "2026-08-13")
START_BUDGET = int(env_or_default("ADVISOR_START_BUDGET", "50000000"))

OUTPUT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend", "public", "advisor-data.json"
)


def df_records(df, column_map):
    """DataFrame -> Liste von Dicts mit umbenannten Spalten, NaN-sicher (-> null in JSON)."""

    if df is None or df.empty:
        return []

    selected = df[list(column_map.keys())].rename(columns=column_map)
    # Ueber to_json/loads statt to_dict, weil pandas dabei NaN/NaT sauber zu
    # null konvertiert (to_dict wuerde float('nan') liefern, was kein
    # gueltiges JSON ist).
    return json.loads(selected.to_json(orient="records"))


def build_budgets_payload(token, league_id):
    budgets_df = calc_manager_budgets(token, league_id, LEAGUE_START_DATE, START_BUDGET)
    budgets_df = budgets_df.round(0)
    return df_records(budgets_df, {
        "User": "manager",
        "Budget": "budget",
        "Team Value": "teamValue",
        "Available Budget": "availableBudget",
    })


def history_key(player_id):
    """Normalisiert eine Spieler-ID zu einem konsistenten String-Key.

    BUGFIX: Vorher wurde der Key in build_history_by_player() mit int(player_id)
    gebildet, waehrend die "playerId" in den exportierten Listen einen
    JSON-Roundtrip (to_json -> json.loads) durchlaeuft und je nach
    urspruenglichem Kickbase-Datentyp als String ODER Zahl ankommt. Ein
    int-Key "83716" != String-Key "83716" -> der Lookup schlug dadurch IMMER
    fehl (leere Historie ueberall). Jetzt wird auf beiden Seiten konsequent
    str(...) verwendet, unabhaengig vom urspruenglichen Typ.
    """

    return str(player_id) if player_id is not None else None


def build_history_by_player(player_df, days=HISTORY_DAYS):
    """Baut je Spieler eine kompakte Marktwert-/Punkte-Historie der letzten
    `days` Tage (fuer den Marktwert-Chart auf Klick einer Spielerkarte).

    Format bewusst als Tupel-Array [datum, marktwert, punkte] statt als
    Liste von Objekten mit Schluesseln - spart bei hunderten Spielern x
    mehreren Wochen Historie spuerbar JSON-Groesse (keine wiederholten
    Feldnamen pro Eintrag).
    """

    if player_df.empty:
        return {}

    cols = player_df[["player_id", "date", "mv", "p"]].copy()
    cols["date"] = pd.to_datetime(cols["date"]).dt.date.astype(str)
    cols = cols.sort_values(["player_id", "date"])

    history = {}
    for player_id, group in cols.groupby("player_id"):
        recent = group.tail(days)
        history[history_key(player_id)] = [
            [row.date, None if pd.isna(row.mv) else round(float(row.mv)), None if pd.isna(row.p) else int(row.p)]
            for row in recent.itertuples()
        ]

    return history


def build_player_stats(player_df):
    """Aggregierte Saison-Kennzahlen je Spieler (Einsaetze, Gesamtminuten,
    Punkteschnitt) - Basis fuer den "Scouting-Report" im Frontend.

    WICHTIG: player_df hat PRO TAG eine Zeile (Marktwert-Historie), die
    Einsatz-/Punktedaten eines Spieltags werden dabei per merge_asof auf ALLE
    Tage bis zum naechsten Spieltag durchgereicht - eine einzelne Leistung
    wuerde beim simplen Zeilenzaehlen also mehrfach gezaehlt. Deshalb zuerst
    auf (player_id, Spieltag) deduplizieren.
    """

    if player_df.empty or "mp" not in player_df.columns or "md" not in player_df.columns:
        return {}

    matches = player_df.dropna(subset=["mp", "md"]).drop_duplicates(subset=["player_id", "md"]).copy()
    matches = matches[matches["mp"] > 0]
    if matches.empty:
        return {}

    grouped = matches.groupby("player_id").agg(
        appearances=("mp", "count"),
        totalMinutes=("mp", "sum"),
        avgPoints=("p", "mean"),
    )

    stats = {}
    for player_id, row in grouped.iterrows():
        stats[history_key(player_id)] = {
            "appearances": int(row["appearances"]),
            "totalMinutes": int(row["totalMinutes"]),
            "avgPoints": round(float(row["avgPoints"]), 1) if pd.notna(row["avgPoints"]) else None,
        }

    return stats


def _attach_player_stats(records, player_stats):
    if not player_stats:
        return
    for entry in records:
        stats = player_stats.get(history_key(entry.get("playerId")))
        if stats:
            entry.update(stats)


def build_market_payload(token, league_id, live_predictions_df, history_by_player=None, player_stats=None):
    if live_predictions_df is None:
        return []
    market_df = join_current_market(token, league_id, live_predictions_df)
    if market_df.empty:
        return []
    market_df = market_df.copy()
    market_df["mv"] = market_df["mv"].round(0)
    market_df["mv_change_yesterday"] = market_df["mv_change_yesterday"].round(0)
    market_df["mv_change_3d"] = market_df["mv_change_3d"].round(0)
    market_df["mv_trend_7d"] = (market_df["mv_trend_7d"] * 100).round(1)
    market_df["predicted_mv_target"] = market_df["predicted_mv_target"].round(0)
    market_df["position"] = market_df["position"].map(POSITION_LABELS).fillna(market_df["position"])
    if "s_11_prob" in market_df.columns:
        market_df["s_11_prob"] = market_df["s_11_prob"].round(3)

    records = df_records(market_df, {
        "player_id": "playerId",
        "first_name": "firstName",
        "last_name": "name",
        "position": "position",
        "team_name": "team",
        "mv": "marketValue",
        "mv_change_yesterday": "changeYesterday",
        "mv_change_3d": "changeLast3Days",
        "mv_trend_7d": "trendLast7DaysPercent",
        "p": "lastPoints",
        "mp": "lastMinutesPlayed",
        "predicted_mv_target": "predictedChange",
        "s_11_prob": "startElfProbability",
        "hours_to_exp": "hoursToExpiry",
        "expiring_today": "expiringToday",
    })

    if history_by_player:
        for entry in records:
            entry["history"] = history_by_player.get(history_key(entry.get("playerId")), [])
            entry["onMarket"] = True
    _attach_player_stats(records, player_stats)

    return records


def build_squad_records(token, league_id, live_predictions_df, history_by_player=None, manager_id=None, player_stats=None):
    """Baut die Kader-Empfehlung fuer EINEN Manager (oder fuer den
    eingeloggten Account selbst, wenn manager_id=None).

    Gibt bei jedem Fehler (z.B. Manager hat gar keinen Kader) einfach eine
    leere Liste zurueck statt abzustuerzen.
    """

    if live_predictions_df is None:
        return []
    try:
        squad_df = join_current_squad(token, league_id, live_predictions_df, manager_id=manager_id)
    except Exception as e:
        print(f"Info: Kader fuer Manager {manager_id or '(eigener Account)'} nicht abrufbar ({e}).")
        return []

    if squad_df.empty:
        return []

    squad_df = squad_df.copy()
    squad_df["mv"] = squad_df["mv"].round(0)
    squad_df["mv_change_yesterday"] = squad_df["mv_change_yesterday"].round(0)
    squad_df["mv_change_3d"] = squad_df["mv_change_3d"].round(0)
    squad_df["mv_trend_7d"] = (squad_df["mv_trend_7d"] * 100).round(1)
    squad_df["predicted_mv_target"] = squad_df["predicted_mv_target"].round(0)
    squad_df["position"] = squad_df["position"].map(POSITION_LABELS).fillna(squad_df["position"])
    if "s_11_prob" in squad_df.columns:
        squad_df["s_11_prob"] = squad_df["s_11_prob"].round(3)

    records = df_records(squad_df, {
        "player_id": "playerId",
        "first_name": "firstName",
        "last_name": "name",
        "position": "position",
        "team_name": "team",
        "mv": "marketValue",
        "mv_change_yesterday": "changeYesterday",
        "mv_change_3d": "changeLast3Days",
        "mv_trend_7d": "trendLast7DaysPercent",
        "p": "lastPoints",
        "mp": "lastMinutesPlayed",
        "predicted_mv_target": "predictedChange",
        "s_11_prob": "startElfProbability",
    })

    if history_by_player:
        for entry in records:
            entry["history"] = history_by_player.get(history_key(entry.get("playerId")), [])
            entry["inSquad"] = True
    _attach_player_stats(records, player_stats)

    return records


def build_manager_squads_payload(token, league_id, live_predictions_df, history_by_player=None, player_stats=None):
    """Kader-Empfehlungen fuer ALLE Manager der Liga auf einmal.

    So kann JEDER Manager (ueber seine bereits im Account zugeordnete
    Kickbase-ID, siehe Profile.jsx/KickbaseNameCard.jsx) personalisierte
    Empfehlungen fuer seinen eigenen Kader sehen - OHNE dass er dafuer seine
    eigenen Kickbase-Zugangsdaten hinterlegen muss. Es wird nur der EINE
    technische Account gebraucht, der die Liga sowieso schon verwaltet
    (KICKBASE_EMAIL/PASS).

    Ergebnis: (managers_list, squads_by_manager)
    - managers_list: [{"id": ..., "name": ...}, ...] - nuetzlich fuer's
      Frontend, um z.B. einen Auswahl-Dropdown zu bauen.
    - squads_by_manager: { "<managerId>": [ ...Kader-Spieler-Empfehlungen... ], ... }
      managerId entspricht exakt der Kickbase-ID, die auch in
      frontend/public/data.json (leagues[].users[].id) und damit in
      profile.kickbaseId in Firestore verwendet wird (beide stammen aus
      demselben /leagues/{id}/ranking-Endpoint).
    """

    if live_predictions_df is None:
        return [], {}

    try:
        managers = get_managers(token, league_id)
    except Exception as e:
        print(f"Warning: Manager-Liste fuer Kader-Empfehlungen fehlgeschlagen: {e}")
        return [], {}

    squads_by_manager = {}
    for manager_name, manager_id in managers:
        records = build_squad_records(token, league_id, live_predictions_df, history_by_player, manager_id=manager_id, player_stats=player_stats)
        if records:
            squads_by_manager[str(manager_id)] = records

    print(f"Kader-Empfehlungen fuer {len(squads_by_manager)} von {len(managers)} Managern erzeugt.")
    managers_list = [{"id": str(manager_id), "name": manager_name} for manager_name, manager_id in managers]
    return managers_list, squads_by_manager


def build_all_players_payload(live_predictions_df, history_by_player=None, player_stats=None):
    """Komplette, durchsuchbare Vorhersage-Liste ALLER Spieler des Wettbewerbs
    (nicht nur der aktuell auf einem Liga-Markt gelisteten). Damit koennen
    Admins selbst nach beliebigen Spielern suchen/filtern, auch wenn diese
    gerade bei niemandem auf dem Markt stehen.
    """

    if live_predictions_df is None or live_predictions_df.empty:
        return []

    df = live_predictions_df.copy()
    df["mv"] = df["mv"].round(0)
    df["mv_change_1d"] = df["mv_change_1d"].round(0)
    df["mv_change_3d"] = df["mv_change_3d"].round(0)
    df["mv_trend_7d"] = (df["mv_trend_7d"] * 100).round(1)
    df["predicted_mv_target"] = df["predicted_mv_target"].round(0)
    df["position"] = df["position"].map(POSITION_LABELS).fillna(df["position"])

    records = df_records(df, {
        "player_id": "playerId",
        "first_name": "firstName",
        "last_name": "name",
        "position": "position",
        "team_name": "team",
        "mv": "marketValue",
        "mv_change_1d": "changeYesterday",
        "mv_change_3d": "changeLast3Days",
        "mv_trend_7d": "trendLast7DaysPercent",
        "p": "lastPoints",
        "mp": "lastMinutesPlayed",
        "predicted_mv_target": "predictedChange",
    })

    if history_by_player:
        for entry in records:
            entry["history"] = history_by_player.get(history_key(entry.get("playerId")), [])
    _attach_player_stats(records, player_stats)

    return records


def get_configured_accounts():
    """Liest ALLE hinterlegten Kickbase-Accounts aus den Umgebungsvariablen.

    Es gibt (wie im bestehenden Node-Backend, siehe backend/kickbase.js)
    potenziell ZWEI Accounts: den primaeren (KICKBASE_EMAIL/PASS) und einen
    zweiten (KICKBASE_EMAIL_2/PASS_2, z.B. aus der alten Qualigruppen-Saison).
    Der Advisor muss in JEDEM davon nach der Ziel-Liga suchen, nicht nur im
    ersten - sonst wird eine Liga, die nur im zweiten Account existiert, nie
    gefunden.
    """

    accounts = []
    email1 = env_or_default("KICKBASE_EMAIL", None)
    pass1 = env_or_default("KICKBASE_PASS", None)
    if email1 and pass1:
        accounts.append((email1, pass1))

    email2 = env_or_default("KICKBASE_EMAIL_2", None)
    pass2 = env_or_default("KICKBASE_PASS_2", None)
    if email2 and pass2:
        accounts.append((email2, pass2))

    return accounts


def login_all_accounts():
    """Loggt sich in JEDEN konfigurierten Account ein und listet dessen Ligen auf."""

    sessions = []
    for email, password in get_configured_accounts():
        try:
            token = login(email, password)
            leagues = get_leagues_infos(token)
            print(f"Account {email}: eingeloggt, Mitglied in {len(leagues)} Liga(s): {[l['name'] for l in leagues]}")
            sessions.append({"email": email, "token": token, "leagues": leagues})
        except Exception as e:
            print(f"Warning: Login fuer Account {email} fehlgeschlagen: {e}")

    return sessions


def find_league_across_accounts(sessions, name_needle):
    """Sucht eine Liga (Teilstring, case-insensitive) ueber ALLE eingeloggten Accounts hinweg."""

    needle = name_needle.lower()
    for session in sessions:
        for league in session["leagues"]:
            if needle in league["name"].lower():
                return session["token"], league["id"], session["email"]
    return None, None, None


def main():
    print("Logge bei Kickbase ein (alle konfigurierten Accounts)...")
    sessions = login_all_accounts()
    if not sessions:
        print("Kein Account konnte sich einloggen (KICKBASE_EMAIL/PASS fehlen oder Login fehlgeschlagen) - Abbruch.")
        sys.exit(1)

    all_known_leagues = sorted({l["name"] for s in sessions for l in s["leagues"]})

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "leagueStartDate": LEAGUE_START_DATE,
        "startBudget": START_BUDGET,
        "modelStats": None,
        "players": [],
        "leagues": {},
    }

    # ----------------- 1. Budgets pro Liga (unabhaengig vom ML-Modell) -----------------
    league_ids = {}
    league_tokens = {}
    for league_def in LEAGUE_DEFS:
        key, name = league_def["key"], league_def["name"]
        token, league_id, owner_email = find_league_across_accounts(sessions, name)

        if not league_id:
            print(f"Warning: Keine Liga mit Namen '{name}' in irgendeinem Account gefunden. "
                  f"Verfuegbare Ligen ueber alle Accounts: {all_known_leagues}")
            result["leagues"][key] = {"name": name, "budgets": [], "marketRecommendations": [], "managers": [], "managerSquads": {}}
            continue

        print(f"Liga '{name}' gefunden (Account {owner_email}, ID {league_id}). Berechne Budgets fuer {key}...")
        league_ids[key] = league_id
        league_tokens[key] = token
        try:
            budgets = build_budgets_payload(token, league_id)
        except Exception as e:
            print(f"Warning: Budgets fuer {key} fehlgeschlagen: {e}")
            budgets = []

        result["leagues"][key] = {"name": name, "budgets": budgets, "marketRecommendations": [], "managers": [], "managerSquads": {}}

    # ----------------- 2. EIN ML-Modell fuer Marktwert-Vorhersagen (liga-uebergreifend) -----------------
    # Fuer die Spieler-/Marktwert-Historie reicht IRGENDEIN eingeloggter Account
    # (das sind oeffentliche Wettbewerbs-Daten, keine liga-spezifischen).
    primary_token = sessions[0]["token"]
    live_predictions_df = None
    history_by_player = {}
    player_stats = {}
    try:
        print("Lade Spielerdaten (Marktwert- + Performance-Historie)...")
        player_df = fetch_player_data(primary_token, COMPETITION_IDS, LAST_MV_VALUES, LAST_PFM_VALUES)

        if player_df.empty:
            print("Warning: Keine Spielerdaten erhalten, ueberspringe Marktwert-Vorhersagen.")
        else:
            history_by_player = build_history_by_player(player_df)
            player_stats = build_player_stats(player_df)

            proc_df, today_df = preprocess_player_data(player_df)
            X_train, X_test, y_train, y_test = split_data(proc_df, FEATURES, TARGET)

            print(f"Trainiere Modell auf {len(X_train)} Datenpunkten...")
            model = train_model(X_train, y_train)
            signs_percent, rmse, mae, r2 = evaluate_model(model, X_test, y_test)
            result["modelStats"] = {
                "signsCorrectPercent": round(float(signs_percent), 1),
                "rmse": round(float(rmse), 0),
                "mae": round(float(mae), 0),
                "r2": round(float(r2), 3),
                "trainSamples": int(len(X_train)),
                "testSamples": int(len(X_test)),
            }
            print(f"Modell-Guete: {signs_percent:.1f}% Richtungstreffer, R2={r2:.3f}")

            live_predictions_df = live_data_predictions(today_df, model, FEATURES)
            print(f"Baue durchsuchbare Spieler-Datenbank ({len(live_predictions_df)} Spieler)...")
            result["players"] = build_all_players_payload(live_predictions_df, history_by_player, player_stats)
    except Exception as e:
        print(f"Warning: Marktwert-Vorhersage-Pipeline fehlgeschlagen: {e}")

    # ----------------- 3. Marktwert-Vorhersagen mit dem Transfermarkt jeder Liga verknuepfen -----------------
    if live_predictions_df is not None:
        for league_def in LEAGUE_DEFS:
            key = league_def["key"]
            league_id = league_ids.get(key)
            token = league_tokens.get(key)
            if not league_id or not token:
                continue
            try:
                print(f"Erzeuge Markt-Empfehlungen fuer {key}...")
                result["leagues"][key]["marketRecommendations"] = build_market_payload(token, league_id, live_predictions_df, history_by_player, player_stats)
            except Exception as e:
                print(f"Warning: Markt-Empfehlungen fuer {key} fehlgeschlagen: {e}")

            # Kader-Empfehlungen fuer ALLE Manager der Liga - funktioniert mit
            # nur EINEM technischen Account (siehe Docstring von
            # build_manager_squads_payload). Kein manueller Login der
            # einzelnen Manager noetig.
            print(f"Erzeuge Kader-Empfehlungen fuer alle Manager in {key}...")
            managers_list, squads_by_manager = build_manager_squads_payload(token, league_id, live_predictions_df, history_by_player, player_stats)
            result["leagues"][key]["managers"] = managers_list
            result["leagues"][key]["managerSquads"] = squads_by_manager

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\nFertig. Ergebnis gespeichert unter: {os.path.abspath(OUTPUT_PATH)}")


if __name__ == "__main__":
    main()
