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

from kickbase_api.league import get_league_id
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

# ----------------- Liga-Auswahl -----------------
# WICHTIG: Vorerst laeuft der Advisor bewusst nur gegen die einzelne
# "test"-Liga, um das Feature risikofrei zu testen, bevor er auf die 3
# echten Ligen losgelassen wird. Einfach den Block unten zurueckwechseln,
# sobald alles wie gewuenscht funktioniert.
LEAGUE_DEFS = [
    {"key": "TEST", "name": os.getenv("KICKBASE_TEST_LEAGUE_NAME", "test")},
]

# Echte 3-Ligen-Konfiguration (nutzt dieselben Secrets/Variablen wie das
# bestehende Node-Backend, siehe backend/kickbase.js) - fuer spaeter:
# LEAGUE_DEFS = [
#     {"key": "LIGA1", "name": os.getenv("KICKBASE_LEAGUE_1_NAME", "Liga 1")},
#     {"key": "LIGA2", "name": os.getenv("KICKBASE_LEAGUE_2_NAME", "Liga 2")},
#     {"key": "LIGA3", "name": os.getenv("KICKBASE_LEAGUE_3_NAME", "Liga 3")},
# ]

LEAGUE_START_DATE = os.getenv("ADVISOR_LEAGUE_START_DATE", "2026-08-13")
START_BUDGET = int(os.getenv("ADVISOR_START_BUDGET", "50000000"))

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


def main():
    email = os.getenv("KICKBASE_EMAIL")
    password = os.getenv("KICKBASE_PASS")
    if not email or not password:
        print("KICKBASE_EMAIL / KICKBASE_PASS fehlen - Abbruch.")
        sys.exit(1)

    print("Logge bei Kickbase ein...")
    token = login(email, password)

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "leagueStartDate": LEAGUE_START_DATE,
        "startBudget": START_BUDGET,
        "modelStats": None,
        "leagues": {},
    }

    # ----------------- 1. Budgets pro Liga (unabhaengig vom ML-Modell) -----------------
    league_ids = {}
    for league_def in LEAGUE_DEFS:
        key, name = league_def["key"], league_def["name"]
        try:
            league_id = get_league_id(token, name)
            league_ids[key] = league_id
            print(f"Berechne Budgets fuer {key} ('{name}')...")
            budgets = build_budgets_payload(token, league_id)
        except Exception as e:
            print(f"Warning: Budgets fuer {key} fehlgeschlagen: {e}")
            budgets = []

        result["leagues"][key] = {"name": name, "budgets": budgets, "marketRecommendations": []}

    # ----------------- 2. EIN ML-Modell fuer Marktwert-Vorhersagen (liga-uebergreifend) -----------------
    live_predictions_df = None
    try:
        print("Lade Spielerdaten (Marktwert- + Performance-Historie)...")
        player_df = fetch_player_data(token, COMPETITION_IDS, LAST_MV_VALUES, LAST_PFM_VALUES)

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
            if not league_id:
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
