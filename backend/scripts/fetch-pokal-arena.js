// Holt nach Abschluss eines Pokal-Spieltags (Kickbase-Liga "Pokal", in der ALLE
// Pokal-Teilnehmer gemeinsam stehen) die Spieltagspunkte und trägt sie in die
// laufenden Pokal-Duelle (pokal-data.json) ein.
//
// WICHTIG: Die Pokal-Liga läuft in einem anderen Kickbase-Spielmodus (gpm=4) als
// LIGA1-3 (gpm=1). In diesem Modus liefert /leagues/<id>/ranking IMMER eine leere
// "us"-Liste (seit Saisonstart 26/27, vorher kamen dort noch Daten) - auch mit
// ?dayNumber=N. Deshalb holen wir die Teilnehmer über /settings/managers und die
// Punkte PRO SPIELTAG direkt pro Manager über /managers/<uid>/performance
// (Feld it[].it[].mdp je "day"). Ein Vorher-Punktestand als Vergleichsbasis ist
// damit nicht mehr nötig - jede Runde kann auch nachträglich ausgewertet werden.
//
// Timing: Der erste Pokal-Spieltag ist NICHT der erste Bundesliga-Spieltag
// (siehe pokal-data.json meta.roundSchedule, z.B. Sechzehntelfinale = BL-Spieltag 5).
// Eine Runde wird ausgewertet, sobald ihr Rundendatum mind. 3 Tage zurückliegt
// (Puffer für den Fr-Mo-Spieltag) UND Kickbase den Spieltag nicht mehr als
// laufend ("cur") markiert. Bis dahin werden bei jedem Lauf vorläufige Punkte
// (match.provisional = true, ohne Sieger) eingetragen. Das Skript läuft täglich
// (update-pokal-results.yml).
//
// Unentschieden werden NICHT automatisch aufgelöst (winner bleibt null) - dafür
// gibt es aktuell keine festgelegte Regel. Solche Fälle werden klar geloggt.

const fs = require('fs');
const path = require('path');
const { getConfiguredKickbaseAccounts, loadExcludedManagerNames } = require('../kickbase');

const POKAL_LEAGUE_NAME = process.env.KICKBASE_LEAGUE_POKAL_NAME || 'Pokal';
const POKAL_DATA_PATH = path.join(__dirname, '../../frontend/public/pokal-data.json');
const MEMBERS_PATH = path.join(__dirname, '../../frontend/public/history/pokal-league-members.json');
const LINEUPS_PATH = path.join(__dirname, '../../frontend/public/history/pokal-lineups.json');
const API_BASE = 'https://api.kickbase.com/v4';
const FINALIZATION_HOUR_BERLIN = 18; // Montag 18:00 Uhr Berliner Zeit stehen finale Kickbase-Daten fest

// Jeder Rundenblock: seine beiden Bracket-Hälften, der Schlüssel in
// meta.roundSchedule, und der Platzhalter-Präfix, den die JEWEILS NÄCHSTE Runde
// für den Sieger nutzt (z.B. "Sieger AF3"). Wichtig: Die Nummerierung zählt
// INNERHALB der Runde neu ab 1 (Left vor Right) - NICHT die globale Match-ID!
const ROUND_SEQUENCE = [
    { keys: ['roundOf32Left', 'roundOf32Right'], scheduleName: 'Sechzehntelfinale', winnerPrefix: 'SF' },
    { keys: ['roundOf16Left', 'roundOf16Right'], scheduleName: 'Achtelfinale', winnerPrefix: 'AF' },
    { keys: ['quarterFinalsLeft', 'quarterFinalsRight'], scheduleName: 'Viertelfinale', winnerPrefix: 'VF' },
    { keys: ['semiFinalsLeft', 'semiFinalsRight'], scheduleName: 'Halbfinale', winnerPrefix: 'HF' },
    { keys: ['final'], scheduleName: 'Finale', winnerPrefix: null }
];

const isPlaceholderName = (name) => !name || name.startsWith('Sieger') || name === 'Freilos';

function parseGermanDateParts(str) {
    const [day, month, year] = str.split('.').map(Number);
    return { year, month, day };
}

// Liefert ein UTC-Date fuer das angegebene lokale Datum/Uhrzeit in Europe/Berlin
// (beruecksichtigt automatisch MEZ/MESZ ohne externe Timezone-Bibliothek).
function berlinLocalToUtcDate(year, month, day, hour, minute = 0) {
    const approxUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(approxUtc);
    const get = (t) => Number(parts.find(p => p.type === t)?.value ?? 0);
    const renderedAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), 0);
    const offsetMs = renderedAsUtc - approxUtc.getTime();
    return new Date(approxUtc.getTime() - offsetMs);
}

// Berechnet den exakten Finalisierungs-Zeitpunkt einer Pokalrunde:
// Der Montag NACH dem Runden-Datum (Samstag + 2 Tage, bei anderem Wochentag
// der naechste Montag danach) um 18:00 Uhr Europe/Berlin.
function getRoundFinalizationUtc(germanDateStr) {
    const { year, month, day } = parseGermanDateParts(germanDateStr);
    const baseUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dow = baseUtc.getUTCDay(); // 0=So, 1=Mo, ..., 6=Sa
    const daysUntilMonday = dow === 1 ? 0 : ((8 - dow) % 7);
    const mondayUtc = new Date(Date.UTC(year, month - 1, day + daysUntilMonday, 12, 0, 0));
    return berlinLocalToUtcDate(
        mondayUtc.getUTCFullYear(),
        mondayUtc.getUTCMonth() + 1,
        mondayUtc.getUTCDate(),
        FINALIZATION_HOUR_BERLIN,
        0
    );
}

async function kickbaseGet(url, token) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
    return res.json();
}

async function loginAndFindPokalLeague(email, pass) {
    const loginRes = await fetch(`${API_BASE}/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ em: email, loy: false, pass, rep: {} })
    });
    const loginData = await loginRes.json();
    if (!loginData.tkn) return null;

    const leaguesData = await kickbaseGet(`${API_BASE}/leagues`, loginData.tkn);
    const league = (leaguesData?.lins || []).find(l => (l.n || '').toLowerCase() === POKAL_LEAGUE_NAME.toLowerCase());
    return league ? { token: loginData.tkn, leagueId: league.i } : null;
}

// Liefert { managerName: { [day]: { mdp, cur } } } für alle echten Pokal-Teilnehmer.
async function fetchPokalMatchdayPoints() {
    const accounts = getConfiguredKickbaseAccounts();
    if (accounts.length === 0) {
        throw new Error('Kein Kickbase-Account konfiguriert (KICKBASE_EMAIL.../PASS... fehlen).');
    }

    let session = null;
    for (const account of accounts) {
        session = await loginAndFindPokalLeague(account.email, account.pass);
        if (session) break;
    }
    if (!session) throw new Error(`Pokal-Liga "${POKAL_LEAGUE_NAME}" in keinem konfigurierten Account gefunden.`);

    const { token, leagueId } = session;
    const excluded = loadExcludedManagerNames();
    // /settings/managers liefert max. 25 Einträge pro Seite (tc = Gesamtzahl),
    // weitere Seiten über ?start=N - sonst fehlen alphabetisch hintere Manager.
    const allManagers = [];
    let total = Infinity;
    while (allManagers.length < total) {
        const page = await kickbaseGet(`${API_BASE}/leagues/${leagueId}/settings/managers?start=${allManagers.length}`, token);
        const pageUsers = page.us || [];
        if (pageUsers.length === 0) break;
        allManagers.push(...pageUsers);
        total = page.tc ?? allManagers.length;
    }
    const managers = allManagers.filter(u => !excluded.includes(u.n));
    if (managers.length === 0) {
        throw new Error(`Pokal-Liga "${POKAL_LEAGUE_NAME}" (ID ${leagueId}) liefert 0 Teilnehmer - API-Antwort prüfen.`);
    }
    console.log(`Pokal-Liga "${POKAL_LEAGUE_NAME}" (ID ${leagueId}) gefunden, ${managers.length} Teilnehmer.`);

    const pointsByName = {};
    const managerByName = {};
    for (const manager of managers) {
        managerByName[manager.n] = { id: String(manager.i), name: manager.n };
        const perf = await kickbaseGet(`${API_BASE}/leagues/${leagueId}/managers/${manager.i}/performance`, token);
        // Ein Eintrag pro Saison - der letzte ist die laufende.
        const season = (perf.it || [])[(perf.it || []).length - 1];
        const days = {};
        (season?.it || []).forEach(d => { days[d.day] = { mdp: d.mdp, cur: !!d.cur }; });
        pointsByName[manager.n] = days;
    }
    return { pointsByName, managerByName, token, leagueId };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ruft fuer alle bereits gestarteten/abgeschlossenen Pokalrunden die echten
// Pokal-Arena-Startelfen (teamcenter?dayNumber=N) pro beteiligtem Manager ab
// und speichert sie in frontend/public/history/pokal-lineups.json.
// Bereits final gespeicherte Manager-Eintraege werden wiederverwendet, damit
// der taegliche Lauf kaum API-Calls verursacht.
async function syncPokalLineups({ token, leagueId, managerByName, pokalData, now }) {
    let existing = { updatedAt: null, matchdays: {} };
    if (fs.existsSync(LINEUPS_PATH)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(LINEUPS_PATH, 'utf8'));
            if (parsed && typeof parsed.matchdays === 'object') {
                existing = parsed;
            }
        } catch {
            // Fallback auf leere Struktur bei defekter Datei
        }
    }

    const forceRefresh = process.argv.includes('--refresh-lineups');
    const roundSchedule = pokalData.meta?.roundSchedule || {};
    let fetchedCount = 0;
    let skippedCount = 0;

    for (const round of ROUND_SEQUENCE) {
        const schedule = roundSchedule[round.scheduleName];
        if (!schedule || !schedule.matchday) continue;
        const day = schedule.matchday;
        const dayKey = String(day);
        const finalizationTime = getRoundFinalizationUtc(schedule.date);
        const isFinalRound = now >= finalizationTime;

        const roundMatches = round.keys.flatMap((k) => pokalData[k] || []);
        const roundHasActivity = roundMatches.some(
            (m) => !m.isBye && (m.winner != null || m.provisional || (m.score1 || 0) !== 0 || (m.score2 || 0) !== 0)
        );
        if (!roundHasActivity && !isFinalRound) continue;

        const targetManagers = new Map();
        for (const match of roundMatches) {
            if (match.isBye) continue;
            for (const name of [match.p1, match.p2]) {
                if (isPlaceholderName(name)) continue;
                const mgr = managerByName[name];
                if (mgr) targetManagers.set(mgr.id, mgr);
            }
        }
        if (targetManagers.size === 0) continue;

        const prevDay = existing.matchdays[dayKey] || {
            round: round.scheduleName,
            date: schedule.date,
            final: false,
            managers: {},
        };
        const nextManagers = { ...(prevDay.managers || {}) };

        for (const [uid, mgr] of targetManagers.entries()) {
            const prevEntry = nextManagers[uid];
            if (!forceRefresh && prevDay.final && prevEntry && Array.isArray(prevEntry.players)) {
                skippedCount++;
                continue;
            }

            try {
                const tc = await kickbaseGet(
                    `${API_BASE}/leagues/${leagueId}/users/${uid}/teamcenter?dayNumber=${day}`,
                    token
                );
                const userRow = (tc?.us || []).find((u) => String(u.i) === uid) || tc?.us?.[0] || null;
                const lpiById = new Map();
                for (const item of userRow?.lpi || []) {
                    if (item && item.i != null && item.pim) {
                        lpiById.set(String(item.i), item.pim);
                    }
                }

                const rawSlotIds = Array.isArray(userRow?.lp) ? userRow.lp : [];
                const emptySlots = rawSlotIds.length > 0
                    ? rawSlotIds.filter((slot) => slot == null).length
                    : Math.max(0, 11 - (Array.isArray(tc?.lp) ? tc.lp.length : 0));

                const players = (Array.isArray(tc?.lp) ? tc.lp : [])
                    .filter((p) => p && p.i != null)
                    .map((p) => {
                        const pid = String(p.i);
                        return {
                            playerId: pid,
                            name: p.n || '',
                            points: typeof p.p === 'number' ? p.p : 0,
                            teamId: p.tid != null ? Number(p.tid) : null,
                            imagePath: lpiById.get(pid) || null,
                        };
                    });

                nextManagers[uid] = {
                    name: mgr.name,
                    pointsMatchday: typeof userRow?.mdp === 'number' ? userRow.mdp : null,
                    emptySlots,
                    players,
                };
                fetchedCount++;
                await sleep(120);
            } catch (err) {
                console.warn(`⚠ Pokal-Lineup fuer ${mgr.name} (ST ${day}) fehlgeschlagen: ${err.message}`);
            }
        }

        existing.matchdays[dayKey] = {
            round: round.scheduleName,
            date: schedule.date,
            final: isFinalRound,
            managers: nextManagers,
        };
    }

    existing.updatedAt = new Date().toISOString();
    fs.writeFileSync(LINEUPS_PATH, JSON.stringify(existing, null, 2));
    console.log(`Pokal-Aufstellungen synchronisiert: ${fetchedCount} frisch geladen, ${skippedCount} final gecacht.`);
}

// Für jede Match-ID: Platzhalter-String, den eine SPÄTERE Runde für ihren Sieger
// verwendet (z.B. m23 -> "Sieger AF7"). null für Matches ohne Folgerunde (Finale).
function buildWinnerPlaceholders(pokalData) {
    const placeholderByMatchId = {};
    ROUND_SEQUENCE.forEach(round => {
        if (!round.winnerPrefix) return;
        let position = 0;
        round.keys.forEach(key => {
            (pokalData[key] || []).forEach(match => {
                position++;
                placeholderByMatchId[match.id] = `Sieger ${round.winnerPrefix}${position}`;
            });
        });
    });
    return placeholderByMatchId;
}

function propagateWinner(pokalData, placeholder, winnerName) {
    let propagated = false;
    ROUND_SEQUENCE.forEach(round => {
        round.keys.forEach(key => {
            (pokalData[key] || []).forEach(match => {
                if (match.p1 === placeholder) { match.p1 = winnerName; propagated = true; }
                if (match.p2 === placeholder) { match.p2 = winnerName; propagated = true; }
            });
        });
    });
    return propagated;
}

async function run() {

    if (!fs.existsSync(POKAL_DATA_PATH)) {
        throw new Error(`pokal-data.json nicht gefunden unter ${POKAL_DATA_PATH}`);
    }
    const pokalData = JSON.parse(fs.readFileSync(POKAL_DATA_PATH, 'utf8'));
    const roundSchedule = pokalData.meta?.roundSchedule || {};

    const { pointsByName, managerByName, token, leagueId } = await fetchPokalMatchdayPoints();

    // Für den grünen Haken im Pokal-Bracket (Pokal.jsx): welche Namen sind
    // TATSÄCHLICH schon Mitglied der Kickbase-Liga "Pokal"? Wird bei JEDEM Lauf
    // aktualisiert, unabhängig vom Runden-Timing - das ist reine Beitritts-Info.
    fs.writeFileSync(MEMBERS_PATH, JSON.stringify({
        updatedAt: new Date().toISOString(),
        leagueName: POKAL_LEAGUE_NAME,
        members: Object.keys(pointsByName).sort()
    }, null, 2));

    const now = new Date();

    const winnerPlaceholders = buildWinnerPlaceholders(pokalData);
    let resolvedCount = 0;
    let tieCount = 0;
    let missingDataCount = 0;

    // Spieltagspunkte eines Managers nach Finalisierung (Montag 18:00 Berlin).
    // Wichtig: Kickbase laesst `cur: true` oft bis zum Anpfiff des NAECHSTEN
    // Spieltags stehen! Sobald Montag 18:00 Uhr ueberschritten ist, gelten die
    // gelieferten Punkte deshalb als final, auch wenn `entry.cur` noch true ist.
    const matchdayPoints = (name, day) => {
        const entry = pointsByName[name]?.[day];
        if (!entry) return null;
        return entry.mdp ?? 0;
    };

    ROUND_SEQUENCE.forEach(round => {
        const schedule = roundSchedule[round.scheduleName];
        if (!schedule) {
            console.warn(`⚠ Keine roundSchedule-Angabe für "${round.scheduleName}" gefunden - übersprungen.`);
            return;
        }
        const day = schedule.matchday;
        const finalizationTime = getRoundFinalizationUtc(schedule.date);

        if (now < finalizationTime) {
            // Spieltag läuft (oder hat noch nicht begonnen / vor Montag 18:00 Berlin):
            // vorläufige Punkte eintragen, sobald Kickbase welche liefert - ohne Sieger.
            let liveCount = 0;
            round.keys.forEach(key => {
                (pokalData[key] || []).forEach(match => {
                    if (match.winner || isPlaceholderName(match.p1) || isPlaceholderName(match.p2)) return;
                    const p1Live = pointsByName[match.p1]?.[day]?.mdp;
                    const p2Live = pointsByName[match.p2]?.[day]?.mdp;
                    if (p1Live == null && p2Live == null) return;
                    match.score1 = p1Live ?? 0;
                    match.score2 = p2Live ?? 0;
                    match.provisional = true;
                    liveCount++;
                });
            });
            const finLabel = finalizationTime.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
            console.log(`${round.scheduleName} (BL-Spieltag ${day}) noch nicht final - ${liveCount} Duelle mit vorläufigen Punkten, finale Auswertung ab ${finLabel} Uhr.`);
            return;
        }

        round.keys.forEach(key => {
            (pokalData[key] || []).forEach(match => {
                if (match.winner || isPlaceholderName(match.p1) || isPlaceholderName(match.p2)) return;

                const p1Points = matchdayPoints(match.p1, day);
                const p2Points = matchdayPoints(match.p2, day);

                // Nichtantritt: Wer der Pokal-Liga nie beigetreten ist, verliert
                // kampflos - auch wenn der Gegner Minuspunkte geholt hat.
                const p1Member = match.p1 in pointsByName;
                const p2Member = match.p2 in pointsByName;
                if (p1Member !== p2Member) {
                    const memberPoints = p1Member ? p1Points : p2Points;
                    if (memberPoints == null) {
                        console.warn(`⚠ ${match.id}: Spieltag ${day} für "${p1Member ? match.p1 : match.p2}" noch nicht final - übersprungen.`);
                        missingDataCount++;
                        return;
                    }
                    match.score1 = p1Member ? memberPoints : 0;
                    match.score2 = p2Member ? memberPoints : 0;
                    match.winner = p1Member ? 1 : 2;
                    match.walkover = true;
                    delete match.provisional;
                    const winnerName = p1Member ? match.p1 : match.p2;
                    resolvedCount++;
                    console.log(`✓ ${match.id}: ${winnerName} zieht kampflos weiter (Nichtantritt von "${p1Member ? match.p2 : match.p1}").`);
                    const placeholder = winnerPlaceholders[match.id];
                    if (placeholder && propagateWinner(pokalData, placeholder, winnerName)) {
                        console.log(`  -> als "${placeholder}" in der nächsten Runde eingetragen.`);
                    }
                    return;
                }

                if (p1Points == null || p2Points == null) {
                    console.warn(`⚠ ${match.id}: Keine finalen Spieltag-${day}-Punkte für "${match.p1}" oder "${match.p2}" in Pokal-Liga "${POKAL_LEAGUE_NAME}" (nicht Mitglied, Name abweichend oder Spieltag läuft noch) - übersprungen.`);
                    missingDataCount++;
                    return;
                }

                match.score1 = p1Points;
                match.score2 = p2Points;
                delete match.provisional;

                if (p1Points === p2Points) {
                    console.warn(`⚠ ${match.id}: ${match.p1} vs ${match.p2} steht ${p1Points}:${p2Points} - UNENTSCHIEDEN, Sieger muss manuell eingetragen werden.`);
                    tieCount++;
                    return;
                }

                match.winner = p1Points > p2Points ? 1 : 2;
                const winnerName = match.winner === 1 ? match.p1 : match.p2;
                resolvedCount++;
                console.log(`✓ ${match.id}: ${match.p1} (${p1Points}) vs ${match.p2} (${p2Points}) -> ${winnerName} zieht weiter.`);

                const placeholder = winnerPlaceholders[match.id];
                if (placeholder && propagateWinner(pokalData, placeholder, winnerName)) {
                    console.log(`  -> als "${placeholder}" in der nächsten Runde eingetragen.`);
                }
            });
        });
    });

    fs.writeFileSync(POKAL_DATA_PATH, JSON.stringify(pokalData, null, 2));

    await syncPokalLineups({ token, leagueId, managerByName, pokalData, now });

    console.log(`\nFertig: ${resolvedCount} Duelle ausgewertet, ${tieCount} Unentschieden (manuell prüfen), ${missingDataCount} ohne Daten.`);
}

run().catch(err => {
    console.error('Fehler beim Abruf der Pokal-Ergebnisse:', err.message);
    process.exit(1);
});
