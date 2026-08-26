// Holt nach Abschluss eines Pokal-Spieltags (Kickbase-Liga "Arena", in der ALLE
// Pokal-Teilnehmer gemeinsam stehen) die Spieltagspunkte und trägt sie in die
// laufenden Pokal-Duelle (pokal-data.json) ein.
//
// Kickbase liefert über die Ranking-API nur die KUMULIERTE Saison-Gesamtpunktzahl
// (u.sp), keine "Punkte nur für diesen Spieltag". Deshalb merken wir uns nach
// jedem Lauf den aktuellen Punktestand jedes Managers (_arena_points_snapshot.json)
// und berechnen die Spieltagspunkte beim NÄCHSTEN Lauf als Differenz zum letzten
// gespeicherten Stand - dasselbe Prinzip, das die App für "pointsMatchday" in
// LIGA 1/2/3 bereits nutzt (siehe transformIndependentLeagues in kickbase.js).
//
// WICHTIG: Bei ties (exakt gleiche Punktzahl) wird der Sieger NICHT automatisch
// bestimmt (winner bleibt null) - die Tie-Break-Regel für die Arena ist noch nicht
// festgelegt. Solche Fälle werden klar geloggt und müssen manuell in
// pokal-data.json eingetragen werden.

const fs = require('fs');
const path = require('path');
const { fetchSingleLeagueData, getConfiguredKickbaseAccounts } = require('../kickbase');

const ARENA_LEAGUE_NAME = process.env.KICKBASE_LEAGUE_ARENA_NAME || 'Arena';
const POKAL_DATA_PATH = path.join(__dirname, '../../frontend/public/pokal-data.json');
const SNAPSHOT_PATH = path.join(__dirname, '../../frontend/public/history/_arena_points_snapshot.json');

const ROUND_KEYS = [
    'roundOf32Left', 'roundOf32Right',
    'roundOf16Left', 'roundOf16Right',
    'quarterFinalsLeft', 'quarterFinalsRight',
    'semiFinalsLeft', 'semiFinalsRight',
    'final'
];

// "Sieger SF13" & Co. sind Platzhalter für noch nicht ausgespielte Partien,
// "Freilos" für einen direkten Aufstieg ohne Gegner - beides ist kein echter Name.
const isPlaceholderName = (name) => !name || name.startsWith('Sieger') || name === 'Freilos';

function loadSnapshot() {
    try {
        if (fs.existsSync(SNAPSHOT_PATH)) return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    } catch (e) {
        console.warn('Konnte Arena-Punkte-Snapshot nicht lesen:', e.message);
    }
    return null;
}

function saveSnapshot(pointsByName) {
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify({
        updatedAt: new Date().toISOString(),
        points: pointsByName
    }, null, 2));
}

async function fetchArenaPoints() {
    const accounts = getConfiguredKickbaseAccounts();
    if (accounts.length === 0) {
        throw new Error('Kein Kickbase-Account konfiguriert (KICKBASE_EMAIL.../PASS... fehlen).');
    }

    let lastError = null;
    for (const account of accounts) {
        const result = await fetchSingleLeagueData(account.email, account.pass, ARENA_LEAGUE_NAME);
        if (!result.error) {
            console.log(`Arena-Liga "${ARENA_LEAGUE_NAME}" gefunden über Account ${account.email}, ${result.users.length} Teilnehmer.`);
            return result;
        }
        lastError = result.error;
    }
    throw new Error(`Arena-Liga "${ARENA_LEAGUE_NAME}" in keinem konfigurierten Account gefunden. Letzter Fehler: ${lastError}`);
}

// Findet für ein aufgelöstes Match (z.B. "m13") die nächste Runde, in der
// "Sieger SF13" als Platzhalter steht, und ersetzt ihn durch den echten Namen.
function propagateWinner(pokalData, matchId, winnerName) {
    const targetPlaceholder = `Sieger SF${matchId.replace(/^m/, '')}`;
    let propagated = false;
    ROUND_KEYS.forEach(key => {
        (pokalData[key] || []).forEach(match => {
            if (match.p1 === targetPlaceholder) { match.p1 = winnerName; propagated = true; }
            if (match.p2 === targetPlaceholder) { match.p2 = winnerName; propagated = true; }
        });
    });
    return propagated;
}

async function run() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const arenaResult = await fetchArenaPoints();
    const currentPoints = {};
    arenaResult.users.forEach(u => { currentPoints[u.n] = u.sp || 0; });

    const previousSnapshot = loadSnapshot();
    if (!previousSnapshot) {
        console.log('Kein vorheriger Arena-Punkte-Snapshot gefunden - das ist vermutlich der erste Lauf.');
        console.log('Speichere Basis-Snapshot, werte aber noch KEINEN Spieltag aus (es gibt noch keine Vergleichsbasis).');
        saveSnapshot(currentPoints);
        return;
    }

    const matchdayPoints = {};
    Object.entries(currentPoints).forEach(([name, total]) => {
        const prev = previousSnapshot.points[name];
        matchdayPoints[name] = typeof prev === 'number' ? total - prev : null;
    });

    if (!fs.existsSync(POKAL_DATA_PATH)) {
        throw new Error(`pokal-data.json nicht gefunden unter ${POKAL_DATA_PATH}`);
    }
    const pokalData = JSON.parse(fs.readFileSync(POKAL_DATA_PATH, 'utf8'));

    let resolvedCount = 0;
    let tieCount = 0;
    let missingDataCount = 0;

    ROUND_KEYS.forEach(key => {
        (pokalData[key] || []).forEach(match => {
            if (match.winner || isPlaceholderName(match.p1) || isPlaceholderName(match.p2)) return;

            const p1Points = matchdayPoints[match.p1];
            const p2Points = matchdayPoints[match.p2];

            if (p1Points == null || p2Points == null) {
                console.warn(`⚠ ${match.id}: "${match.p1}" oder "${match.p2}" nicht in Arena-Liga "${ARENA_LEAGUE_NAME}" gefunden - übersprungen.`);
                missingDataCount++;
                return;
            }

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

            if (propagateWinner(pokalData, match.id, winnerName)) {
                console.log(`  -> Sieger in nächster Runde eingetragen.`);
            }
        });
    });

    fs.writeFileSync(POKAL_DATA_PATH, JSON.stringify(pokalData, null, 2));
    saveSnapshot(currentPoints);

    console.log(`\nFertig: ${resolvedCount} Duelle ausgewertet, ${tieCount} Unentschieden (manuell prüfen), ${missingDataCount} mit fehlenden Namen.`);
}

run().catch(err => {
    console.error('Fehler beim Abruf der Pokal-Arena-Ergebnisse:', err.message);
    process.exit(1);
});
