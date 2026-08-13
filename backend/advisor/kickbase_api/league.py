from kickbase_api.config import BASE_URL, get_json_with_token

# All functions related to league data


def get_league_id(token, league_name):
    """Get the league ID based on the (partial, case-insensitive) league name.

    Unser Ligasystem nutzt "enthält"-Matching statt exaktem Vergleich, damit
    dieselbe env-Variable (KICKBASE_LEAGUE_x_NAME) verwendet werden kann wie
    im bestehenden Node-Backend (backend/kickbase.js).
    """

    league_infos = get_leagues_infos(token)

    if not league_infos:
        raise RuntimeError("Der Advisor-Account ist in keiner Liga Mitglied.")

    needle = league_name.lower()
    matches = [league for league in league_infos if needle in league["name"].lower()]

    if not matches:
        raise RuntimeError(
            f"Keine Liga mit Namen '{league_name}' gefunden. "
            f"Verfügbare Ligen: {[l['name'] for l in league_infos]}"
        )

    return matches[0]["id"]


def get_leagues_infos(token):
    """Get information about all leagues the user is part of."""

    url = f"{BASE_URL}/leagues/selection"
    data = get_json_with_token(url, token)

    return [{"id": item.get("i"), "name": item.get("n")} for item in data.get("it", [])]


def get_league_activities(token, league_id, league_start_date):
    """Get league activities such as trades, logins, and achievements since the league start date."""

    url = f"{BASE_URL}/leagues/{league_id}/activitiesFeed?max=5000"
    data = get_json_with_token(url, token)

    filtered_activities = [
        entry for entry in data.get("af", [])
        if entry.get("dt", "") >= league_start_date
    ]

    login = [entry for entry in filtered_activities if entry.get("t") == 22]
    achievements = [entry for entry in filtered_activities if entry.get("t") == 26]
    trade = [entry for entry in filtered_activities if entry.get("t") == 15]
    trading = [
        {k: entry["data"].get(k) for k in ["byr", "slr", "pi", "pn", "tid", "trp"]}
        for entry in trade
    ]

    return trading, login, achievements


def get_league_players_on_market(token, league_id):
    """Get all players currently available on the market in the league.

    Gibt die komplette Rohantwort pro Spieler zurueck (nicht nur einzelne
    Felder) - so stehen in predictions.py alle von Kickbase gelieferten
    Zusatzinfos zur Verfuegung (Status, Gesamtpunkte, Team-of-the-week-Flag,
    Spielerbild, etc.), ohne dass hier jedes einzelne Feld einzeln
    aufgezaehlt werden muss und ggf. neue Felder verpasst werden.
    """

    url = f"{BASE_URL}/leagues/{league_id}/market"
    data = get_json_with_token(url, token)

    return data.get("it", [])


def get_league_ranking(token, league_id):
    """Get the overall league ranking, sorted by points descending."""

    url = f"{BASE_URL}/leagues/{league_id}/ranking"
    data = get_json_with_token(url, token)

    players = [(user["n"], user["sp"]) for user in data["us"]]
    return sorted(players, key=lambda x: x[1], reverse=True)
