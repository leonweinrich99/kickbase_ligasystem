from kickbase_api.league import get_league_players_on_market
from kickbase_api.user import get_players_in_squad
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import pandas as pd
import numpy as np

# Angepasste Version von features/predictions/predictions.py.
# join_current_market wird fuer JEDE Liga einzeln aufgerufen (jede Liga hat
# ihren eigenen Transfermarkt). join_current_squad ist wieder ergaenzt
# (fuer Testzwecke in der einzelnen "test"-Liga, siehe Warnhinweis dort in
# run_advisor.py::build_squad_payload) - der Bot-Account entspricht sonst
# keinem der 27 echten Kickbase-Manager, eine "Kader-Empfehlung" fuer genau
# diesen einen Account waere fuer alle anderen Nutzer irrefuehrend.


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


def join_current_squad(token, league_id, today_df_results):
    """Join the live predictions with the players currently in the squad of
    the account behind `token`, for ONE league. Siehe Warnhinweis in
    run_advisor.py::build_squad_payload - nur fuer Test-Zwecke gedacht.
    """

    squad_players = get_players_in_squad(token, league_id)
    squad_df = pd.DataFrame(squad_players.get("it", []))

    if squad_df.empty:
        return pd.DataFrame(columns=[
            "player_id", "first_name", "last_name", "position", "team_name", "mv", "mv_change_yesterday",
            "predicted_mv_target", "s_11_prob",
        ])

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
