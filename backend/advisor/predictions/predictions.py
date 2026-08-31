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


def live_data_predictions(today_df, model, model_3d, model_7d, features):
    """Make live data predictions for today_df using the trained models for 1, 3 and 7 days."""

    today_df_features = today_df[features]
    today_df_results = today_df.copy()

    today_df_results["predicted_mv_target"] = np.round(model.predict(today_df_features), 2)
    today_df_results["predicted_mv_target_3d"] = np.round(model_3d.predict(today_df_features), 2) if model_3d else 0
    today_df_results["predicted_mv_target_7d"] = np.round(model_7d.predict(today_df_features), 2) if model_7d else 0
    
    today_df_results = today_df_results.sort_values("predicted_mv_target", ascending=False)

    today_df_results = today_df_results.dropna(subset=["mv"])
    
    # "image_path" unbedingt durchschleifen, sonst crasht df_records spaeter!
    cols_to_keep = [
        "player_id", "first_name", "last_name", "position", "team_name",
        "date", "mv_change_1d", "mv_trend_1d", "mv_change_3d", "mv_trend_7d",
        "mv", "predicted_mv_target", "predicted_mv_target_3d", "predicted_mv_target_7d", "p", "mp",
    ]
    if "image_path" in today_df_results.columns:
        cols_to_keep.append("image_path")
        
    today_df_results = today_df_results[cols_to_keep]

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


# Kickbase liefert bei Kader- UND Markt-Eintraegen denselben reichen
# "Spielerkarten"-Feldsatz (per offizieller API-Doku-Beispiel bestaetigt,
# siehe kickbase_api/league.py). Diese Zusatzfelder werden - wo vorhanden -
# immer mitgenommen:
#   st    = Spielerstatus (0 = fit, siehe STATUS_LABELS in run_advisor.py)
#   ap    = Saison-Einsaetze laut Kickbase selbst
#   mvgl  = Gesamt-Marktwertveraenderung (seit Kauf/Saisonbeginn)
#   mvt   = Marktwert-Trendrichtung (Kickbase-interner Code)
#   iotm  = "In team of the matchday" - Team-der-Woche-Ehrung (bool)
#   pim   = Pfad zum Spielerbild (relativ, Basis-URL im Frontend ergaenzt)
CONTEXT_EXTRA_FIELDS = ["st", "ap", "mvgl", "mvt", "iotm", "pim"]


def _prepare_context_df(raw_list, debug_label=""):
    """Baut aus einer rohen Kickbase-Spieler-Liste (Kader- ODER Markt-Antwort)
    ein DataFrame mit normalisierter ID-Spalte ("i") und umbenannten
    kollisionstraechtigen Feldern - wird von join_current_squad und
    join_current_market gemeinsam genutzt, da beide Endpoints denselben
    Feldsatz liefern.
    """

    df = pd.DataFrame(raw_list)
    if df.empty:
        return df

    # Kickbase nennt das Spieler-ID-Feld je nach Endpoint unterschiedlich:
    # "i" beim eigenen Kader/Markt, aber "pi" (=player id) beim
    # Manager-Kader-Endpoint (per Debug-Log am 13.08.2026 bestaetigt).
    id_column = next((c for c in ["i", "id", "pid", "pi"] if c in df.columns), None)
    if id_column is None:
        print(f"Warning: Kein bekanntes ID-Feld gefunden {debug_label}, vorhandene Spalten: {list(df.columns)}")
        return pd.DataFrame()
    if id_column != "i":
        df = df.rename(columns={id_column: "i"})

    # "p"/"mv" kollidieren mit gleichnamigen Feldern aus den Live-Vorhersagen
    # (today_df_results) - beim Merge zweier Dataframes mit gleichnamigen
    # Nicht-Key-Spalten haengt pandas STILLSCHWEIGEND "_x"/"_y" an, wodurch
    # die urspruengliche Spalte verschwindet (das war der Bug hinter
    # "['mv'] not in index"). "p" (Kader-/Markt-eigene Gesamtpunkte) wird
    # umbenannt statt verworfen, "mv" (ggf. veralteter Snapshot) wird
    # verworfen - unsere eigene, aktuellere "mv" aus den Live-Vorhersagen
    # ist ohnehin verlaesslicher.
    if "p" in df.columns:
        df = df.rename(columns={"p": "season_points"})

    keep = ["i"] + [c for c in CONTEXT_EXTRA_FIELDS if c in df.columns]
    if "season_points" in df.columns:
        keep.append("season_points")
    for market_only_field in ["prob", "exs"]:
        if market_only_field in df.columns:
            keep.append(market_only_field)

    return df[keep]


_BASE_RESULT_COLUMNS = [
    "player_id", "first_name", "last_name", "position", "team_name", "mv", "mv_change_yesterday",
    "mv_change_3d", "mv_trend_7d", "p", "mp", "predicted_mv_target", "predicted_mv_target_3d", "predicted_mv_target_7d", "s_11_prob", "status",
    "season_appearances", "season_points", "total_value_change", "trend_direction",
    "team_of_the_week", "image_path",
]

_CONTEXT_RENAME_MAP = {
    "mv_change_1d": "mv_change_yesterday",
    "prob": "s_11_prob",
    "st": "status",
    "ap": "season_appearances",
    "mvgl": "total_value_change",
    "mvt": "trend_direction",
    "iotm": "team_of_the_week",
    # "pim": "image_path",  # Nutze stattdessen image_path aus data_handler (profileBig)
}


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

    squad_df = _prepare_context_df(raw_squad, debug_label=f"(Kader, manager_id={manager_id})")
    if squad_df.empty:
        return pd.DataFrame(columns=_BASE_RESULT_COLUMNS)

    # BUGFIX: Die Kickbase-API liefert die Spieler-ID im Squad-Endpoint als
    # STRING (z.B. "i": "118"), waehrend sie an anderer Stelle in unserer
    # Pipeline als Zahl vorliegen kann. pd.merge() matcht dann STILLSCHWEIGEND
    # NICHTS (0 Zeilen, kein Fehler) - deshalb beide Seiten explizit auf
    # denselben String-Typ bringen, bevor gemerged wird.
    today_df_results = today_df_results.copy()
    today_df_results["player_id"] = today_df_results["player_id"].astype(str)

    # WICHTIGER BUGFIX: how="left" statt "inner"!
    # Eingefrorene Spieler (wie Wechsel ins Ausland/3. Liga) fehlen oft in den 
    # Team-Profilen und damit im today_df_results. Ein "inner" Join loescht 
    # diese Spieler klammheimlich aus dem Kader des Managers!
    merged_squad_df = pd.merge(
        squad_df,
        today_df_results,
        left_on="i",
        right_on="player_id",
        how="left"
    )

    # Da "left" join, koennen Prognose-Werte nun NaN sein fuer eingefrorene Spieler.
    # Wir fuellen numerische Werte mit 0.
    numeric_cols = ["mv", "predicted_mv_target", "predicted_mv_target_3d", "predicted_mv_target_7d", "total_value_change", "p", "season_points"]
    for col in numeric_cols:
        if col in merged_squad_df.columns:
            merged_squad_df[col] = merged_squad_df[col].fillna(0)
    
    if "first_name" not in merged_squad_df.columns or "last_name" not in merged_squad_df.columns:
        if "first_name_x" in merged_squad_df.columns:
            merged_squad_df["first_name"] = merged_squad_df["first_name_x"].fillna("")
            merged_squad_df["last_name"] = merged_squad_df["last_name_x"].fillna("")
            # Clean up suffixes
            merged_squad_df = merged_squad_df.drop(columns=[c for c in merged_squad_df.columns if c.endswith("_x") or c.endswith("_y")])

    merged_df = merged_squad_df.rename(columns=_CONTEXT_RENAME_MAP)
    merged_df["player_id"] = merged_df["player_id"].fillna(merged_df["i"])

    for col in _BASE_RESULT_COLUMNS:
        if col not in merged_df.columns:
            merged_df[col] = np.nan

    return merged_df[_BASE_RESULT_COLUMNS]


def join_current_market(token, league_id, today_df_results):
    """Join the live predictions with the current market data of ONE league to get bid recommendations."""

    players_on_market = get_league_players_on_market(token, league_id)
    market_df = _prepare_context_df(players_on_market, debug_label="(Markt)")

    result_columns = _BASE_RESULT_COLUMNS + ["hours_to_exp", "expiring_today"]

    if market_df.empty:
        return pd.DataFrame(columns=result_columns)

    # Gleicher Typ-Sicherheits-Fix wie in join_current_squad (siehe dort) -
    # verhindert stillschweigend leere Ergebnisse bei Zahl/String-Mismatch.
    today_df_results = today_df_results.copy()
    today_df_results["player_id"] = today_df_results["player_id"].astype(str)
    market_df["i"] = market_df["i"].astype(str)

    bid_df = pd.merge(today_df_results, market_df, left_on="player_id", right_on="i")

    if "exs" in bid_df.columns:
        bid_df["hours_to_exp"] = np.round((bid_df["exs"] / 3600), 2)
    else:
        bid_df["hours_to_exp"] = np.nan

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

    bid_df = bid_df.rename(columns=_CONTEXT_RENAME_MAP)

    for col in result_columns:
        if col not in bid_df.columns:
            bid_df[col] = np.nan

    return bid_df[result_columns]
