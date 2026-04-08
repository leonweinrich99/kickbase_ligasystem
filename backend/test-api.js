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

        const urls = [
            'https://api.kickbase.com/v4/leagues/10320440/ranking',
            'https://api.kickbase.com/v4/leagues/10320440/feed',
            'https://api.kickbase.com/v4/leagues/10320440/market'
        ];
        
        for (const url of urls) {
            const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            console.log(url, r.status);
            if (r.status === 200) {
                const data = await r.json();
                console.log(`- ${url} OK! Keys:`, Object.keys(data).slice(0, 5));
            } else {
                console.log(`- ${url} FAILED! Status:`, r.status);
            }
        }

    } catch (e) {
        console.error(e);
    }
}
test();
