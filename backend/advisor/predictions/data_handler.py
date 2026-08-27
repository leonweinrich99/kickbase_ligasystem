from kickbase_api.player import get_all_players_raw, get_player_info, get_player_market_value, get_player_performance
from datetime import datetime
import concurrent.futures
import pandas as pd

# Angepasste Version von features/predictions/data_handler.py: Statt in eine
# lokale SQLite-Datei zu schreiben (die im Original-Repo ins Git-Repo
# eingecheckt wird - fuer unsere CI-Umgebung unpassend, da jeder Actions-Lauf
# in einer frischen VM ohne persistenten Zustand startet), wird alles direkt
# in einem pandas DataFrame im Arbeitsspeicher gehalten. Das Original-Tool
# ludt ohnehin bei JEDEM Lauf komplett neu (siehe dortiger Kommentar
# "Due to some issues with the data, we always reload for now"), es geht also
# kein Caching-Vorteil verloren.

# Kandidaten fuer den aktuellen Marktwert direkt aus der Kader-/Team-Liste
# (teamprofile-Endpoint) - als Fallback, wenn die dedizierte Marktwert-
# HISTORIE (noch) komplett leer ist (brandneuer Spieler/frischer Transfer).
# Genau EIN Datenpunkt reicht, damit der Spieler ueberhaupt in der
# Datenbank auftaucht, statt komplett zu fehlen.
MV_FALLBACK_FIELDS = ["mv", "marketValue", "curVal"]


def fetch_player_data(token, competition_ids, last_mv_values, last_pfm_values, max_workers=12):
    """Fetch market-value + performance history for all players of the given competitions."""

    all_competitions_dfs = []

    for competition_id in competition_ids:
        raw_players = get_all_players_raw(token, competition_id)
        players = [p["i"] for p in raw_players if "i" in p]
        roster_by_id = {p["i"]: p for p in raw_players if "i" in p}
        # Diagnose: falls ein einzelner Spieler in der App fehlt, hilft dieser
        # Zaehler zu unterscheiden zwischen "steht noch gar nicht in Kickbases
        # eigener Kader-Liste" (Zahl zu niedrig) und "steht drin, faellt aber
        # spaeter in der Pipeline raus" (siehe fallback_value-Logs unten).
        print(f"Competition {competition_id}: {len(players)} Spieler in der Kader-Liste gefunden.")

        def process_player(player_id):
            try:
                player_info = get_player_info(token, competition_id, player_id)
                player_team_id = player_info["team_id"]
                player_df = pd.DataFrame([player_info])

                mv_df = pd.DataFrame(get_player_market_value(token, competition_id, player_id, last_mv_values))
                if mv_df.empty:
                    # Brandneuer Spieler (z.B. frischer Transfer) - Kickbase hat
                    # noch keine Marktwert-HISTORIE fuer ihn. Falls die Kader-
                    # Liste trotzdem einen aktuellen Wert liefert, nutzen wir
                    # den als einzelnen Startpunkt, statt den Spieler komplett
                    # zu verwerfen.
                    roster_entry = roster_by_id.get(player_id, {})
                    fallback_value = next(
                        (roster_entry[f] for f in MV_FALLBACK_FIELDS if roster_entry.get(f)),
                        None
                    )
                    if fallback_value:
                        mv_df = pd.DataFrame([{"mv": fallback_value, "date": datetime.now().date().isoformat()}])
                        print(f"Info: Spieler {player_id} hat noch keine Marktwert-Historie, nutze aktuellen Wert {fallback_value} aus der Kader-Liste als Startpunkt.")
                    else:
                        # Diagnose fuer den Fall, dass MV_FALLBACK_FIELDS noch
                        # nicht das richtige Kickbase-Feld trifft - zeigt die
                        # tatsaechlich vorhandenen Kader-Felder dieses Spielers,
                        # damit die Liste bei Bedarf ergaenzt werden kann
                        # (Latte-Lath-Fall: Spieler fehlte weiterhin trotz Fix).
                        print(f"Info: Spieler {player_id} hat weder Marktwert-Historie noch ein bekanntes Fallback-Feld ({MV_FALLBACK_FIELDS}) - wird uebersprungen. Verfuegbare Kader-Felder: {sorted(roster_entry.keys())}")

                if not mv_df.empty:
                    mv_df["date"] = pd.to_datetime(mv_df["date"])
                    mv_df = mv_df.sort_values("date")

                p_df = pd.DataFrame(get_player_performance(token, competition_id, player_id, last_pfm_values, player_team_id))
                if not p_df.empty:
                    p_df["date"] = pd.to_datetime(p_df["date"])
                    p_df = p_df.sort_values("date")
                else:
                    p_df = pd.DataFrame({"date": pd.to_datetime([])})
                p_df["date"] = p_df["date"].astype("datetime64[us]")

                merged_df = (
                    pd.merge_asof(mv_df, p_df, on="date", direction="backward")
                    if not mv_df.empty else pd.DataFrame()
                )

                if not p_df.empty and not mv_df.empty:
                    max_mv_date = mv_df["date"].max()
                    additional_p_df = p_df[p_df["date"] > max_mv_date]
                    merged_df = pd.concat([merged_df, additional_p_df], ignore_index=True)

                if not merged_df.empty:
                    merged_df = player_df.merge(merged_df, how="cross")
                    merged_df["competition_id"] = competition_id

                return merged_df
            except Exception as e:
                print(f"Warning: Skipping player {player_id}: {e}")
                return pd.DataFrame()

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            comp_dfs = list(executor.map(process_player, players))

        valid_dfs = [df.dropna(how="all", axis=1) for df in comp_dfs if df is not None and not df.empty]
        if valid_dfs:
            comp_final_df = pd.concat(valid_dfs, ignore_index=True)
            all_competitions_dfs.append(comp_final_df)

    if not all_competitions_dfs:
        return pd.DataFrame()

    final_df = pd.concat(all_competitions_dfs, ignore_index=True)

    if "k" in final_df.columns:
        final_df["k"] = final_df["k"].apply(
            lambda x: ",".join(map(str, x)) if isinstance(x, list) else (None if x is None else str(x))
        )

    return final_df
