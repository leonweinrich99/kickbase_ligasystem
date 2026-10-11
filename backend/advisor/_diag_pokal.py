# Temporaer: liefert /settings/managers nur max. 25 Eintraege (Pagination)?
import os
import requests
from kickbase_api.config import BASE_URL
from kickbase_api.user import login

token = login(os.environ["KICKBASE_EMAIL_4"], os.environ["KICKBASE_PASS_4"])
H = {"Authorization": f"Bearer {token}"}
leagues = requests.get(f"{BASE_URL}/leagues", headers=H, timeout=30).json()
lid = next(l["i"] for l in leagues["lins"] if l["n"] == "Pokal")

ov = requests.get(f"{BASE_URL}/leagues/{lid}/overview", headers=H, timeout=30).json()
print("overview mgc:", ov.get("mgc"), "mid:", ov.get("mid"))

for q in ["", "?start=0", "?start=25", "?start=24", "?skip=25", "?page=1", "?max=50", "?limit=50", "?pageSize=50"]:
    r = requests.get(f"{BASE_URL}/leagues/{lid}/settings/managers{q}", headers=H, timeout=30)
    body = r.json() if r.ok else {}
    us = body.get("us", [])
    print(f"settings/managers{q}: HTTP {r.status_code}, {len(us)} Eintraege, mt={body.get('mt')}, tc={body.get('tc')}, letzte: {[u['n'] for u in us[-2:]]}")

r = requests.get(f"{BASE_URL}/leagues/{lid}/managers/2582689/performance", headers=H, timeout=30)
body = r.json() if r.ok else {}
season = (body.get("it") or [{}])[-1]
print("Wat Mamba performance:", r.status_code, body.get("unm"), [(d.get("day"), d.get("mdp"), d.get("cur")) for d in season.get("it", [])[:3]])
