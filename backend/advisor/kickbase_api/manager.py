from kickbase_api.config import BASE_URL, get_json_with_token

# All functions related to manager data


def get_managers(token, league_id):
    """Get a list of all managers in the league with their names and IDs."""

    url = f"{BASE_URL}/leagues/{league_id}/ranking"
    data = get_json_with_token(url, token)

    return [(user["n"], user["i"]) for user in data["us"]]


def get_manager_info(token, league_id, manager_id):
    """Get detailed information about a specific manager in the league."""

    url = f"{BASE_URL}/leagues/{league_id}/managers/{manager_id}/dashboard"
    return get_json_with_token(url, token)


def get_manager_performance(token, league_id, manager_id, manager_name):
    """Get total-points performance for a specific manager in the league.

    Nimmt automatisch die Saison mit der HÖCHSTEN Season-ID (= aktuellste
    Saison), statt wie im Original-Tool eine fest einkodierte Saison-ID -
    sonst müsste dieser Wert jede Saison manuell angepasst werden.
    """

    url = f"{BASE_URL}/leagues/{league_id}/managers/{manager_id}/performance"
    data = get_json_with_token(url, token)

    seasons = data.get("it", [])
    if not seasons:
        return {"name": manager_name, "tp": 0}

    def season_sort_key(season):
        try:
            return int(season.get("sid", 0))
        except (TypeError, ValueError):
            return 0

    latest_season = max(seasons, key=season_sort_key)

    return {"name": manager_name, "tp": latest_season.get("tp", 0)}


def get_manager_squad(token, league_id, manager_id):
    """Get the squad of a SPECIFIC manager in the league (nicht nur der
    eigene) - erlaubt es, mit EINEM Account (z.B. unserem Haupt-/Bot-Account,
    der lediglich Mitglied der Liga ist) die Kader ALLER Manager der Liga
    abzurufen, ohne dass sich jeder Manager selbst einloggen muss.
    """

    url = f"{BASE_URL}/leagues/{league_id}/managers/{manager_id}/squad"
    return get_json_with_token(url, token)
