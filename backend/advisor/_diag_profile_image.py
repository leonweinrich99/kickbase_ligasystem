import json
from kickbase_api.config import get_json_with_token
from kickbase_api.user import login

email = __import__('os').environ['KICKBASE_EMAIL_4']
password = __import__('os').environ['KICKBASE_PASS_4']
token = login(email, password)

# Liga-ID der Pokal-Liga suchen (wir wissen aus dem Test: "Pokal", 10 Mitglieder)
from kickbase_api.config import BASE_URL
leagues = get_json_with_token(f"{BASE_URL}/leagues", token)
leagues_list = leagues.get("lins") or leagues.get("leagues") or (leagues if isinstance(leagues, list) else [])
league = next(l for l in leagues_list if (l.get("n") or l.get("name")) == "Pokal")
league_id = league.get("i") or league.get("id")
print("Liga-ID:", league_id)

ranking = get_json_with_token(f"{BASE_URL}/leagues/{league_id}/ranking", token)
print("Keys eines Ranking-Users:", list(ranking["us"][0].keys()))
print(json.dumps(ranking["us"][0], indent=2, ensure_ascii=False))

manager_id = ranking["us"][0]["i"]
dashboard = get_json_with_token(f"{BASE_URL}/leagues/{league_id}/managers/{manager_id}/dashboard", token)
print("\nKeys im Manager-Dashboard:", list(dashboard.keys()))
print(json.dumps(dashboard, indent=2, ensure_ascii=False)[:3000])
