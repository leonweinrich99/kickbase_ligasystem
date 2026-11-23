require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// TEMPORAERES Diagnose-Script (Chat 23.11.2026): prueft, ob/wie sich Live-
// Punkte fuer ein beliebiges ECHTES Fussball-Team (hier: La Liga, nicht nur
// Bundesliga) ueber die Kickbase-v4-API abrufen lassen - Grundlage fuer einen
// Test-Baustein in der App. Nutzt NUR GET, veraendert nichts.
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

async function getJson(url, token) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const text = await res.text();
    try { return { status: res.status, body: JSON.parse(text) }; }
    catch { return { status: res.status, body: text.slice(0, 300) }; }
}

async function run() {
    const accounts = getConfiguredKickbaseAccounts();
    const token = await login(accounts[0].email, accounts[0].pass);
    console.log('Login OK\n');

    console.log('--- GET /v4/competitions ---');
    const comps = await getJson(`${API_BASE}/competitions`, token);
    console.log('status:', comps.status);
    console.log(JSON.stringify(comps.body, null, 2));

    const list = comps.body?.it || comps.body?.competitions || (Array.isArray(comps.body) ? comps.body : []);
    const laliga = list.find(c => /la ?liga/i.test(c.n || c.name || ''));
    if (!laliga) {
        console.log('\nKeine La-Liga-Competition gefunden in der Liste oben.');
        return;
    }
    const laligaId = laliga.i || laliga.id;
    console.log(`\nLa Liga gefunden: id=${laligaId} name=${laliga.n || laliga.name}`);

    console.log(`\n--- GET /v4/competitions/${laligaId}/matchdays ---`);
    const matchdays = await getJson(`${API_BASE}/competitions/${laligaId}/matchdays`, token);
    console.log('status:', matchdays.status);
    const allMatches = (matchdays.body?.it || []).flatMap(md => (md.it || []).map(m => ({ ...m, day: md.day })));
    console.log(`Spiele gesamt: ${allMatches.length}`);
    const liveMatches = allMatches.filter(m => m.il === true);
    console.log(`Live-Spiele: ${liveMatches.length}`);
    liveMatches.forEach(m => console.log(' ', JSON.stringify(m)));

    const sample = liveMatches[0] || [...allMatches].reverse().find(m => m.st === 2) || allMatches[allMatches.length - 1];
    if (!sample) { console.log('Kein Beispiel-Match gefunden.'); return; }
    console.log('\nVerwende Beispiel-Match:', JSON.stringify(sample));

    console.log(`\n--- GET /v4/matches/${sample.mi}/details ---`);
    const details = await getJson(`${API_BASE}/matches/${sample.mi}/details`, token);
    console.log('status:', details.status);
    const t1lp = details.body?.t1lp || [];
    console.log(`Team 1 (${details.body?.t1n}) Startelf-Spieler: ${t1lp.length}`);
    console.log(JSON.stringify(t1lp.slice(0, 3)));

    if (t1lp.length > 0) {
        const p = t1lp[0];
        console.log(`\n--- GET /v4/competitions/${laligaId}/playercenter/${p.i}?dayNumber=${sample.day} (OHNE leagueId) ---`);
        const pc = await getJson(`${API_BASE}/competitions/${laligaId}/playercenter/${p.i}?dayNumber=${sample.day}`, token);
        console.log('status:', pc.status);
        console.log(JSON.stringify(pc.body, null, 2).slice(0, 1500));
    }
}

run().catch(e => { console.error('Fehler:', e.message); process.exit(1); });
