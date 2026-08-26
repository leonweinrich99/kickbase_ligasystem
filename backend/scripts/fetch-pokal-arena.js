// Holt nach Abschluss eines Pokal-Spieltags (Kickbase-Liga "Pokal", in der ALLE
// Pokal-Teilnehmer gemeinsam stehen) die Spieltagspunkte und trägt sie in die
// laufenden Pokal-Duelle (pokal-data.json) ein.
//
// Kickbase liefert über die Ranking-API nur die KUMULIERTE Saison-Gesamtpunktzahl
// (u.sp), keine "Punkte nur für diesen Spieltag". Deshalb braucht dieses Skript
// einen Punktestand von VOR dem jeweiligen Pokal-Spieltag als Vergleichsbasis.
//
// WICHTIG: Der erste Pokal-Spieltag ist NICHT der erste Bundesliga-Spieltag
// (siehe pokal-data.json meta.roundSchedule, z.B. Sechzehntelfinale = BL-Spieltag 5).
// Wir nutzen deshalb NICHT Kickbases eigenen (mehrdeutigen) "aktueller Spieltag"-
// Zähler als Zeitsteuerung, sondern die bereits hinterlegten Kalenderdaten pro
// Runde (roundSchedule[...].date):
//   - Liegt "heute" VOR dem Rundendatum: Punktestand als Vergleichsbasis für
//     diese Runde sichern (wird bei jedem Lauf aufgefrischt, bis die Runde beginnt).
//   - Liegt "heute" mind. 3 Tage NACH dem Rundendatum (Puffer für Fr-Mo-Spieltag):
//     Runde auswerten, sofern eine Vergleichsbasis vorhanden ist.
//   - Dazwischen (Spieltag läuft gerade): nichts tun, abwarten.
// Das Skript sollte daher regelmäßig laufen (siehe update-pokal-results.yml),
// nicht nur einmal am vermuteten Auswertungstag.
//
// Unentschieden werden NICHT automatisch aufgelöst (winner bleibt null) - dafür
// gibt es aktuell keine festgelegte Regel. Solche Fälle werden klar geloggt.

const fs = require('fs');
const path = require('path');
const { fetchSingleLeagueData, getConfiguredKickbaseAccounts } = require('../kickbase');

const POKAL_LEAGUE_NAME = process.env.KICKBASE_LEAGUE_POKAL_NAME || 'Pokal';
const POKAL_DATA_PATH = path.join(__dirname, '../../frontend/public/pokal-data.json');
const SNAPSHOT_PATH = path.join(__dirname, '../../frontend/public/history/_pokal_points_snapshot.json');
const MEMBERS_PATH = path.join(__dirname, '../../frontend/public/history/pokal-league-members.json');
const EVALUATION_BUFFER_DAYS = 3; // Bundesliga-Spieltage laufen Fr-Mo, daher 3 Tage Puffer ab dem Rundendatum

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

function parseGermanDate(str) {
    // "10.10.2026" -> Date (lokale Mitternacht)
    const [day, month, year] = str.split('.').map(Number);
    return new Date(year, month - 1, day);
}

function loadSnapshots() {
    try {
        if (fs.existsSync(SNAPSHOT_PATH)) return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    } catch (e) {
        console.warn('Konnte Pokal-Punkte-Snapshot nicht lesen:', e.message);
    }
    return {};
}

function saveSnapshots(snapshots) {
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshots, null, 2));
}

async function fetchPokalLeaguePoints() {
    const accounts = getConfiguredKickbaseAccounts();
    if (accounts.length === 0) {
        throw new Error('Kein Kickbase-Account konfiguriert (KICKBASE_EMAIL.../PASS... fehlen).');
    }

    let lastError = null;
    for (const account of accounts) {
        const result = await fetchSingleLeagueData(account.email, account.pass, POKAL_LEAGUE_NAME);
        if (!result.error) {
            console.log(`Pokal-Liga "${POKAL_LEAGUE_NAME}" gefunden über Account ${account.email}, ${result.users.length} Teilnehmer.`);
            const points = {};
            result.users.forEach(u => { points[u.n] = u.sp || 0; });
            return points;
        }
        lastError = result.error;
    }
    throw new Error(`Pokal-Liga "${POKAL_LEAGUE_NAME}" in keinem konfigurierten Account gefunden. Letzter Fehler: ${lastError}`);
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
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    if (!fs.existsSync(POKAL_DATA_PATH)) {
        throw new Error(`pokal-data.json nicht gefunden unter ${POKAL_DATA_PATH}`);
    }
    const pokalData = JSON.parse(fs.readFileSync(POKAL_DATA_PATH, 'utf8'));
    const roundSchedule = pokalData.meta?.roundSchedule || {};

    const currentPoints = await fetchPokalLeaguePoints();

    // Für den grünen Haken im Pokal-Bracket (Pokal.jsx): welche Namen sind
    // TATSÄCHLICH schon Mitglied der Kickbase-Liga "Pokal"? Wird bei JEDEM Lauf
    // aktualisiert, unabhängig vom Runden-Timing - das ist reine Beitritts-Info.
    fs.writeFileSync(MEMBERS_PATH, JSON.stringify({
        updatedAt: new Date().toISOString(),
        leagueName: POKAL_LEAGUE_NAME,
        members: Object.keys(currentPoints).sort()
    }, null, 2));

    const snapshots = loadSnapshots(); // { "<matchday>": { name: points, capturedAt } }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const winnerPlaceholders = buildWinnerPlaceholders(pokalData);
    let snapshotsChanged = false;
    let resolvedCount = 0;
    let tieCount = 0;
    let missingDataCount = 0;

    ROUND_SEQUENCE.forEach(round => {
        const schedule = roundSchedule[round.scheduleName];
        if (!schedule) {
            console.warn(`⚠ Keine roundSchedule-Angabe für "${round.scheduleName}" gefunden - übersprungen.`);
            return;
        }
        const matchday = String(schedule.matchday);
        const roundDate = parseGermanDate(schedule.date);
        const evaluationDate = new Date(roundDate);
        evaluationDate.setDate(evaluationDate.getDate() + EVALUATION_BUFFER_DAYS);

        if (today < roundDate) {
            // Vor dem Spieltag: Vergleichsbasis sichern/auffrischen.
            snapshots[matchday] = { points: currentPoints, capturedAt: new Date().toISOString() };
            snapshotsChanged = true;
            return;
        }

        if (today < evaluationDate) {
            // Spieltag läuft gerade (im Puffer-Fenster) - abwarten, nichts anfassen.
            console.log(`${round.scheduleName} (BL-Spieltag ${schedule.matchday}) läuft gerade oder ist zu frisch beendet - noch nicht auswerten.`);
            return;
        }

        // Auswertungs-Fenster erreicht.
        const baseline = snapshots[matchday]?.points;
        if (!baseline) {
            console.warn(`⚠ ${round.scheduleName} (BL-Spieltag ${schedule.matchday}) ist vorbei, aber es gibt keine Vergleichsbasis von VOR dem Spieltag - kann nicht ausgewertet werden. Das Skript muss vor diesem Spieltag mindestens einmal gelaufen sein.`);
            return;
        }

        round.keys.forEach(key => {
            (pokalData[key] || []).forEach(match => {
                if (match.winner || isPlaceholderName(match.p1) || isPlaceholderName(match.p2)) return;

                const p1Base = baseline[match.p1];
                const p2Base = baseline[match.p2];
                const p1Now = currentPoints[match.p1];
                const p2Now = currentPoints[match.p2];

                if (p1Now == null || p2Now == null || p1Base == null || p2Base == null) {
                    console.warn(`⚠ ${match.id}: "${match.p1}" oder "${match.p2}" nicht in Pokal-Liga "${POKAL_LEAGUE_NAME}" gefunden (weder jetzt noch in der Vergleichsbasis) - übersprungen.`);
                    missingDataCount++;
                    return;
                }

                const p1Points = p1Now - p1Base;
                const p2Points = p2Now - p2Base;

                match.score1 = p1Points;
                match.score2 = p2Points;

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
    if (snapshotsChanged) saveSnapshots(snapshots);

    console.log(`\nFertig: ${resolvedCount} Duelle ausgewertet, ${tieCount} Unentschieden (manuell prüfen), ${missingDataCount} mit fehlenden Namen.`);
}

run().catch(err => {
    console.error('Fehler beim Abruf der Pokal-Ergebnisse:', err.message);
    process.exit(1);
});
