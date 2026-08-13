from kickbase_api.league import get_league_players_on_market
from kickbase_api.user import get_players_in_squad
from kickbase_api.manager import get_manager_squad
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import pandas as pd
import numpy as np

# Angepasste Version von features/predictions/predictions.py.
# join_current_market wird fuer JEDE Liga einzeln aufgerufen (jede Liga hat
# ihren eigenen Transfermarkt). join_current_squad kann sowohl den Kader des
# eingeloggten Accounts ("meinen eigenen") als auch - ueber den
# manager_id-Parameter - den Kader JEDES ANDEREN Managers in der Liga
# abrufen. Das erlaubt personalisierte Kader-Empfehlungen fuer ALLE
# Kickbase-Manager, obwohl nur EIN technischer Account (der die Liga
# verwaltet) eingeloggt ist - niemand muss dafuer seine eigenen
# Kickbase-Zugangsdaten hinterlegen.


def live_data_predictions(today_df, model, features):
    """Make live data predictions for today_df using the trained model."""

    today_df_features = today_df[features]
    today_df_results = today_df.copy()

    today_df_results["predicted_mv_target"] = np.round(model.predict(today_df_features), 2)
    today_df_results = today_df_results.sort_values("predicted_mv_target", ascending=False)

    today_df_results = today_df_results.dropna(subset=["mv"])
    today_df_results = today_df_results[[
        "player_id", "first_name", "last_name", "position", "team_name",
        "date", "mv_change_1d", "mv_trend_1d", "mv", "predicted_mv_target",
    ]]

    return today_df_results


def _extract_squad_list(squad_players, debug_label=""):
    """Extrahiert die Spieler-Liste robust aus der Kader-API-Antwort.

    Der "eigener Kader"-Endpoint (/leagues/{id}/squad) verwendet den Schluessel
    "it". Der "Manager-Kader"-Endpoint (/leagues/{id}/managers/{id}/squad) ist
    in der offiziellen API-Doku nicht mit Beispiel-JSON belegt - falls er eine
    andere Huelle nutzt, hier defensiv mehrere ueblich Kickbase-Schluessel
    probieren, statt still eine leere Liste zurueckzugeben.
    """

    if isinstance(squad_players, list):
        return squad_players
    if isinstance(squad_players, dict):
        for key in ("it", "pl", "players", "squad"):
            value = squad_players.get(key)
            if isinstance(value, list):
                return value
        print(f"Warning: Kader-Antwort {debug_label} hat unerwartete Struktur, Schluessel: {list(squad_players.keys())}")
    return []


def join_current_squad(token, league_id, today_df_results, manager_id=None):
    """Join the live predictions with the players currently in a squad.

    Ohne `manager_id`: Kader des eingeloggten Accounts selbst (Endpoint
    `/leagues/{id}/squad`). Mit `manager_id`: Kader des angegebenen Managers
    (Endpoint `/leagues/{id}/managers/{managerId}/squad`) - so lassen sich
    mit einem einzigen Login personalisierte Kader-Empfehlungen fuer JEDEN
    Manager der Liga erzeugen.
    """

    if manager_id is not None:
        squad_players = get_manager_squad(token, league_id, manager_id)
    else:
        squad_players = get_players_in_squad(token, league_id)
    raw_squad = _extract_squad_list(squad_players, debug_label=f"(manager_id={manager_id})")
    squad_df = pd.DataFrame(raw_squad)

    if squad_df.empty:
        return pd.DataFrame(columns=[
            "player_id", "first_name", "last_name", "position", "team_name", "mv", "mv_change_yesterday",
            "predicted_mv_target", "s_11_prob",
        ])

    # Manche Kickbase-Endpoints nennen das Spieler-ID-Feld "i", andere ggf.
    # "id"/"pid" - robust die erste vorhandene Variante nehmen, statt fest
    # von "i" auszugehen (der Manager-Kader-Endpoint ist in der API-Doku
    # nicht mit einem Beispiel belegt, daher unklar, ob er identisch heisst).
    id_column = next((c for c in ["i", "id", "pid"] if c in squad_df.columns), None)
    if id_column is None:
        print(f"Warning: Kein bekanntes ID-Feld im Kader gefunden (manager_id={manager_id}), "
              f"vorhandene Spalten: {list(squad_df.columns)}")
        return pd.DataFrame(columns=[
            "player_id", "first_name", "last_name", "position", "team_name", "mv", "mv_change_yesterday",
            "predicted_mv_target", "s_11_prob",
        ])
    if id_column != "i":
        squad_df = squad_df.rename(columns={id_column: "i"})

    # BUGFIX: Die Kickbase-API liefert die Spieler-ID im Squad-Endpoint als
    # STRING (z.B. "i": "118"), waehrend sie an anderer Stelle in unserer
    # Pipeline als Zahl vorliegen kann. pd.merge() matcht dann STILLSCHWEIGEND
    # NICHTS (0 Zeilen, kein Fehler) - deshalb beide Seiten explizit auf
    # denselben String-Typ bringen, bevor gemerged wird.
    today_df_results = today_df_results.copy()
    today_df_results["player_id"] = today_df_results["player_id"].astype(str)
    squad_df["i"] = squad_df["i"].astype(str)

    # BUGFIX 2: Die Squad-API liefert selbst schon ein Feld "mv" (eigener,
    # ggf. veralteter Marktwert) UND wir haben "mv" bereits aus den
    # Live-Vorhersagen (today_df_results). Beim Merge zweier Dataframes mit
    # gleichnamigen Nicht-Key-Spalten haengt pandas STILLSCHWEIGEND "_x"/"_y"
    # an ("mv" existiert danach nicht mehr!) - das fuehrte zum Fehler
    # "['mv'] not in index" beim finalen Spalten-Select. Fix: aus squad_df nur
    # die Join-Spalte ("i") und ggf. "prob" behalten, alles andere kommt
    # ohnehin aus den (aktuelleren) Live-Vorhersagen.
    squad_columns_to_keep = [c for c in ["i", "prob"] if c in squad_df.columns]
    squad_df = squad_df[squad_columns_to_keep]

    merged_df = pd.merge(today_df_results, squad_df, left_on="player_id", right_on="i").drop(columns=["i"])

    if "prob" not in merged_df.columns:
        merged_df["prob"] = np.nan
    merged_df = merged_df.rename(columns={"prob": "s_11_prob"})
    merged_df = merged_df.rename(columns={"mv_change_1d": "mv_change_yesterday"})

    return merged_df[[
        "player_id", "first_name", "last_name", "position", "team_name", "mv", "mv_change_yesterday",
        "predicted_mv_target", "s_11_prob",
    ]]


def join_current_market(token, league_id, today_df_results):
    """Join the live predictions with the current market data of ONE league to get bid recommendations."""

    players_on_market = get_league_players_on_market(token, league_id)
    market_df = pd.DataFrame(players_on_market)

    if market_df.empty:
        return pd.DataFrame(columns=[
            "player_id", "first_name", "last_name", "position", "team_name", "mv", "mv_change_yesterday",
            "predicted_mv_target", "s_11_prob", "hours_to_exp", "expiring_today",
        ])

    # Gleicher Typ-Sicherheits-Fix wie in join_current_squad (siehe dort) -
    # verhindert stillschweigend leere Ergebnisse bei Zahl/String-Mismatch.
    today_df_results = today_df_results.copy()
    today_df_results["player_id"] = today_df_results["player_id"].astype(str)
    market_df["id"] = market_df["id"].astype(str)

    bid_df = pd.merge(today_df_results, market_df, left_on="player_id", right_on="id").drop(columns=["id"])

    bid_df["hours_to_exp"] = np.round((bid_df["exp"] / 3600), 2)

    now = datetime.now(ZoneInfo("Europe/Berlin"))
    next_22 = now.replace(hour=22, minute=0, second=0, microsecond=0)
    if next_22 <= now:
        next_22 += timedelta(days=1)
    diff = np.round((next_22 - now).total_seconds() / 3600, 2)

    bid_df["expiring_today"] = bid_df["hours_to_exp"] < diff

    # KEIN Mindest-Schwellenwert mehr (frueher > 5000) - die komplette Liste
    # aller aktuell auf dem Markt stehenden Spieler wird zurueckgegeben,
    # Filterung/Sortierung passiert im Frontend (mehr Empfehlungen + eigene
    # Filteroptionen fuer die Nutzer:innen).
    bid_df = bid_df.sort_values("predicted_mv_target", ascending=False)

    if "prob" not in bid_df.columns:
        bid_df["prob"] = np.nan
    bid_df = bid_df.rename(columns={"prob": "s_11_prob"})
    bid_df = bid_df.rename(columns={"mv_change_1d": "mv_change_yesterday"})

    return bid_df[[
        "player_id", "first_name", "last_name", "position", "team_name", "mv", "mv_change_yesterday",
        "predicted_mv_target", "s_11_prob", "hours_to_exp", "expiring_today",
    ]]
