from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import pandas as pd
import numpy as np

# Unveraendert von features/predictions/preprocessing.py aus dem Original-Tool
# uebernommen - reine Datenaufbereitung/Feature-Engineering, keine
# Kickbase-Login-spezifische Logik.


def preprocess_player_data(df):
    """Preprocess the player data for modeling."""

    df = df.sort_values(["player_id", "date"])
    # team_id ist das AKTUELLE Team des Spielers (frisch bei jedem Lauf
    # abgefragt), t1/t2 stammen dagegen aus der beim jeweiligen Datum
    # gemergten Performance-Zeile - fuer HISTORISCHE Zeilen vor einem
    # Vereinswechsel ist das voellig korrekt sein altes Team, nicht das
    # aktuelle. Ohne die vierte Bedingung ("mv" vorhanden) wurden dadurch
    # praktisch ALLE Marktwert-Zeilen eines waehrend der Saison gewechselten
    # Spielers verworfen (Bug-Fall "Latte Lath": 365 von 366 Zeilen weg,
    # nur eine wertlose Zukunfts-Zeile mit mv=NaN blieb uebrig - live per
    # Debug-Log bestaetigt, Fix erhoehte die Spieler-Datenbank von 403 auf
    # 472 Eintraege, betraf also alle Vereinswechsler dieser Saison). Eine
    # echte Marktwert-Zeile ist immer eigenstaendig gueltig, unabhaengig
    # davon, fuer welches Team der gemergte Performance-Kontext gerade steht.
    df = df[
        (df["team_id"] == df["t1"]) |
        (df["team_id"] == df["t2"]) |
        (df["t1"].isna() & df["t2"].isna()) |
        df["mv"].notna()
    ]

    df["date"] = pd.to_datetime(df["date"])
    df["md"] = pd.to_datetime(df["md"])

    df["next_day"] = df.groupby("player_id")["date"].shift(-1)
    df["next_md"] = df.groupby("player_id")["md"].transform(
        lambda x: x.shift(-1).where(x.shift(-1) != x).bfill()
    )
    df["days_to_next"] = (df["next_md"] - df["date"]).dt.days

    df["mv_next_day"] = df.groupby("player_id")["mv"].shift(-1)
    df["mv_target"] = df["mv_next_day"] - df["mv"]

    # Multi-day targets
    df["mv_next_3_days"] = df.groupby("player_id")["mv"].shift(-3)
    df["mv_target_3d"] = df["mv_next_3_days"] - df["mv"]
    
    df["mv_next_7_days"] = df.groupby("player_id")["mv"].shift(-7)
    df["mv_target_7d"] = df["mv_next_7_days"] - df["mv"]
    df = df[df["mv"] != 0.0]

    df["mv_change_1d"] = df["mv"] - df.groupby("player_id")["mv"].shift(1)
    df["mv_trend_1d"] = df.groupby("player_id")["mv"].pct_change(fill_method=None)
    df["mv_trend_1d"] = df["mv_trend_1d"].replace([np.inf, -np.inf], 0).fillna(0)

    df["mv_change_3d"] = df["mv"] - df.groupby("player_id")["mv"].shift(3)
    df["mv_vol_3d"] = df.groupby("player_id")["mv"].rolling(3).std().reset_index(0, drop=True)

    df["mv_trend_7d"] = df.groupby("player_id")["mv"].pct_change(periods=7, fill_method=None)
    df["mv_trend_7d"] = df["mv_trend_7d"].replace([np.inf, -np.inf], 0).fillna(0)

    df["market_divergence"] = (df["mv"] / df.groupby("md")["mv"].transform("mean")).rolling(3).mean()

    # Kalender-Features (Prototyp)
    df["month"] = df["date"].dt.month
    df["is_preseason"] = df["month"].isin([6, 7, 8]).astype(int)
    df["is_winter_break"] = df["month"].isin([12, 1]).astype(int)

    for target in ["mv_target", "mv_target_3d", "mv_target_7d"]:
        q1 = df[target].quantile(0.25)
        q3 = df[target].quantile(0.75)
        iqr = q3 - q1
        lower_bound = q1 - 2.5 * iqr
        upper_bound = q3 + 2.5 * iqr
        
        clipped_col = "mv_target_clipped" if target == "mv_target" else f"{target}_clipped"
        df[clipped_col] = df[target].clip(lower_bound, upper_bound)

    df = df.fillna({
        "market_divergence": 1,
        "mv_change_3d": 0,
        "mv_vol_3d": 0,
        "p": 0,
        "ppm": 0,
        "won": -1,
        # Brandneue Spieler (genau 1 Datenpunkt, z.B. per Fallback-Marktwert
        # aus der Kader-Liste eingefuegt, siehe data_handler.py) haben noch
        # keinen Vortageswert bzw. kein bekanntes naechstes Spiel - ohne
        # dieses Fallback wuerde model.predict() spaeter mit NaN abstuerzen
        # (fuer den GESAMTEN Batch, nicht nur diesen einen Spieler!).
        "mv_change_1d": 0,
        "days_to_next": 0,
    })

    now = datetime.now(ZoneInfo("Europe/Berlin"))
    cutoff_time = now.replace(hour=22, minute=15, second=0, microsecond=0)
    max_date = (now - timedelta(days=1)) if now <= cutoff_time else now
    max_date = max_date.date()

    today_df = df[df["date"].dt.date >= max_date]
    df = df[df["date"].dt.date < max_date]

    df = df.dropna(subset=["mv_change_1d", "next_day", "next_md", "days_to_next", "mv_next_day", "mv_target", "mv_target_clipped", "mv_target_3d_clipped", "mv_target_7d_clipped"])

    return df, today_df


def split_data(df, features, target):
    """Split the data into training and testing sets based on date to avoid data leakage."""

    df = df.sort_values("date").reset_index(drop=True)

    split_idx = int(len(df) * 0.75)
    split_date = df["date"].iloc[split_idx]

    train = df[df["date"] < split_date]
    test = df[df["date"] >= split_date]

    return train[features], test[features], train[target], test[target]
