from kickbase_api.config import BASE_URL, get_json_with_token

# All other functions that don't fit anywhere else


def get_all_teams(token, competition_id):
    """Get all teams in a competition."""

    url = f"{BASE_URL}/competitions/{competition_id}/table"
    data = get_json_with_token(url, token)

    return [
        {"team_id": item.get("tid"), "team_name": item.get("tn")}
        for item in data.get("it", [])
    ]


def get_achievement_reward(token, league_id, achievement_id):
    """Get the reward and how often it was achieved by the (logged-in) user."""

    url = f"{BASE_URL}/leagues/{league_id}/user/achievements/{achievement_id}"
    data = get_json_with_token(url, token)

    return data["ac"], data["er"]
