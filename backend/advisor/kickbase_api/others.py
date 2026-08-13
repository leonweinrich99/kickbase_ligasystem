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


def get_team_predictions(token, competition_id):
    """EXPERIMENTELL: Kickbases eigene Startelf-/Aufstellungsprognose fuer
    ALLE Teams eines Wettbewerbs (nicht liga-spezifisch, gilt fuer JEDEN
    Spieler des Wettbewerbs - im Gegensatz zur Markt-Wahrscheinlichkeit, die
    es nur fuer aktuell gelistete Marktspieler gibt).

    In der offiziellen API-Doku ohne Beispiel-Antwort dokumentiert - die
    tatsaechliche Struktur wird zur Laufzeit geloggt (siehe
    predictions.py::extract_predicted_lineup_probabilities), um sie
    schrittweise zu verifizieren.
    """

    url = f"{BASE_URL}/base/predictions/teams/{competition_id}"
    return get_json_with_token(url, token)
