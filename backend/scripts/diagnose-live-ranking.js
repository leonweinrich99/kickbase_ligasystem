require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// TEMPORAERES Diagnose-Script (siehe Chat 23.11.2026): prueft, ob ein
// EINZIGER teamcenter-Call wirklich ALLE Manager einer Liga mit ihren
// Live-Spieltagspunkten (mdp) zurueckgibt - Grundlage fuer die neue
// live-ranking.js-Route. Nutzt NUR GET, veraendert nichts.
const { getConfiguredKickbaseAccounts, LEAGUE_DEFS } = require('../kickbase');

const API_BASE = 'https://api.kickbase.com/v4';

async function login(email, pass) {
    const res = await fetch(`${API_BASE}/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ em: email, loy: false, pass, rep: {} })
    });
    const data = await res.json();
    if (data.err || !data.tkn) throw new Error(`Login fehlgeschlagen: ${data.errMsg || 'kein Token'}`);
    return data.tkn;
}

async function findLeagueId(token, leagueNameContains) {
    const res = await fetch(`${API_BASE}/leagues`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const list = data?.lins || data?.leagues || (Array.isArray(data) ? data : []);
    const needle = leagueNameContains.toLowerCase().match(/[a-z0-9]+/g) || [];
    for (const l of list) {
        const name = (l.n || l.name || '').toLowerCase();
        const tokens = name.match(/[a-z0-9]+/g) || [];
        if (needle.every(t => tokens.includes(t)) || name.includes(leagueNameContains.toLowerCase())) {
            return l.i || l.id;
        }
    }
    return null;
}

async function run() {
    const accounts = getConfiguredKickbaseAccounts();
    let token = null, leagueId = null;
    outer: for (const account of accounts) {
        token = await login(account.email, account.pass);
        for (const def of LEAGUE_DEFS) {
            leagueId = await findLeagueId(token, def.name);
            if (leagueId) break outer;
        }
    }
    if (!leagueId) throw new Error('Keine Liga gefunden');

    const rankingRes = await fetch(`${API_BASE}/leagues/${leagueId}/ranking`, { headers: { Authorization: `Bearer ${token}` } });
    const rankingData = await rankingRes.json();
    const day = rankingData.day;
    const anyUserId = rankingData.us?.[0]?.i;
    console.log(`leagueId=${leagueId}, day=${day}, anchor userId=${anyUserId}, total ranking entries=${rankingData.us?.length}`);

    const tcRes = await fetch(`${API_BASE}/leagues/${leagueId}/users/${anyUserId}/teamcenter?dayNumber=${day}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const tcData = await tcRes.json();
    console.log(`\nteamcenter.us length: ${(tcData.us || []).length}`);
    (tcData.us || []).forEach(u => {
        console.log(`  i=${u.i}  unm=${u.unm}  mdp=${u.mdp}  lp.length=${(u.lp || []).length}`);
    });
}

run().catch(e => { console.error('Fehler:', e.message); process.exit(1); });
