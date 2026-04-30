require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function testEndpoints() {
    const email = process.env.KICKBASE_EMAIL;
    const password = process.env.KICKBASE_PASS;

    const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ em: email, loy: false, pass: password, rep: {} })
    });
    const loginData = await loginRes.json();
    if (loginData.err) {
        console.error("Login failed:", loginData.errMsg);
        return;
    }
    const token = loginData.tkn;

    const teamId = 2; // Bayern
    const urlsToTest = [
        `https://api.kickbase.com/v4/competitions/1/teams/${teamId}/players`,
        `https://api.kickbase.com/v4/competitions/1/players`,
        `https://api.kickbase.com/v4/teams/${teamId}`,
        `https://api.kickbase.com/v4/competitions/1/teams/${teamId}`
    ];

    for (const url of urlsToTest) {
        console.log(`Testing: ${url}`);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`Status: ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            const list = data.it || data.players || data.pl || data.p || [];
            console.log(`Found: ${list.length} items`);
        }
    }
}
testEndpoints();
