const fs = require('fs');
const path = require('path');
const { LEAGUE_DEFS } = require('../kickbase');

const getConfiguredKickbaseAccounts = () => {
    const accounts = [];
    for (const suffix of ['', '_2', '_3']) {
        const email = process.env[`KICKBASE_EMAIL${suffix}`];
        const pass = process.env[`KICKBASE_PASS${suffix}`];
        if (email && pass) accounts.push({ email, pass });
    }
    return accounts;
};

async function fetchFeedForLeague(email, password, leagueNameContains) {
    const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ em: email, loy: false, pass: password, rep: {} })
    });
    const loginData = await loginRes.json();
    if (loginData.err) return { error: loginData.errMsg };

    const token = loginData.tkn;
    const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', { headers: { Authorization: `Bearer ${token}` } });
    const leaguesData = await leaguesRes.json();
    
    let targetId = null;
    const leaguesList = leaguesData?.lins || leaguesData?.leagues || (Array.isArray(leaguesData) ? leaguesData : []);
    
    const needleTokens = leagueNameContains.toLowerCase().match(/[a-z0-9]+/g) || [];
    for (const l of leaguesList) {
        const leagueName = (l.n || l.name).toLowerCase();
        const leagueTokens = leagueName.match(/[a-z0-9]+/g) || [];
        const isMatch = needleTokens.every(token => leagueTokens.includes(token));
        if (isMatch || leagueName.includes(leagueNameContains.toLowerCase())) {
            targetId = l.i || l.id;
            break;
        }
    }

    if (!targetId) return { error: `League not found` };

    let allTransfers = [];
    let start = 0;
    // Holen wir die ersten 3 Seiten (a 25 Einträge) vom Feed
    for (let page = 0; page < 4; page++) {
        const feedRes = await fetch(`https://api.kickbase.com/v4/leagues/${targetId}/feed?start=${start}`, { headers: { Authorization: `Bearer ${token}` } });
        if (feedRes.status !== 200) break;
        const feedData = await feedRes.json();
        const items = feedData.items || feedData.i || feedData;
        if (!items || items.length === 0) break;
        
        // Transfers sind typischerweise type 2 oder 12
        const transfers = items.filter(i => i.t === 12 || i.type === 12 || i.t === 2 || i.type === 2);
        allTransfers = allTransfers.concat(transfers);
        
        start += 25;
    }

    return { transfers: allTransfers };
}

async function run() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.log("Fetching transfer feeds...");
    const accounts = getConfiguredKickbaseAccounts();
    if (accounts.length === 0) {
        console.error("No accounts configured.");
        return;
    }

    const transfersFile = path.join(__dirname, '../../frontend/public/history/transfers.json');
    let existingTransfers = [];
    if (fs.existsSync(transfersFile)) {
        try {
            existingTransfers = JSON.parse(fs.readFileSync(transfersFile, 'utf8'));
        } catch (e) {}
    }

    const seenIds = new Set(existingTransfers.map(t => t.id || t.i));
    let newTransfersCount = 0;

    for (const def of LEAGUE_DEFS) {
        for (const account of accounts) {
            console.log(`Checking ${def.displayName} with ${account.email}...`);
            const res = await fetchFeedForLeague(account.email, account.pass, def.name);
            if (!res.error && res.transfers) {
                res.transfers.forEach(t => {
                    const tid = t.id || t.i;
                    if (!seenIds.has(tid)) {
                        seenIds.add(tid);
                        // Speichere die Liga-Info dazu
                        existingTransfers.push({ ...t, _league: def.displayName });
                        newTransfersCount++;
                    }
                });
                break; // Erfolgreich gefunden, Account-Schleife abbrechen
            }
        }
    }

    // Sortiere absteigend nach Datum (z.b. t.d oder t.date)
    existingTransfers.sort((a, b) => {
        const dateA = new Date(a.d || a.date || 0);
        const dateB = new Date(b.d || b.date || 0);
        return dateB - dateA;
    });

    fs.writeFileSync(transfersFile, JSON.stringify(existingTransfers, null, 2));
    console.log(`Added ${newTransfersCount} new transfers. Total transfers saved: ${existingTransfers.length}`);
}

run();
