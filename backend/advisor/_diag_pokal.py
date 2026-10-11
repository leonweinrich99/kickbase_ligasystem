# Temporaer: Warum hat casper (3850715) in LIGA 3 am 5. Spieltag 0 Punkte?
import json
import os
import requests
from kickbase_api.config import BASE_URL
from kickbase_api.user import login

UID = "3850715"
for suffix in ["", "_2", "_3", "_4"]:
    em, pw = os.environ.get(f"KICKBASE_EMAIL{suffix}"), os.environ.get(f"KICKBASE_PASS{suffix}")
    if not (em and pw):
        continue
    token = login(em, pw)
    H = {"Authorization": f"Bearer {token}"}
    leagues = requests.get(f"{BASE_URL}/leagues", headers=H, timeout=30).json().get("lins", [])
    lg = next((l for l in leagues if l["n"] == "3. Liga"), None)
    if not lg:
        continue
    lid = lg["i"]
    def get(ep):
        r = requests.get(f"{BASE_URL}/leagues/{lid}/{ep}", headers=H, timeout=30)
        return r.status_code, (r.json() if r.ok else r.text[:300])

    s, perf = get(f"managers/{UID}/performance")
    season = (perf.get("it") or [{}])[-1] if isinstance(perf, dict) else {}
    print("performance:", s, [(d.get("day"), d.get("mdp"), d.get("cur")) for d in season.get("it", [])])

    for day in (4, 5):
        s, tc = get(f"users/{UID}/teamcenter?dayNumber={day}")
        print(f"\nteamcenter day {day}: HTTP {s}")
        if isinstance(tc, dict):
            print("  Top-Level:", {k: v for k, v in tc.items() if k not in ("lp", "us")})
            for u in tc.get("us", []):
                print("  us:", {k: v for k, v in u.items() if k not in ("lpi",)})
            for p in tc.get("lp", [])[:15]:
                print("  lp:", p if not isinstance(p, dict) else {k: p.get(k) for k in ("i", "n", "p", "mdst", "st", "tid")})

    s, dash = get(f"managers/{UID}/dashboard")
    print("\ndashboard:", s, {k: v for k, v in dash.items() if k not in ("ph", "fp", "uim", "lim")} if isinstance(dash, dict) else dash)
    break
