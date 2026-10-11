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

for label, em, pw in accounts:
    print(f"\n=================== Account {label} ===================")
    try:
        token = login(em, pw)
    except Exception as e:
        print("Login fehlgeschlagen:", e)
        continue

    _, leagues = get(f"{BASE_URL}/leagues", token)
    leagues_list = leagues.get("lins") or leagues.get("leagues") or [] if isinstance(leagues, dict) else []
    for l in leagues_list:
        print(f"Liga: {l.get('n')!r} id={l.get('i')} | weitere Keys: { {k: v for k, v in l.items() if k not in ('n', 'i')} }")

    for l in leagues_list:
        name, lid = l.get("n") or "", l.get("i")
        if "pokal" not in name.lower() and "liga 1" not in name.lower():
            continue
        print(f"\n######## {name} ({lid}) ########")
        for ep in [
            "ranking",
            "ranking?dayNumber=5",
            "ranking?dayNumber=6",
            "overview",
            "me",
            "settings",
            "settings/managers",
            "activitiesFeed?start=0",
        ]:
            status, body = get(f"{BASE_URL}/leagues/{lid}/{ep}", token)
            summarize(f"{name} /{ep}", status, body)
