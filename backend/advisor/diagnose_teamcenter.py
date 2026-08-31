"""EINMALIGES Diagnose-Script (kein Teil der regulaeren Pipeline) - prueft,
ob der von der Community dokumentierte, aber unbestaetigte Endpunkt
GET /v4/leagues/{leagueId}/users/{userId}/teamcenter?dayNumber={n}
echte Lineup-/Startelf-Daten fuer einen BELIEBIGEN Manager liefert (nicht nur
den eigenen Account) - siehe Issue-Diskussion 31.08.2026, Owner-Wunsch.

Nur ueber "Diagnose: teamcenter-Endpunkt" (workflow_dispatch, echte Secrets)
ausgefuehrt, gibt die komplette Rohantwort (+ Vergleich mit dem bereits
dokumentierten myeleven-Endpunkt fuer den eigenen Account) auf stdout aus.
Schreibt NICHTS, veraendert keine App-Daten.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kickbase_api.config import BASE_URL, get_json_with_token
from kickbase_api.manager import get_managers
from run_advisor import login_all_accounts, find_league_across_accounts, env_or_default


def main():
    league_name = env_or_default("KICKBASE_LEAGUE_1_NAME", None)
    if not league_name:
        print("[FEHLER] KICKBASE_LEAGUE_1_NAME nicht gesetzt.")
        sys.exit(1)

    print("[LOG] Logge bei Kickbase ein (alle konfigurierten Accounts)...")
    sessions = login_all_accounts()
    if not sessions:
        print("[FEHLER] Kein Account konnte sich einloggen.")
        sys.exit(1)

    all_known_leagues = sorted({l["name"] for s in sessions for l in s["leagues"]})
    print(f"[LOG] Bekannte Ligen ueber alle Accounts: {all_known_leagues}")

    token, league_id, owner_email = find_league_across_accounts(sessions, league_name)
    if not league_id:
        print(f"[FEHLER] Keine Liga mit Namen '{league_name}' in irgendeinem Account gefunden.")
        sys.exit(1)
    print(f"[LOG] Liga '{league_name}' -> ID {league_id} (Account {owner_email})")

    managers = get_managers(token, league_id)
    print(f"[LOG] {len(managers)} Manager in der Liga gefunden: {[m[0] for m in managers]}")

    # Bekannter Testfall aus Issue 9a0d78ba: Vinnie JR, 11 Kader-Spieler zum
    # Kickoff, keine Mehrdeutigkeit - falls der Name in dieser Liga nicht
    # existiert (anderer Account/andere Liga geladen), nimm einfach den ersten
    # echten Manager als Fallback.
    target = next((m for m in managers if "vinnie" in m[0].lower()), managers[0])
    target_name, target_id = target
    print(f"[LOG] Test-Manager: {target_name} (ID {target_id})")

    print("\n" + "=" * 60)
    print("### GET /leagues/{leagueId}/teamcenter/myeleven (eigener Account, bekannt dokumentiert) ###")
    print("=" * 60)
    try:
        myeleven = get_json_with_token(f"{BASE_URL}/leagues/{league_id}/teamcenter/myeleven", token)
        print(json.dumps(myeleven, indent=2, ensure_ascii=False)[:4000])
    except Exception as e:
        print(f"[FEHLER] myeleven: {e}")

    print("\n" + "=" * 60)
    print(f"### GET /leagues/{{leagueId}}/users/{{userId}}/teamcenter?dayNumber=1 (Manager: {target_name}) ###")
    print("=" * 60)
    try:
        teamcenter = get_json_with_token(
            f"{BASE_URL}/leagues/{league_id}/users/{target_id}/teamcenter?dayNumber=1", token
        )
        print(json.dumps(teamcenter, indent=2, ensure_ascii=False)[:6000])
    except Exception as e:
        print(f"[FEHLER] teamcenter?dayNumber=1: {e}")

    print("\n" + "=" * 60)
    print("### Ohne dayNumber-Query (Fallback-Test, falls der Parametername abweicht) ###")
    print("=" * 60)
    try:
        teamcenter_nodays = get_json_with_token(
            f"{BASE_URL}/leagues/{league_id}/users/{target_id}/teamcenter", token
        )
        print(json.dumps(teamcenter_nodays, indent=2, ensure_ascii=False)[:4000])
    except Exception as e:
        print(f"[FEHLER] teamcenter ohne dayNumber: {e}")


if __name__ == "__main__":
    main()
