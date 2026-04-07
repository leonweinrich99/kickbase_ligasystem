process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');

async function test() {
    try {
        const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ em: 'weinrich99@gmail.com', loy: false, pass: 'fifxe0-Puztuv-wawmen', rep: {} })
        });
        const loginData = await loginRes.json();
        const token = loginData.tkn;

        const endpoints = [
            'https://api.kickbase.com/leagues/10320440/stats',
            'https://api.kickbase.com/leagues/10320440/users',
            'https://api.kickbase.com/v4/leagues/10320440/ranking',
            'https://api.kickbase.com/v4/leagues/10320440/users'
        ];
        for (let url of endpoints) {
            const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            console.log(url, r.status);
            if (r.status === 200) {
                fs.writeFileSync('stats.json', await r.text());
                break;
            }
        }

    } catch (e) {
        console.error(e);
    }
}
test();
