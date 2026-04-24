require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function debug() {
    const email = process.env.KICKBASE_EMAIL;
    const password = process.env.KICKBASE_PASS;

    if (!email || !password) {
        console.error("Missing credentials in .env");
        return;
    }

    console.log("Logging in...");
    const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ em: email, loy: false, pass: password, rep: {} })
    });
    
    if (!loginRes.ok) {
        console.error("Login request failed", loginRes.status, await loginRes.text());
        return;
    }
    const loginData = await loginRes.json();
    const token = loginData.tkn;
    if (!token) {
        console.error("No token in login response", loginData);
        return;
    }

    console.log("Fetching leagues...");
    const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', {
        headers: { Authorization: `Bearer ${token}` }
    });
    const leaguesData = await leaguesRes.json();
    const leagues = leaguesData.lins || leaguesData.leagues || [];
    if (leagues.length === 0) {
        console.error("No leagues found");
        return;
    }
    const leagueId = leagues[0].i || leagues[0].id;
    console.log("League ID:", leagueId);

    const teamId = 2; // Bayern
    const urls = [
        `https://api.kickbase.com/v4/leagues/${leagueId}/teams/${teamId}/players`,
        `https://api.kickbase.com/v4/leagues/${leagueId}/teams/${teamId}/teamprofile`,
        `https://api.kickbase.com/v4/teams/${teamId}/players`,
        `https://api.kickbase.com/v4/base/teams/${teamId}/players`,
        `https://api.kickbase.com/v4/competitions/1/teams/${teamId}/players`
    ];

    for (const url of urls) {
        console.log(`Testing ${url}...`);
        try {
            const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            console.log(`  Status: ${r.status}`);
            const text = await r.text();
            if (r.ok && text) {
                const d = JSON.parse(text);
                const keys = Object.keys(d);
                console.log(`  Keys: ${keys.join(', ')}`);
                const list = d.p || d.players || d.pl || (Array.isArray(d) ? d : []);
                console.log(`  Items found: ${Array.isArray(list) ? list.length : (list ? 'Object' : '0')}`);
                if (Array.isArray(list) && list.length > 0) {
                    console.log(`  Example player:`, list[0]);
                    break;
                }
            } else {
                console.log(`  No content or error: ${text.substring(0, 100)}`);
            }
        } catch (e) {
            console.error(`  Error testing ${url}:`, e.message);
        }
    }
}

debug();
