require('dotenv').config();
const fs = require('fs');

async function debug() {
    const email = process.env.KICKBASE_EMAIL;
    const password = process.env.KICKBASE_PASS;
    const targetLeagueName = process.env.KICKBASE_LEAGUE || "test";

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
    let league = leagues.find(l => (l.n || l.name || "").toLowerCase().includes(targetLeagueName.toLowerCase())) || leagues[0];
    const leagueId = league.i || league.id;

    console.log(`Testing Team Fetch for League ${leagueId}...`);

    const testTeamId = 7; // Leverkusen
    const url1 = `https://api.kickbase.com/v4/leagues/${leagueId}/teams/${testTeamId}/players`;
    const url2 = `https://api.kickbase.com/v4/teams/${testTeamId}/players`;

    console.log(`Trying ${url1}...`);
    const r1 = await fetch(url1, { headers: { Authorization: `Bearer ${token}` } });
    console.log(`Status: ${r1.status}`);
    if (r1.ok) {
        const d1 = await r1.json();
        console.log(`Players found: ${ (d1.it || d1.players || d1.pl || []).length }`);
    }

    console.log(`Trying ${url2}...`);
    const r2 = await fetch(url2, { headers: { Authorization: `Bearer ${token}` } });
    console.log(`Status: ${r2.status}`);
    if (r2.ok) {
        const d2 = await r2.json();
        console.log(`Players found: ${ (d2.it || d2.players || d2.pl || []).length }`);
    }
}

debug();
