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
    console.log("Login Status:", loginRes.status);
    console.log("Login Keys:", Object.keys(loginData));
    
    const token = loginData.tkn;
    if (!token) {
        console.log("ERROR: No token found");
        return;
    }

    // Test a simple endpoint: competitions
    const compRes = await fetch('https://api.kickbase.com/v4/competitions', {
        headers: { Authorization: `Bearer ${token}` }
    });
    const compData = await compRes.json();
    console.log("Competitions:", JSON.stringify(compData).substring(0, 200));

    // Test team players (Bayern ID: 2)
    const teamId = 2;
    const urls = [
        `https://api.kickbase.com/competition/teams/${teamId}/players`,
        `https://api.kickbase.com/v4/competitions/1/teams/${teamId}/players`,
        `https://api.kickbase.com/v4/base/teams/${teamId}/players`
    ];

    for (const url of urls) {
        console.log(`Testing URL: ${url}`);
        const r = await fetch(url, {
            headers: { 
                Authorization: `Bearer ${token}`,
                Cookie: `kkstrauth=${token}`
            }
        });
        console.log(`  Status: ${r.status}`);
        const text = await r.text();
        console.log(`  Response (start): ${text.substring(0, 200)}`);
        try {
            const d = JSON.parse(text);
            const list = d.p || d.players || d.pl || [];
            console.log(`  Found ${Array.isArray(list) ? list.length : 'N/A'} players.`);
        } catch (e) {
            console.log(`  Error parsing JSON: ${e.message}`);
        }
    }
}

debug();
