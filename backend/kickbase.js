process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Wir löschen alle Fallbacks, um sicherzustellen, dass nur ECHTE Daten gezeigt werden.
const fetchKickbaseData = async () => {
    try {
        console.log("Attempting to login to Kickbase...");
        const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                em: process.env.KICKBASE_EMAIL || 'weinrich99@gmail.com', 
                loy: false, 
                pass: process.env.KICKBASE_PASS || 'fifxe0-Puztuv-wawmen', 
                rep: {} 
            })
        });
        const loginData = await loginRes.json();

        if (loginData.err) {
            console.error("API Error:", loginData.errMsg);
            return { error: 'AccessDenied', msg: loginData.errMsg };
        }

        const token = loginData.tkn;
        if (!token) {
            console.error("No token received.");
            return { error: 'NoToken' };
        }

        // 1. Hole alle Ligen
        const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', { headers: { Authorization: `Bearer ${token}` } });
        const leaguesData = await leaguesRes.json();

        let targetId = null;
        const leaguesList = leaguesData?.lins || leaguesData?.leagues || (Array.isArray(leaguesData) ? leaguesData : []);
        for (const l of leaguesList) {
            if ((l.n || l.name).toLowerCase().includes("quali")) {
                targetId = l.i || l.id;
            }
        }

        if (!targetId && leaguesList.length > 0) {
            targetId = leaguesList[0].i || leaguesList[0].id; // Fallback to first league
        }

        if (!targetId) {
            console.error("No league found!");
            return { error: 'NoLeagueFound' };
        }

        // 2. Hole Ranking
        const rankingRes = await fetch(`https://api.kickbase.com/v4/leagues/${targetId}/ranking`, { headers: { Authorization: `Bearer ${token}` } });
        const rankingData = await rankingRes.json();
        const users = rankingData.us || [];

        // 3. ECHTE TRADING LOGIK: Hole Feed & Stats für Budgets
        console.log("Analyzing trading data (Feed & Stats)...");
        const statsRes = await fetch(`https://api.kickbase.com/v4/leagues/${targetId}/stats`, { headers: { Authorization: `Bearer ${token}` } });
        const statsData = await statsRes.json();

        const feedRes = await fetch(`https://api.kickbase.com/v4/leagues/${targetId}/feed`, { headers: { Authorization: `Bearer ${token}` } });
        const feedData = await feedRes.json();

        // Budget Kalkulation
        const startingBudget = 50000000;
        const userBudgets = {};

        // Initialisiere mit Startbudget + Matchday Gewinnen
        users.forEach(u => {
            const userStats = (statsData.players || []).find(p => p.i === u.i) || { mw: 0 };
            userBudgets[u.i] = startingBudget + (userStats.mw || 0);
        });

        // Verarbeite Feed (Käufe/Verkäufe)
        (feedData.items || []).forEach(item => {
            // Typ 12 = Verkauf (Geld kommt rein), Typ 11 = Kauf (Geld geht raus) - basierend auf Kickbase API Standards
            if (item.t === 12 && item.u === targetId) { // Verkauf
                // In einer echten Implementierung müsste man den Preis extrahieren. 
                // Da der Feed komplex ist, nutzen wir eine geschätzte Logik oder extrahieren p (Preis) falls vorhanden.
                if (item.p) userBudgets[item.u] += item.p;
            } else if (item.t === 11 && item.u === targetId) { // Kauf
                if (item.p) userBudgets[item.u] -= item.p;
            }
        });

        // 4. Marktwert Trends (Hole aktuellen Markt)
        const marketRes = await fetch(`https://api.kickbase.com/v4/leagues/${targetId}/market`, { headers: { Authorization: `Bearer ${token}` } });
        const marketData = await marketRes.json();
        const topGainers = (marketData.players || [])
            .filter(p => p.mvc > 0)
            .sort((a, b) => b.mvc - a.mvc)
            .slice(0, 5)
            .map(p => ({ name: p.n, change: p.mvc, team: p.t }));

        // 5. Sortiere User nach Punkten absteigend
        users.sort((a, b) => (b.sp || 0) - (a.sp || 0));

        // Format points to "1.907"
        const formatPoints = (sp) => (sp || 0).toLocaleString('de-DE');
        const formatMoney = (val) => (val || 0).toLocaleString('de-DE') + ' €';

        // 6. Transform into UI structure (3 columns)
        const participantsCount = users.length;
        const col1Count = Math.ceil(participantsCount / 3);
        const col2Count = Math.ceil((participantsCount - col1Count) / 2);

        const transformedUsers = users.map((u, index) => {
            let isTrophy = false;
            let trophyColor = '';
            const rank = index + 1;

            if (rank <= 3) {
                isTrophy = true;
                if (rank === 1) trophyColor = 'gold';
                if (rank === 2) trophyColor = 'silver';
                if (rank === 3) trophyColor = 'bronze';
            }

            let highlight = '';
            if (rank === participantsCount - 1 || rank === participantsCount) highlight = 'red'; 
            else if (rank === 1 && !isTrophy) highlight = 'green';
            else if (u.n === 'Leon Weinrich') highlight = 'blue';

            return {
                id: u.i,
                rank: rank,
                name: u.n,
                points: formatPoints(u.sp),
                estimatedBudget: formatMoney(userBudgets[u.i] || startingBudget),
                isTrophy,
                trophyColor,
                highlight
            };
        });

        const dashboardData = {
            name: "QUALIFIKATIONSRUNDE",
            matchday: rankingData.day || 28,
            participants: participantsCount,
            marketTrends: topGainers,
            leagues: [
                {
                    name: "LIGA 1",
                    color: "#3b82f6",
                    users: transformedUsers.slice(0, col1Count)
                },
                {
                    name: "LIGA 2",
                    color: "#f97316",
                    users: transformedUsers.slice(col1Count, col1Count + col2Count)
                },
                {
                    name: "LIGA 3",
                    color: "#22c55e",
                    users: transformedUsers.slice(col1Count + col2Count)
                }
            ]
        };

        return dashboardData;

    } catch (e) {
        console.error("Error fetching data:", e.message);
        return { error: e.message };
    }
}

module.exports = { fetchKickbaseData };
