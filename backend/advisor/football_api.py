import requests

# Client fuer die kostenlose API-Football-API (api-sports.io) - liefert
# Dinge, die Kickbase selbst NICHT hergibt: Tore/Vorlagen/Karten pro Saison
# und aktuelle Verletzungen/Sperren. Free-Tier: 100 Requests/Tag - wir
# fragen NICHT pro Spieler, sondern pro TEAM ab (liefert alle Spieler eines
# Teams auf einmal), das reicht fuer alle 18 Bundesliga-Teams x 2 Endpoints
# (Spieler-Stats + Verletzungen) = 36 Requests, weit unter dem Limit.

BASE_URL = "https://v3.football.api-sports.io"
BUNDESLIGA_LEAGUE_ID = 78  # stabile, oeffentlich dokumentierte API-Football-Liga-ID


def _headers(api_key):
    return {"x-apisports-key": api_key}


def get_bundesliga_teams(api_key, season):
    """Alle Teams der Bundesliga in der angegebenen Saison, mit API-Football-IDs.

    Wird genutzt, um Kickbase-Teamnamen per Fuzzy-Matching auf API-Football-
    Team-IDs abzubilden - bewusst KEINE fest einkodierte ID-Tabelle, da sich
    IDs fuer neu aufgestiegene Vereine (z.B. Elversberg, Paderborn) nicht
    zuverlaessig ohne Live-Abfrage verifizieren liessen.
    """

    resp = requests.get(
        f"{BASE_URL}/teams",
        headers=_headers(api_key),
        params={"league": BUNDESLIGA_LEAGUE_ID, "season": season},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return [
        {"id": item["team"]["id"], "name": item["team"]["name"]}
        for item in data.get("response", [])
    ]


def get_team_players(api_key, team_id, season):
    """Alle Spieler eines Teams inkl. Saison-Statistiken (Tore, Vorlagen,
    Karten, Einsaetze) - EIN Request pro Team statt pro Spieler."""

    resp = requests.get(
        f"{BASE_URL}/players",
        headers=_headers(api_key),
        params={"team": team_id, "season": season},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def get_team_injuries(api_key, team_id, season):
    """Aktuelle Verletzungen/Sperren eines Teams."""

    resp = requests.get(
        f"{BASE_URL}/injuries",
        headers=_headers(api_key),
        params={"team": team_id, "season": season},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()
