/**
 * Pokal-Auslosung / Bracket-Generator (Prototyp)
 * ------------------------------------------------
 * Erstellt die Sechzehntelfinal-Paarungen für den Pokal auf Basis der
 * Endergebnisse der Qualifikationsrunde (archivierte Gesamttabelle).
 *
 * Regel (wie besprochen):
 *   - Platz 1 der Gesamt-Qualigruppe spielt gegen den letzten Platz,
 *     Platz 2 gegen den vorletzten, usw. ("Cross-Pairing").
 *   - Das Sechzehntelfinale hat 32 Plätze (16 Partien). Wenn nicht alle
 *     32 Plätze belegt werden können (weniger als 32 Teilnehmer*innen),
 *     bekommen die BESTEN Plätze der Qualirunde ein Freilos und ziehen
 *     direkt ins Achtelfinale (Runde 2) ein.
 *   - Freilose werden gleichmäßig über den Baum verteilt, damit nicht
 *     eine Bracket-Hälfte benachteiligt/bevorzugt wird.
 *
 * Nutzung:
 *   node backend/scripts/generatePokalBracket.js
 *
 * Optional: backend/pokal-excluded.json anlegen mit
 *   { "excludedNames": ["Name, der nicht mehr mitspielt", "..."] }
 * um Personen aus der Qualirunde auszuschließen, die nicht mehr aktiv sind.
 */

const fs = require('fs');
const path = require('path');

const ARCHIVE_DATA_PATH = path.join(__dirname, '../../frontend/public/archive/quali-2025-26/data.json');
const EXCLUDED_PATH = path.join(__dirname, '../pokal-excluded.json');
const OUTPUT_PATH = path.join(__dirname, '../../frontend/public/pokal-data.json');

const ROUND1_SLOTS = 16; // Sechzehntelfinale: 16 Partien / 32 Plätze
const EMPTY_MATCH = () => ({ score1: 0, score2: 0, winner: null });

function loadRanking() {
    const raw = JSON.parse(fs.readFileSync(ARCHIVE_DATA_PATH, 'utf8'));
    const allUsers = raw.leagues.reduce((acc, l) => [...acc, ...l.users], []);
    allUsers.sort((a, b) => a.rank - b.rank);

    let excludedNames = [];
    if (fs.existsSync(EXCLUDED_PATH)) {
        try {
            excludedNames = JSON.parse(fs.readFileSync(EXCLUDED_PATH, 'utf8')).excludedNames || [];
        } catch (e) {
            console.warn("Konnte pokal-excluded.json nicht lesen:", e.message);
        }
    }

    return allUsers
        .filter(u => !excludedNames.includes(u.name))
        .map(u => u.name);
}

/**
 * Baut die komplette Bracket-Struktur auf Basis einer nach Qualirang
 * sortierten Namensliste (Index 0 = Platz 1 / bester Spieler).
 */
function buildPokalBracket(rankedNames) {
    const n = rankedNames.length;
    if (n < 2) throw new Error("Zu wenige Teilnehmer für eine Pokal-Auslosung.");
    if (n > 32) throw new Error(`Mehr als 32 Teilnehmer (${n}) werden vom aktuellen Bracket-Format nicht unterstützt.`);

    const byes = Math.max(0, 32 - n);
    const byePlayers = rankedNames.slice(0, byes);
    const remaining = rankedNames.slice(byes);

    // Cross-Pairing unter den verbleibenden Teilnehmer*innen: bester vs. schlechtester Rest, usw.
    const pairs = [];
    for (let i = 0; i < remaining.length / 2; i++) {
        pairs.push([remaining[i], remaining[remaining.length - 1 - i]]);
    }

    // Freilose gleichmäßig über die 16 Slots verteilen, Rest sequentiell mit echten Paarungen auffüllen.
    const slots = new Array(ROUND1_SLOTS).fill(null);
    const byeSlotIndices = new Set(
        Array.from({ length: byes }, (_, i) => Math.floor((i * ROUND1_SLOTS) / Math.max(byes, 1)))
    );

    let byeIdx = 0;
    let pairIdx = 0;
    for (let slot = 0; slot < ROUND1_SLOTS; slot++) {
        if (byeSlotIndices.has(slot) && byeIdx < byePlayers.length) {
            slots[slot] = { type: 'bye', player: byePlayers[byeIdx] };
            byeIdx++;
        } else if (pairIdx < pairs.length) {
            slots[slot] = { type: 'match', players: pairs[pairIdx] };
            pairIdx++;
        }
    }

    // Falls durch Rundungseffekte noch Freilose übrig sind, in die nächsten freien Slots packen.
    for (let slot = 0; slot < ROUND1_SLOTS && byeIdx < byePlayers.length; slot++) {
        if (!slots[slot]) {
            slots[slot] = { type: 'bye', player: byePlayers[byeIdx] };
            byeIdx++;
        }
    }

    // Sechzehntelfinale (Runde 1) aus den Slots bauen
    const roundOf32 = slots.map((slot, idx) => {
        const id = `m${idx + 1}`;
        if (!slot) return { id, p1: null, p2: null, ...EMPTY_MATCH(), winner: null };
        if (slot.type === 'bye') {
            return {
                id,
                p1: slot.player,
                p2: 'Freilos',
                score1: null,
                score2: null,
                winner: 1,
                isBye: true
            };
        }
        return { id, p1: slot.players[0], p2: slot.players[1], ...EMPTY_MATCH() };
    });

    // Achtelfinale (Runde 2): Slot(2k) & Slot(2k+1) treffen aufeinander.
    // Bei einem Freilos steht der Name schon fest, sonst Platzhalter "Sieger SF<n>".
    const roundOf16 = [];
    for (let k = 0; k < ROUND1_SLOTS / 2; k++) {
        const left = roundOf32[k * 2];
        const right = roundOf32[k * 2 + 1];
        const label = (m) => (m.isBye ? m.p1 : `Sieger SF${m.id.replace('m', '')}`);
        roundOf16.push({
            id: `m${17 + k}`,
            p1: label(left),
            p2: label(right),
            ...EMPTY_MATCH()
        });
    }

    const quarterFinals = Array.from({ length: 4 }, (_, k) => ({
        id: `m${25 + k}`,
        p1: `Sieger AF${k * 2 + 1}`,
        p2: `Sieger AF${k * 2 + 2}`,
        ...EMPTY_MATCH()
    }));

    const semiFinals = Array.from({ length: 2 }, (_, k) => ({
        id: `m${29 + k}`,
        p1: `Sieger VF${k * 2 + 1}`,
        p2: `Sieger VF${k * 2 + 2}`,
        ...EMPTY_MATCH()
    }));

    const final = [{
        id: 'm31',
        p1: 'Sieger HF1',
        p2: 'Sieger HF2',
        ...EMPTY_MATCH()
    }];

    return {
        roundOf32Left: roundOf32.slice(0, 8),
        roundOf32Right: roundOf32.slice(8, 16),
        roundOf16Left: roundOf16.slice(0, 4),
        roundOf16Right: roundOf16.slice(4, 8),
        quarterFinalsLeft: quarterFinals.slice(0, 2),
        quarterFinalsRight: quarterFinals.slice(2, 4),
        semiFinalsLeft: [semiFinals[0]],
        semiFinalsRight: [semiFinals[1]],
        final,
        meta: {
            generatedAt: new Date().toISOString(),
            participants: n,
            byes,
            seedSource: 'Qualifikationsrunde 25/26 (Gesamtwertung)'
        }
    };
}

function run() {
    const ranking = loadRanking();
    console.log(`Geladene Qualirang-Liste: ${ranking.length} Teilnehmer*innen.`);

    const bracket = buildPokalBracket(ranking);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(bracket, null, 2));

    console.log(`Pokal-Bracket geschrieben nach: ${OUTPUT_PATH}`);
    console.log(`-> ${bracket.meta.byes} Freilos(e) für die Top-${bracket.meta.byes} der Qualirunde.`);
}

module.exports = { buildPokalBracket, loadRanking };

if (require.main === module) {
    run();
}
