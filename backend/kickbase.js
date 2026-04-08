process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fetchSingleLeagueData = async (email, password, leagueNameContains = "Qualigruppe 1") => {
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
            return { error: `Login fehlgeschlagen: ${loginData.errMsg}`, source: { email, league: leagueNameContains } };
        }

        const token = loginData.tkn;
        if (!token) {
            console.error(`No token received for ${email}.`);
            return { error: `Login fehlgeschlagen: Kein Token erhalten`, source: { email, league: leagueNameContains } };
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

        if (!targetId) {
            console.log(`No league found for ${email} with target "${leagueNameContains}".`);
            return { error: `Liga "${leagueNameContains}" nicht gefunden`, source: { email, league: leagueNameContains } };
        }

        console.log(`Found league "${leagueNameContains}" (ID: ${targetId}) for ${email}.`);

        // 2. Hole Ranking
        const rankingRes = await fetch(`https://api.kickbase.com/v4/leagues/${targetId}/ranking`, { headers: { Authorization: `Bearer ${token}` } });
        const rankingData = await rankingRes.json();
        const users = rankingData.us || [];



        // Budget Kalkulation: TV (Team Value) aus dem Ranking
        const userBudgets = {};
        users.forEach(u => {
            userBudgets[u.i] = u.tv || 0; 
        });

        return {
            users,
            userBudgets,
            matchday: rankingData.day || 28,
            source: { email, league: leagueNameContains }
        };

    } catch (e) {
        console.error(`Error fetching data for ${email} (${leagueNameContains}):`, e.message);
        return { error: `Systemfehler: ${e.message}`, source: { email, league: leagueNameContains } };
    }
};

const fetchKickbaseData = async () => {
    try {
        const accounts = [];

        // Account 1
        const email1 = process.env.KICKBASE_EMAIL;
        const pass1 = process.env.KICKBASE_PASS;
        if (email1 && pass1) {
            accounts.push({ email: email1, pass: pass1 });
        } else {
            // Fallback
            accounts.push({ email: 'weinrich99@gmail.com', pass: 'fifxe0-Puztuv-wawmen' });
        }

        // Account 2
        const email2 = process.env.KICKBASE_EMAIL_2;
        const pass2 = process.env.KICKBASE_PASS_2;
        if (email2 && pass2) {
            accounts.push({ email: email2, pass: pass2 });
        }

        const targets = ['Qualigruppe 1', 'Qualigruppe 2'];
        
        const tasks = [];
        for (const account of accounts) {
            for (const target of targets) {
                tasks.push(fetchSingleLeagueData(account.email, account.pass, target));
            }
        }

        const allResults = await Promise.all(tasks);

        let combinedUsersMap = new Map();
        let combinedBudgets = {};
        let matchday = 28;

        for (const res of allResults) {
            if (!res || res.error) continue;
            
            res.users.forEach(u => {
                if (!combinedUsersMap.has(u.i) || u.sp > combinedUsersMap.get(u.i).sp) {
                    combinedUsersMap.set(u.i, u);
                    combinedBudgets[u.i] = res.userBudgets[u.i];
                }
            });

            if (res.matchday > matchday) matchday = res.matchday;
        }

        const combinedUsers = Array.from(combinedUsersMap.values());
        combinedUsers.sort((a, b) => (b.sp || 0) - (a.sp || 0));

        const formatPoints = (sp) => (sp || 0).toLocaleString('de-DE');
        const formatMoney = (val) => (val || 0).toLocaleString('de-DE') + ' €';

        const participantsCount = combinedUsers.length;
        const col1Count = Math.max(1, Math.ceil(participantsCount / 3));
        const col2Count = Math.max(0, Math.ceil((participantsCount - col1Count) / 2));

        const transformedUsers = combinedUsers.map((u, index) => {
            const rank = index + 1;
            let isTrophy = rank <= 3;
            let trophyColor = '';
            if (rank === 1) trophyColor = 'gold';
            else if (rank === 2) trophyColor = 'silver';
            else if (rank === 3) trophyColor = 'bronze';

            let status = '';
            if (index < col1Count) {
                // Liga 1: Abstieg (rot) & Relegation (gelb)
                if (index >= col1Count - 2) status = 'red';
                else if (index === col1Count - 3) status = 'yellow';
            } else if (index < col1Count + col2Count) {
                // Liga 2: Aufstieg (grün), Relegation (gelb), Abstieg (rot)
                const relIndex = index - col1Count;
                if (relIndex <= 1) status = 'green';
                else if (relIndex === 2) status = 'yellow';
                else if (relIndex >= col2Count - 2) status = 'red';
                else if (relIndex === col2Count - 3) status = 'yellow';
            } else {
                // Liga 3: Aufstieg (grün) & Relegation (gelb)
                const relIndex = index - (col1Count + col2Count);
                if (relIndex <= 1) status = 'green';
                else if (relIndex === 2) status = 'yellow';
            }

            // Mock Form (letzte 5 Spieltage)
            const formTypes = ['w', 'd', 'l'];
            const form = Array.from({ length: 5 }, () => formTypes[Math.floor(Math.random() * 3)]);

            return {
                id: u.i,
                rank: rank,
                name: u.n,
                points: formatPoints(u.sp),
                estimatedBudget: formatMoney(combinedBudgets[u.i]),
                isTrophy,
                trophyColor,
                status
            };
        });

        const dashboardData = {
            name: "QUALIFIKATIONSRUNDE",
            matchday: matchday,
            participants: participantsCount,
            timestamp: new Date().toISOString(),
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
