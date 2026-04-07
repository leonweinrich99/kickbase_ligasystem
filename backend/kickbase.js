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

        // 3. Sortiere User nach Punkten absteigend
        users.sort((a, b) => (b.sp || 0) - (a.sp || 0));

        // Format points to "1.907"
        const formatPoints = (sp) => (sp || 0).toLocaleString('de-DE');

        // 4. Transform into UI structure (3 columns)
        const participantsCount = users.length;
        const col1Count = Math.ceil(participantsCount / 3);
        const col2Count = Math.ceil((participantsCount - col1Count) / 2);
        const col3Count = participantsCount - col1Count - col2Count;

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

            // Assign highlight bar colors similarly to screenshot logic
            let highlight = '';
            if (rank === participantsCount - 1 || rank === participantsCount) highlight = 'red'; // Bottom 2
            else if (rank === 1 && !isTrophy) highlight = 'green';
            else if (u.n === 'Leon Weinrich') highlight = 'blue';

            return {
                id: u.i,
                rank: rank,
                name: u.n,
                points: formatPoints(u.sp),
                isTrophy,
                trophyColor,
                highlight
            };
        });

        const dashboardData = {
            name: "QUALIFIKATIONSRUNDE",
            matchday: rankingData.day || 28,
            participants: participantsCount,
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
