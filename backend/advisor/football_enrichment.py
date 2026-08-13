"""Reichert unsere Kickbase-Spielerdaten mit Infos an, die Kickbase selbst
NICHT hergibt: Tore/Vorlagen/Karten pro Saison und aktuelle
Verletzungen/Sperren - ueber die kostenlose API-Football-API.

Bewusst FUZZY statt fest einkodiert: Team-IDs und Spieler-Zuordnung werden
zur Laufzeit per Namens-Abgleich aufgeloest (siehe _normalize_name), da eine
hartkodierte ID-Tabelle bei neu aufgestiegenen Vereinen (z.B. Elversberg,
Paderborn, Hamburger SV, Schalke 04 in der Saison 26/27) nicht zuverlaessig
ohne Live-Pruefung moeglich war.
"""

import re
import unicodedata

from football_api import find_bundesliga_league_id, get_bundesliga_teams, get_team_players, get_team_injuries

# Rechtsformen/generische Woerter, die beim Team-Namensabgleich stoeren
# (Kickbase nennt Teams oft kurz wie "Bayern", API-Football voller wie
# "FC Bayern München").
_TEAM_NOISE_WORDS = re.compile(
    r"\b(fc|sv|vfb|vfl|tsg|sc|bv|1899|04|05|07|09|1\.)\b", re.IGNORECASE
)


def _normalize_name(value):
    """Kleinschreibung, Umlaute/Akzente entfernen, Sonderzeichen raus - fuer
    robusten Team-/Spieler-Namensabgleich zwischen Kickbase und API-Football."""

    if not value:
        return ""
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = value.lower()
    value = re.sub(r"[^a-z0-9\s]", "", value)
    return value.strip()


def _normalize_team_name(value):
    value = _TEAM_NOISE_WORDS.sub("", value or "")
    value = _normalize_name(value)
    return re.sub(r"\s+", "", value)


def match_team_id(kickbase_team_name, api_football_teams):
    """Findet die passende API-Football-Team-ID per Fuzzy-Namensabgleich."""

    target = _normalize_team_name(kickbase_team_name)
    if not target:
        return None
    for team in api_football_teams:
        candidate = _normalize_team_name(team["name"])
        if candidate and (target in candidate or candidate in target):
            return team["id"]
    return None


def _player_key(first_name, last_name):
    return _normalize_name(f"{first_name or ''} {last_name or ''}").replace(" ", "")


def fetch_football_enrichment(api_key, player_df, season):
    """Baut { kickbase_player_id: {officialGoals, officialAssists,
    officialAppearances, isInjured, injuryReason} } fuer alle Spieler, deren
    Team wir per Namensabgleich einer API-Football-Team-ID zuordnen konnten.

    Gibt bei JEDEM Fehler (fehlender/ungueltiger Key, Quota ueberschritten,
    Netzwerkproblem) einfach ein leeres Dict zurueck statt den gesamten
    Advisor-Lauf abzubrechen - diese Anreicherung ist ein Bonus, kein
    kritischer Pfad.
    """

    if not api_key:
        print("Info: Kein API_FOOTBALL_KEY konfiguriert - ueberspringe Tore/Vorlagen/Verletzungen-Anreicherung.")
        return {}

    if player_df.empty:
        return {}

    try:
        league_id, _available_seasons = find_bundesliga_league_id(api_key, season)
    except Exception as e:
        print(f"Warning: API-Football Liga-Suche fehlgeschlagen ({e}) - ueberspringe Anreicherung.")
        return {}

    if league_id is None:
        print("Warning: Bundesliga-Liga-ID nicht auffindbar - ueberspringe Anreicherung.")
        return {}

    try:
        api_teams = get_bundesliga_teams(api_key, league_id, season)
    except Exception as e:
        print(f"Warning: API-Football Team-Liste nicht abrufbar ({e}) - ueberspringe Anreicherung.")
        return {}

    if not api_teams:
        return {}

    # Kickbase-ID -> (player_id, first_name, last_name) je Team, um nachher
    # per Namensabgleich die richtige Kickbase-ID wiederzufinden.
    players_by_team = {}
    for _, row in player_df[["team_name", "player_id", "first_name", "last_name"]].drop_duplicates("player_id").iterrows():
        players_by_team.setdefault(row["team_name"], []).append(
            {"player_id": row["player_id"], "first_name": row["first_name"], "last_name": row["last_name"]}
        )

    enrichment = {}
    matched_teams = 0

    for kickbase_team_name, roster in players_by_team.items():
        api_team_id = match_team_id(kickbase_team_name, api_teams)
        if api_team_id is None:
            print(f"Info: Kein API-Football-Team fuer '{kickbase_team_name}' gefunden - ueberspringe.")
            continue
        matched_teams += 1

        # Kickbase-Spieler dieses Teams nach normalisiertem Namen indizieren,
        # um sie unten schnell wiederzufinden.
        kickbase_lookup = {_player_key(p["first_name"], p["last_name"]): p["player_id"] for p in roster}

        try:
            players_response = get_team_players(api_key, api_team_id, season)
        except Exception as e:
            print(f"Warning: API-Football Spieler-Stats fuer '{kickbase_team_name}' fehlgeschlagen ({e}).")
            players_response = {"response": []}

        for item in players_response.get("response", []):
            person = item.get("player", {})
            name_key = _player_key(person.get("firstname"), person.get("lastname"))
            # Manche API-Football-Eintraege haben nur "name" (voller Name),
            # nicht firstname/lastname getrennt - Fallback.
            if not name_key:
                name_key = _normalize_name(person.get("name", "")).replace(" ", "")

            kickbase_id = kickbase_lookup.get(name_key)
            if kickbase_id is None:
                continue

            stats_list = item.get("statistics", [])
            # Bundesliga-Statistik bevorzugen, falls der Spieler auch in
            # anderen Wettbewerben (Pokal, International) auftaucht.
            league_stats = next(
                (s for s in stats_list if s.get("league", {}).get("id") == league_id),
                stats_list[0] if stats_list else {},
            )
            goals = (league_stats.get("goals") or {}).get("total")
            assists = (league_stats.get("goals") or {}).get("assists")
            appearances = (league_stats.get("games") or {}).get("appearences")

            entry = enrichment.setdefault(str(kickbase_id), {})
            entry["officialGoals"] = goals
            entry["officialAssists"] = assists
            entry["officialAppearances"] = appearances

        try:
            injuries_response = get_team_injuries(api_key, api_team_id, season)
        except Exception as e:
            print(f"Warning: API-Football Verletzungen fuer '{kickbase_team_name}' fehlgeschlagen ({e}).")
            injuries_response = {"response": []}

        for item in injuries_response.get("response", []):
            person = (item.get("player") or {})
            name_key = _player_key(person.get("name", "").split(" ")[0] if person.get("name") else None, None)
            full_name_key = _normalize_name(person.get("name", "")).replace(" ", "")
            kickbase_id = kickbase_lookup.get(full_name_key) or kickbase_lookup.get(name_key)
            if kickbase_id is None:
                continue
            entry = enrichment.setdefault(str(kickbase_id), {})
            entry["isInjured"] = True
            entry["injuryReason"] = person.get("reason") or item.get("player", {}).get("type")

    print(f"API-Football-Anreicherung: {matched_teams}/{len(players_by_team)} Teams zugeordnet, "
          f"{len(enrichment)} Spieler mit Zusatzdaten angereichert.")

    return enrichment
