"""Orchestriert den Kickbase Trading Advisor fuer unser 3-Ligen-System.

Basierend auf https://github.com/LennardFe/Kickbase-Trading-Advisor (danke an
LennardFe fuer das Original-Tool!). Angepasst, um:
  - denselben Kickbase-Account/dieselben Secrets zu nutzen wie der Rest
    dieser App (KICKBASE_EMAIL, KICKBASE_PASS, KICKBASE_LEAGUE_1/2/3_NAME),
  - Budgets + Markt-Empfehlungen fuer ALLE 3 Ligen statt nur einer zu
    berechnen (das ML-Modell wird nur EINMAL trainiert und fuer alle 3
    Maerkte wiederverwendet - spart Laufzeit, die Marktwert-Entwicklung
    ist liga-unabhaengig),
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
from kickbase_api.user import login
from budgets import calc_manager_budgets
from predictions.data_handler import fetch_player_data
from predictions.preprocessing import preprocess_player_data, split_data
from predictions.modeling import train_model, evaluate_model
from predictions.predictions import live_data_predictions, join_current_market

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


def build_market_payload(token, league_id, live_predictions_df):
    if live_predictions_df is None:
        return []
    market_df = join_current_market(token, league_id, live_predictions_df)
    if market_df.empty:
        return []
    market_df = market_df.copy()
    market_df["mv"] = market_df["mv"].round(0)
    market_df["mv_change_yesterday"] = market_df["mv_change_yesterday"].round(0)
    market_df["predicted_mv_target"] = market_df["predicted_mv_target"].round(0)
    if "s_11_prob" in market_df.columns:
        market_df["s_11_prob"] = market_df["s_11_prob"].round(3)
    return df_records(market_df, {
        "last_name": "name",
        "team_name": "team",
        "mv": "marketValue",
        "mv_change_yesterday": "changeYesterday",
        "predicted_mv_target": "predictedChange",
        "s_11_prob": "startElfProbability",
        "hours_to_exp": "hoursToExpiry",
        "expiring_today": "expiringToday",
    })


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
            result["leagues"][key] = {"name": name, "budgets": [], "marketRecommendations": []}
            continue

        print(f"Liga '{name}' gefunden (Account {owner_email}, ID {league_id}). Berechne Budgets fuer {key}...")
        league_ids[key] = league_id
        league_tokens[key] = token
        try:
            budgets = build_budgets_payload(token, league_id)
        except Exception as e:
            print(f"Warning: Budgets fuer {key} fehlgeschlagen: {e}")
            budgets = []

        result["leagues"][key] = {"name": name, "budgets": budgets, "marketRecommendations": []}

    # ----------------- 2. EIN ML-Modell fuer Marktwert-Vorhersagen (liga-uebergreifend) -----------------
    # Fuer die Spieler-/Marktwert-Historie reicht IRGENDEIN eingeloggter Account
    # (das sind oeffentliche Wettbewerbs-Daten, keine liga-spezifischen).
    primary_token = sessions[0]["token"]
    live_predictions_df = None
    try:
        print("Lade Spielerdaten (Marktwert- + Performance-Historie)...")
        player_df = fetch_player_data(primary_token, COMPETITION_IDS, LAST_MV_VALUES, LAST_PFM_VALUES)

        if player_df.empty:
            print("Warning: Keine Spielerdaten erhalten, ueberspringe Marktwert-Vorhersagen.")
        else:
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
                result["leagues"][key]["marketRecommendations"] = build_market_payload(token, league_id, live_predictions_df)
            except Exception as e:
                print(f"Warning: Markt-Empfehlungen fuer {key} fehlgeschlagen: {e}")

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\nFertig. Ergebnis gespeichert unter: {os.path.abspath(OUTPUT_PATH)}")


if __name__ == "__main__":
    main()
