process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fetchSingleLeagueData = async (email, password, leagueNameContains = "quali") => {
    try {
        console.log(`Attempting to login to Kickbase for ${email}...`);
        const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                em: email, 
                loy: false, 
                pass: password, 
                rep: {} 
            })
        });
        const loginData = await loginRes.json();

        if (loginData.err) {
            console.error(`API Error for ${email}:`, loginData.errMsg);
            return null;
        }

        const token = loginData.tkn;
        if (!token) {
            console.error(`No token received for ${email}.`);
            return null;
        }

        // 1. Hole alle Ligen
        const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', { headers: { Authorization: `Bearer ${token}` } });
        const leaguesData = await leaguesRes.json();

        let targetId = null;
        const leaguesList = leaguesData?.lins || leaguesData?.leagues || (Array.isArray(leaguesData) ? leaguesData : []);
        for (const l of leaguesList) {
            if ((l.n || l.name).toLowerCase().includes(leagueNameContains.toLowerCase())) {
                targetId = l.i || l.id;
            }
        }

        if (!targetId && leaguesList.length > 0) {
            targetId = leaguesList[0].i || leaguesList[0].id; // Fallback to first league
        }

        if (!targetId) {
            console.error(`No league found for ${email}!`);
            return null;
        }

        // 2. Hole Ranking
        const rankingRes = await fetch(`https://api.kickbase.com/v4/leagues/${targetId}/ranking`, { headers: { Authorization: `Bearer ${token}` } });
        const rankingData = await rankingRes.json();
        const users = rankingData.us || [];

        // 3. ECHTE TRADING LOGIK: Hole Feed & Stats für Budgets
        console.log(`Analyzing trading data (Feed & Stats) for league ${targetId}...`);
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
            if (item.t === 12 && item.u === targetId) { // Verkauf
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

        return {
            users,
            userBudgets,
            topGainers,
            matchday: rankingData.day || 28
        };

    } catch (e) {
        console.error(`Error fetching data for ${email}:`, e.message);
        return null;
    }
};

const fetchKickbaseData = async () => {
    try {
        const credentials = [
            { email: process.env.KICKBASE_EMAIL || 'weinrich99@gmail.com', pass: process.env.KICKBASE_PASS || 'fifxe0-Puztuv-wawmen', target: 'quali' }
        ];

        // Only add the second account if BOTH env vars are explicitly set
        if (process.env.KICKBASE_EMAIL_2 && process.env.KICKBASE_PASS_2) {
            credentials.push({ email: process.env.KICKBASE_EMAIL_2, pass: process.env.KICKBASE_PASS_2, target: 'qualigruppe 1' });
        }

        const allResults = await Promise.all(
            credentials.map(c => fetchSingleLeagueData(c.email, c.pass, c.target))
        );

        let combinedUsersMap = new Map();
        let combinedBudgets = {};
        let combinedGainers = [];
        let matchday = 28;

        for (const res of allResults) {
            if (!res) continue; // Skip if this account failed to fetch data
            
            res.users.forEach(u => {
                // To avoid duplicate players (if user is in multiple leagues), key by 'i' (Kickbase ID).
                // If they appear multiple times, take the one with higher points (or just the first one).
                if (!combinedUsersMap.has(u.i) || u.sp > combinedUsersMap.get(u.i).sp) {
                    combinedUsersMap.set(u.i, u);
                }
            });

            // Merging budgets
            Object.assign(combinedBudgets, res.userBudgets);

            // Just take trends from the first successful fetch (market is usually global across leagues)
            if (combinedGainers.length === 0) {
                combinedGainers = res.topGainers;
            }
            matchday = res.matchday;
        }

        const combinedUsers = Array.from(combinedUsersMap.values());
        
        // 5. Sortiere User nach Punkten absteigend
        combinedUsers.sort((a, b) => (b.sp || 0) - (a.sp || 0));

        // Format points to "1.907"
        const formatPoints = (sp) => (sp || 0).toLocaleString('de-DE');
        const formatMoney = (val) => (val || 0).toLocaleString('de-DE') + ' €';
        const startingBudget = 50000000;

        // 6. Transform into UI structure (3 columns)
        const participantsCount = combinedUsers.length;
        // Handle cases where we have fewer than 3 participants
        const col1Count = Math.max(1, Math.ceil(participantsCount / 3));
        const col2Count = Math.max(0, Math.ceil((participantsCount - col1Count) / 2));

        const transformedUsers = combinedUsers.map((u, index) => {
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
                estimatedBudget: formatMoney(combinedBudgets[u.i] || startingBudget),
                isTrophy,
                trophyColor,
                highlight
            };
        });

        const dashboardData = {
            name: "QUALIFIKATIONSRUNDE",
            matchday: matchday,
            participants: participantsCount,
            marketTrends: combinedGainers,
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
        console.error("Error formatting combined data:", e.message);
        return { error: e.message };
    }
}

module.exports = { fetchKickbaseData };
