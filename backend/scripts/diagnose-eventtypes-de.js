require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// TEMPORAERES Diagnose-Script (Chat 23.11.2026): prueft, ob /v4/live/eventtypes
// deutsche Titel liefert, wenn man Accept-Language mitschickt (Owner-Wunsch:
// "informiere dich ob man fuer die Beschreibungen auch die deutsche
// Beschreibung haben kann"). Nutzt NUR GET, veraendert nichts.
const { getConfiguredKickbaseAccounts } = require('../kickbase');

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

const targets = [4012, 4198, 4240, 4342, 4270, 4267, 4201, 4186, 4189, 4204, 4087, 4015, 4249, 4246, 4111, 4180, 4009, 4003];

async function tryHeaders(token, headers, label) {
    const res = await fetch(`${API_BASE}/live/eventtypes`, { headers: { Authorization: `Bearer ${token}`, ...headers } });
    const data = await res.json();
    const map = new Map((data.it || []).map(x => [x.i, x.ti]));
    console.log(`\n--- ${label} (status ${res.status}, total ${data.it?.length}) ---`);
    targets.slice(0, 6).forEach(t => console.log(' ', t, '->', map.get(t)));
}

async function run() {
    const accounts = getConfiguredKickbaseAccounts();
    const token = await login(accounts[0].email, accounts[0].pass);
    console.log('Login OK');

    await tryHeaders(token, {}, 'ohne Accept-Language');
    await tryHeaders(token, { 'Accept-Language': 'de' }, 'Accept-Language: de');
    await tryHeaders(token, { 'Accept-Language': 'de-DE' }, 'Accept-Language: de-DE');
    await tryHeaders(token, { 'Accept-Language': 'de-DE,de;q=0.9' }, 'Accept-Language: de-DE,de;q=0.9');

    // Auch als Query-Param probieren, manche Kickbase-Endpunkte nutzen das.
    const res = await fetch(`${API_BASE}/live/eventtypes?lang=de`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const map = new Map((data.it || []).map(x => [x.i, x.ti]));
    console.log(`\n--- ?lang=de (status ${res.status}) ---`);
    targets.slice(0, 6).forEach(t => console.log(' ', t, '->', map.get(t)));
}

run().catch(e => { console.error('Fehler:', e.message); process.exit(1); });
