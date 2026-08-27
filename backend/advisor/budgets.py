from kickbase_api.user import get_budget, get_username
from kickbase_api.league import get_league_activities, get_league_ranking
from kickbase_api.manager import get_managers, get_manager_performance, get_manager_info
from kickbase_api.others import get_achievement_reward
import pandas as pd

# Angepasste Version von features/budgets.py aus dem Original-Repo
# (https://github.com/LennardFe/Kickbase-Trading-Advisor): funktioniert
# unveraendert pro einzelner Liga, wird vom Orchestrator (run_advisor.py)
# fuer jede unserer 3 Ligen separat aufgerufen.


def calc_manager_budgets(token, league_id, league_start_date, start_budget):
    """Calculate manager budgets based on activities, bonuses, and team performance."""

    try:
        activities, login_bonus, achievement_bonus = get_league_activities(token, league_id, league_start_date)
    except Exception as e:
        raise RuntimeError(f"Failed to fetch activities: {e}") from e

    activities_df = pd.DataFrame(activities)

    total_login_bonus = sum(entry.get("data", {}).get("bn", 0) for entry in login_bonus)

    total_achievement_bonus = 0
    for item in achievement_bonus:
        try:
            a_id = item.get("data", {}).get("t")
            if a_id is None:
                continue
            amount, reward = get_achievement_reward(token, league_id, a_id)
            total_achievement_bonus += amount * reward
        except Exception as e:
            print(f"Warning: Failed to process achievement bonus {item}: {e}")

    try:
        managers = get_managers(token, league_id)
    except Exception as e:
        raise RuntimeError(f"Failed to fetch managers: {e}") from e

    performances = []
    for manager in managers:
        try:
            manager_name, manager_id = manager
            info = get_manager_info(token, league_id, manager_id)
            team_value = info.get("tv", 0)

            perf = get_manager_performance(token, league_id, manager_id, manager_name)
            perf["Team Value"] = team_value
            performances.append(perf)
        except Exception as e:
            print(f"Warning: Skipping manager {manager}: {e}")

    perf_df = pd.DataFrame(performances)
    if not perf_df.empty:
        perf_df["point_bonus"] = perf_df["tp"].fillna(0) * 1000
    else:
        perf_df["name"] = []
        perf_df["point_bonus"] = []
        perf_df["Team Value"] = []

    if activities_df.empty:
        budgets = {}
    else:
        budgets = {
            user: start_budget
            for user in set(activities_df.get("byr", pd.Series(dtype=object)).dropna().unique())
            .union(set(activities_df.get("slr", pd.Series(dtype=object)).dropna().unique()))
        }

    # Manager, die noch keine einzige Aktivität hatten (z.B. ganz neue Liga),
    # trotzdem mit Startbudget aufnehmen, damit sie in der Tabelle auftauchen.
    for manager_name, _ in managers:
        budgets.setdefault(manager_name, start_budget)

    for _, row in activities_df.iterrows():
        byr, slr, trp = row.get("byr"), row.get("slr"), row.get("trp", 0)
        try:
            if pd.isna(byr) and pd.notna(slr):
                budgets[slr] += trp
            elif pd.isna(slr) and pd.notna(byr):
                budgets[byr] -= trp
            elif pd.notna(byr) and pd.notna(slr):
                budgets[byr] -= trp
                budgets[slr] += trp
        except KeyError as e:
            print(f"Warning: Skipping invalid activity row {row}: {e}")

    budget_df = pd.DataFrame(list(budgets.items()), columns=["User", "Budget"])

    budget_df = budget_df.merge(
        perf_df[["name", "point_bonus", "Team Value"]],
        left_on="User",
        right_on="name",
        how="left",
    ).drop(columns=["name"], errors="ignore")

    budget_df["Budget"] = budget_df["Budget"] + budget_df["point_bonus"].fillna(0)
    budget_df.drop(columns=["point_bonus"], inplace=True, errors="ignore")

    # Login-Bonus wird pauschal fuer alle addiert (Annahme: taeglich eingeloggt) -
    # eine reine Schaetzung, siehe README des Original-Tools.
    budget_df["Budget"] += total_login_bonus
    budget_df["Budget"] = budget_df["Budget"].astype(float)

    for user in budget_df["User"]:
        bonus = calc_achievement_bonus_by_points(token, league_id, user, total_achievement_bonus)
        budget_df.loc[budget_df["User"] == user, "Budget"] += bonus

    try:
        own_budget = get_budget(token, league_id)
        own_username = get_username(token)
        mask = budget_df["User"] == own_username
        if mask.any() and not budget_df.loc[mask, "Budget"].eq(own_budget).all():
            budget_df.loc[mask, "Budget"] = own_budget
    except Exception as e:
        print(f"Warning: Could not sync own budget: {e}")

    budget_df["Team Value"] = budget_df["Team Value"].fillna(0)
    budget_df["Max Negative"] = (budget_df["Team Value"] + budget_df["Budget"]) * -0.33
    # "Verfuegbares Budget" ist das Geld, das sicher ausgegeben werden kann,
    # OHNE danach ins Minus zu rutschen - bewusst NUR das reine Budget, ohne
    # den Dispo-Puffer (Max Negative) mit einzurechnen. Kickbase erlaubt zwar
    # kurzzeitig ein Minus beim Handeln, das Konto muss aber bis zum naechsten
    # Spieltag wieder auf >= 0 ausgeglichen sein (sonst gibt es keine Punkte
    # fuer den Spieltag) - der Dispo ist also KEIN sicher ausgebbares Geld.
    # "Dispo Puffer" bleibt als reine Info-Kennzahl erhalten (wie weit man sich
    # theoretisch verschulden darf), fliesst aber nicht mehr ins ausgebbare
    # Budget mit ein (siehe Advisor.jsx).
    budget_df["Available Budget"] = budget_df["Budget"]
    budget_df["Dispo Puffer"] = budget_df["Max Negative"].fillna(0).abs()

    budget_df.sort_values("Available Budget", ascending=False, inplace=True, ignore_index=True)

    return budget_df


def calc_achievement_bonus_by_points(token, league_id, username, anchor_achievement_bonus):
    """Estimate achievement bonus for a user based on their total points compared to anchor user."""

    ranking = get_league_ranking(token, league_id)
    ranking_df = pd.DataFrame(ranking, columns=["Name", "Total Points"])

    if ranking_df.empty:
        return 0

    anchor_user = get_username(token)
    anchor_row = ranking_df[ranking_df["Name"] == anchor_user]
    if anchor_row.empty:
        return 0
    anchor_points = anchor_row["Total Points"].values[0]

    if username == anchor_user:
        return anchor_achievement_bonus

    user_row = ranking_df[ranking_df["Name"] == username]
    if user_row.empty:
        return 0
    user_points = user_row["Total Points"].values[0]

    scale = 1.0 if anchor_points == 0 else user_points / anchor_points

    return anchor_achievement_bonus * scale
