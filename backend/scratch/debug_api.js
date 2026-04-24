require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function debug() {
    const email = process.env.KICKBASE_EMAIL;
    const password = process.env.KICKBASE_PASS;

    console.log("--- DEBUG START ---");
    
    const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ em: email, loy: false, pass: password, rep: {} })
    });
    const loginData = await loginRes.json();
    const token = loginData.tkn;
    if (!token) {
        console.log("ERROR: No token found");
        return;
    }

    // 1. Competitions check
    console.log("Fetching competitions...");
    const compRes = await fetch('https://api.kickbase.com/v4/competitions', {
        headers: { 
            Authorization: `Bearer ${token}`,
            Cookie: `kkstrauth=${token}`
        }
    });
    const compData = await compRes.json();
    console.log("Competitions Raw:", JSON.stringify(compData));

    // 2. Teams check
    console.log("Fetching teams...");
    const teamsRes = await fetch('https://api.kickbase.com/v4/base/predictions/teams/1', {
        headers: { Authorization: `Bearer ${token}` }
    });
    const teamsData = await teamsRes.json();
    console.log("Teams Keys:", Object.keys(teamsData));
    const teams = teamsData.tms || [];
    console.log("Teams Count:", teams.length);

    if (teams.length > 0) {
        const teamId = teams[0].tid || teams[0].i;
        console.log(`Testing Team ${teams[0].tn} (ID: ${teamId})...`);
        const urls = [
            `https://api.kickbase.com/competition/teams/${teamId}/players`,
            `https://api.kickbase.com/v4/leagues/10320440/teams/${teamId}/players`,
            `https://api.kickbase.com/v4/leagues/10320440/teams/${teamId}/teamprofile`
        ];
        for (const url of urls) {
            console.log(`URL: ${url}`);
            const r = await fetch(url, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    Cookie: `kkstrauth=${token}`
                }
            });
            console.log(`  Status: ${r.status}`);
            const body = await r.text();
            console.log(`  Body (100 chars): ${body.substring(0, 100)}`);
        }
    }
}

debug();
