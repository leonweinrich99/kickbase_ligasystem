import json

import requests

# Client fuer die kostenlose API-Football-API (api-sports.io) - liefert
# Dinge, die Kickbase selbst NICHT hergibt: Tore/Vorlagen/Karten pro Saison
# und aktuelle Verletzungen/Sperren. Free-Tier: 100 Requests/Tag - wir
# fragen NICHT pro Spieler, sondern pro TEAM ab (liefert alle Spieler eines
# Teams auf einmal), das reicht fuer alle 18 Bundesliga-Teams x 2 Endpoints
# (Spieler-Stats + Verletzungen) = 36 Requests, weit unter dem Limit.

BASE_URL = "https://v3.football.api-sports.io"


def _headers(api_key):
    return {"x-apisports-key": api_key}


def _log_api_errors(context, data):
    """API-Football antwortet bei Plan-/Rate-Limit-/Parameter-Problemen oft
    trotzdem mit HTTP 200, aber einem gefuellten "errors"-Feld statt einer
    Exception - das wuerde sonst still als "leeres Ergebnis" durchrutschen.
    Loggt solche Faelle explizit, damit die eigentliche Ursache sichtbar ist."""

    errors = data.get("errors")
    if errors:
        print(f"Warning: API-Football meldet Fehler bei {context}: {errors}")


def find_bundesliga_league_id(api_key, season):
    """Findet die exakte API-Football-Liga-ID der 1. Bundesliga zur Laufzeit
    (statt einer fest einkodierten ID, die sich ohne Live-Zugriff nicht
    verifizieren liess) und prueft, ob die gewuenschte Saison in der
    Free-Tier-Abdeckung dieser Liga enthalten ist.

    Gibt (league_id, available_seasons) zurueck, oder (None, []) wenn nichts
    gefunden wurde - inkl. Logging der Rohantwort fuer Debugging.
    """

    resp = requests.get(
        f"{BASE_URL}/leagues",
        headers=_headers(api_key),
        params={"name": "Bundesliga", "country": "Germany"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    _log_api_errors("GET /leagues (Bundesliga-Suche)", data)

    for item in data.get("response", []):
        league = item.get("league", {})
        # Exakt "Bundesliga" (Typ "League", nicht "Cup") - vermeidet
        # Verwechslung mit "2. Bundesliga" oder Frauen-Wettbewerben.
        if league.get("name") == "Bundesliga" and league.get("type") == "League":
            seasons = item.get("seasons", [])
            available_years = sorted({s.get("year") for s in seasons if s.get("year") is not None})
            if season not in available_years:
                print(f"Warning: Saison {season} nicht in API-Football-Abdeckung fuer Bundesliga "
                      f"(verfuegbar: {available_years}). Free-Tier deckt oft nur aeltere Saisons ab.")
            return league.get("id"), available_years

    print(f"Warning: Keine exakte 'Bundesliga'-Liga in API-Football-Antwort gefunden. "
          f"Rohantwort (gekuerzt): {json.dumps(data, ensure_ascii=False)[:1000]}")
    return None, []


def get_bundesliga_teams(api_key, league_id, season):
    """Alle Teams der Bundesliga in der angegebenen Saison, mit API-Football-IDs.

    Wird genutzt, um Kickbase-Teamnamen per Fuzzy-Matching auf API-Football-
    Team-IDs abzubilden - bewusst KEINE fest einkodierte ID-Tabelle, da sich
    IDs fuer neu aufgestiegene Vereine (z.B. Elversberg, Paderborn) nicht
    zuverlaessig ohne Live-Abfrage verifizieren liessen.
    """

    resp = requests.get(
        f"{BASE_URL}/teams",
        headers=_headers(api_key),
        params={"league": league_id, "season": season},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    _log_api_errors(f"GET /teams (league={league_id}, season={season})", data)
    if not data.get("response"):
        print(f"Warning: API-Football /teams lieferte 0 Teams (league={league_id}, season={season}). "
              f"Rohantwort (gekuerzt): {json.dumps(data, ensure_ascii=False)[:500]}")
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
