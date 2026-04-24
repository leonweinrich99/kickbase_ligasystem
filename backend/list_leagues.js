require('dotenv').config();

async function listLeagues() {
    const email = process.env.KICKBASE_EMAIL;
    const password = process.env.KICKBASE_PASS;

    if (!email || !password) {
        console.error("KICKBASE_EMAIL oder KICKBASE_PASS fehlt.");
        return;
    }

    try {
        const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ em: email, loy: false, pass: password, rep: {} })
        });
        const loginData = await loginRes.json();
        const token = loginData.tkn;

        const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const leaguesData = await leaguesRes.json();
        const leagues = leaguesData.lins || leaguesData.leagues || [];
        
        console.log("Gefundene Ligen:");
        leagues.forEach(l => {
            console.log(`- Name: ${l.n || l.name}, ID: ${l.i || l.id}`);
        });
    } catch (e) {
        console.error(e);
    }
}

listLeagues();
