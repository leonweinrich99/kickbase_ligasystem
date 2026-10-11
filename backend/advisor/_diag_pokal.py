# Temporaeres Diagnose-Skript: Warum liefert /leagues/<Pokal>/ranking seit dem
# 27.08.2026 eine leere "us"-Liste, waehrend LIGA1-3 funktionieren? Vergleicht
# die Roh-Antworten mehrerer Endpoints fuer Pokal vs. eine funktionierende Liga.
import json
import os

import requests

from kickbase_api.config import BASE_URL
from kickbase_api.user import login


def get(url, token):
    try:
        resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
        try:
            body = resp.json()
        except ValueError:
            body = resp.text[:500]
        return resp.status_code, body
    except Exception as e:
        return None, str(e)


def summarize(label, status, body, limit=1500):
    print(f"\n--- {label} -> HTTP {status}")
    if isinstance(body, dict):
        print("Top-Level-Keys:", list(body.keys()))
        for k, v in body.items():
            if isinstance(v, list):
                print(f"  {k}: Liste mit {len(v)} Eintraegen")
    print(json.dumps(body, indent=1, ensure_ascii=False)[:limit])


accounts = []
for suffix in ["", "_2", "_3", "_4"]:
    em, pw = os.environ.get(f"KICKBASE_EMAIL{suffix}"), os.environ.get(f"KICKBASE_PASS{suffix}")
    if em and pw:
        accounts.append((suffix or "_1", em, pw))

# Runde 2: Pokal (gpm=4) liefert kein Ranking - Punkte pro Manager suchen.
label, em, pw = [a for a in accounts if a[0] == "_4"][0]
token = login(em, pw)
_, leagues = get(f"{BASE_URL}/leagues", token)
lid = next(l["i"] for l in leagues["lins"] if l["n"] == "Pokal")
_, managers = get(f"{BASE_URL}/leagues/{lid}/settings/managers", token)
sample = [u for u in managers["us"] if u["n"] != "Admin"][:2]
for u in sample:
    uid = u["i"]
    print(f"\n######## Manager {u['n']} ({uid}) ########")
    for ep in [
        f"managers/{uid}/dashboard",
        f"managers/{uid}/performance",
        f"users/{uid}/teamcenter?dayNumber=4",
        f"users/{uid}/teamcenter?dayNumber=5",
        f"users/{uid}/stats",
        f"ranking?dayNumber=4",
    ]:
        status, body = get(f"{BASE_URL}/leagues/{lid}/{ep}", token)
        summarize(f"Pokal /{ep}", status, body, limit=2500)
