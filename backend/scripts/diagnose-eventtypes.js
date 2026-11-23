require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// TEMPORAERES Diagnose-Script (Chat 23.11.2026): prueft, ob /v4/live/eventtypes
// eine aktuelle Zuordnung von Event-Type-IDs (eti aus den playercenter-
// events) zu Klartext-Titeln liefert - Grundlage fuer eine lesbare
// Punkte-Event-Liste beim Klick auf einen Spieler ("wie im echten Live-
// Modus"). Nutzt NUR GET, veraendert nichts.
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

async function run() {
    const accounts = getConfiguredKickbaseAccounts();
    const token = await login(accounts[0].email, accounts[0].pass);
    console.log('Login OK\n');

    const res = await fetch(`${API_BASE}/live/eventtypes`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    console.log('status:', res.status);
    console.log('lcud:', data.lcud, '| total entries:', (data.it || []).length);

    const targets = [4012, 4198, 4240, 4342, 4270, 4267, 4201, 4186, 4189, 4204, 4087, 4015, 4249, 4246, 4111, 4180, 4009, 4003, 4270, 4267];
    const map = new Map((data.it || []).map(x => [x.i, x.ti]));
    console.log('\n--- Abgleich mit echten eti-Codes aus unserem playercenter-Test ---');
    [...new Set(targets)].forEach(t => console.log(t, '->', map.get(t) || 'NICHT GEFUNDEN'));

    const ids = (data.it || []).map(x => x.i).sort((a, b) => a - b);
    console.log('\nmin id:', ids[0], 'max id:', ids[ids.length - 1]);
    console.log('Anzahl IDs >= 4000:', ids.filter(i => i >= 4000).length);

    console.log('\n--- VOLLE LISTE (fuer Log-Export) ---');
    console.log('FULL_EVENTTYPES_JSON_START');
    console.log(JSON.stringify(data));
    console.log('FULL_EVENTTYPES_JSON_END');
}

run().catch(e => { console.error('Fehler:', e.message); process.exit(1); });
