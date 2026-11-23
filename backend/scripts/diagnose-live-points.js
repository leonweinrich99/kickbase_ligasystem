require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// TEMPORAERES Diagnose-Script (siehe TODO/Chat 23.11.2026): prueft, ob/wie sich
// Live-Punkte des eigenen Kaders waehrend eines laufenden Spiels ueber die
// Kickbase-v4-API abrufen lassen (Owner-Wunsch: "Live Punkte des eigenen
// Kaders waehrend des Spiels sehen", analog zur Spieler-Detail-Ansicht unter
// Matches -> Aufstellungen -> Spieler in der offiziellen App).
// Nutzt NUR GET-Endpunkte, veraendert nichts. Wird nach der Analyse wieder
// entfernt (gleiches Muster wie fruehere "chore: temporaere Diagnose"-Commits
// in diesem Repo).
const { getConfiguredKickbaseAccounts, LEAGUE_DEFS } = require('../kickbase');

const API_BASE = 'https://api.kickbase.com/v4';
const COMPETITION_ID = '1'; // Bundesliga - gleiche ID wie an anderen Stellen im Code (competitions/1/...)

async function login(email, pass) {
    const res = await fetch(`${API_BASE}/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ em: email, loy: false, pass, rep: {} })
    });
    const data = await res.json();
    if (data.err || !data.tkn) throw new Error(`Login fehlgeschlagen fuer ${email}: ${data.errMsg || 'kein Token'}`);
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

async function getJson(url, token) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const text = await res.text();
    try {
        return { status: res.status, body: JSON.parse(text) };
    } catch {
        return { status: res.status, body: text.slice(0, 500) };
    }
}

async function run() {
    const accounts = getConfiguredKickbaseAccounts();
    if (accounts.length === 0) {
        console.error('Kein Kickbase-Account konfiguriert (KICKBASE_EMAIL/PASS fehlen).');
        process.exit(1);
    }

    let token = null;
    let leagueId = null;
    let usedAccount = null;

    outer: for (const account of accounts) {
        token = await login(account.email, account.pass);
        for (const def of LEAGUE_DEFS) {
            leagueId = await findLeagueId(token, def.name);
            if (leagueId) {
                usedAccount = account.email;
                break outer;
            }
        }
    }

    if (!leagueId) {
        console.error('Keine Liga gefunden ueber alle konfigurierten Accounts.');
        process.exit(1);
    }

    console.log(`\n=== Login OK (${usedAccount}), leagueId=${leagueId} ===\n`);

    // 1) Eigener Kader mit Live-Punkten (ap-Feld) - direkte Quelle fuer "Live
    // Punkte meines Kaders", ohne pro Spieler einzeln nachfragen zu muessen.
    console.log('--- GET /v4/leagues/{leagueId}/lineup/overview ---');
    const lineupOverview = await getJson(`${API_BASE}/leagues/${leagueId}/lineup/overview`, token);
    console.log('status:', lineupOverview.status);
    console.log(JSON.stringify(lineupOverview.body, null, 2));

    const lp = Array.isArray(lineupOverview.body?.lp) ? lineupOverview.body.lp : [];
    console.log(`\nSpieler im lineup/overview: ${lp.length}`);

    // 2) Aktuellen/laufenden Spieltag + eine laufende/aktuelle Partie finden.
    console.log('\n--- GET /v4/competitions/1/matchdays ---');
    const matchdays = await getJson(`${API_BASE}/competitions/${COMPETITION_ID}/matchdays`, token);
    console.log('status:', matchdays.status);
    const allMatches = (matchdays.body?.it || []).flatMap(md => (md.it || []).map(m => ({ ...m, day: md.day })));
    const liveMatch = allMatches.find(m => m.il === true);
    const latestFinished = [...allMatches].reverse().find(m => m.st === 2 || m.mst === 2);
    const sampleMatch = liveMatch || latestFinished || allMatches[allMatches.length - 1];
    console.log(`Gefundene Spiele gesamt: ${allMatches.length}`);
    console.log('Live-Match gefunden:', !!liveMatch);
    console.log('Beispiel-Match fuer Detail-Abfrage:', JSON.stringify(sampleMatch));

    // 3) Match-Details (Aufstellungen, Events) fuer ein konkretes Spiel - das
    // ist die "Matches -> Aufstellungen"-Ansicht aus der echten App.
    if (sampleMatch?.mi) {
        console.log(`\n--- GET /v4/matches/${sampleMatch.mi}/details ---`);
        const matchDetails = await getJson(`${API_BASE}/matches/${sampleMatch.mi}/details`, token);
        console.log('status:', matchDetails.status);
        console.log(JSON.stringify(matchDetails.body, null, 2).slice(0, 4000));
    }

    // 4) Player Center fuer EINEN Spieler aus dem eigenen Kader - das ist die
    // "Spieler anklicken -> Live-Punkte-Uebersicht"-Ansicht aus der echten App.
    const samplePlayer = lp.find(p => p.pi) || null;
    if (samplePlayer) {
        const dayNumber = sampleMatch?.day || matchdays.body?.it?.[matchdays.body.it.length - 1]?.day || '';
        const url = `${API_BASE}/competitions/${COMPETITION_ID}/playercenter/${samplePlayer.pi}?dayNumber=${dayNumber}&leagueId=${leagueId}`;
        console.log(`\n--- GET /v4/competitions/1/playercenter/${samplePlayer.pi}?dayNumber=${dayNumber}&leagueId=${leagueId} ---`);
        console.log('Spieler:', samplePlayer.n);
        const playerCenter = await getJson(url, token);
        console.log('status:', playerCenter.status);
        console.log(JSON.stringify(playerCenter.body, null, 2));
    } else {
        console.log('\nKein Spieler im eigenen Kader gefunden fuer playercenter-Test.');
    }

    console.log('\n=== Diagnose abgeschlossen ===');
}

run().catch(e => {
    console.error('Fehler:', e.message);
    process.exit(1);
});
