# Temporaer: Wie kommen Sebastians (2934402) -626 Punkte im Pokal (Spieltag 5) zustande?
import os
import requests
from kickbase_api.config import BASE_URL
from kickbase_api.user import login

UID = "2934402"
token = login(os.environ["KICKBASE_EMAIL_4"], os.environ["KICKBASE_PASS_4"])
H = {"Authorization": f"Bearer {token}"}
lid = next(l["i"] for l in requests.get(f"{BASE_URL}/leagues", headers=H, timeout=30).json()["lins"] if l["n"] == "Pokal")

def get(ep):
    r = requests.get(f"{BASE_URL}/leagues/{lid}/{ep}", headers=H, timeout=30)
    return r.status_code, (r.json() if r.ok else r.text[:300])

s, tc = get(f"users/{UID}/teamcenter?dayNumber=5")
print("teamcenter:", s)
me = next((u for u in tc.get("us", []) if u.get("i") == UID), None)
print("Sebastian:", {k: v for k, v in (me or {}).items() if k not in ("lpi", "uim")})
print("Top-Level:", {k: v for k, v in tc.items() if k not in ("lp", "us", "nlp", "uim")})
total = 0
for p in tc.get("lp", []):
    total += p.get("p") or 0
    print("  lp:", {k: p.get(k) for k in ("i", "n", "p", "st", "tid", "mdst", "k")})
print("Summe Spielerpunkte:", total)
for p in tc.get("nlp", []):
    print("  nlp:", {k: p.get(k) for k in ("i", "n", "p", "st", "tid", "k")})

s, perf = get(f"managers/{UID}/performance")
season = (perf.get("it") or [{}])[-1]
print("performance:", [(d.get("day"), d.get("mdp"), d.get("cur")) for d in season.get("it", [])[:6]])
