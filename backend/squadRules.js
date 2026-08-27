// Gemeinsame Mindestanforderungen an eine "startelf-fähige" Kaderaufstellung.
// Genutzt von backend/scripts/calculate-ratings.js (Manager Rating: "wie
// startelf-fähig ist der Kader?") UND vom Trading Advisor Frontend
// (frontend/src/squadRules.js - dortige Kopie, da Node/Browser getrennte
// Modulsysteme sind, siehe Kommentar dort). Änderungen hier bitte IMMER
// spiegeln, damit beide Features dieselbe Definition von "vollständiger
// Kader" verwenden.
const SQUAD_MIN_POSITIONS = { TW: 1, ABW: 3, MF: 2, ST: 1 };
const SQUAD_MIN_TOTAL = 11;

// 0 (kein brauchbarer Kader) bis 1 (startelf-fähig): Flaschenhals-Prinzip - sowohl
// die Mindestbesetzung JEDER Position als auch die Gesamtzahl müssen stimmen, ein
// Kader mit 3 Torhütern aber nur 2 Abwehrspielern ist trotz 9 Spielern nicht bereit.
function computeSquadReadiness(positionCounts, totalCount) {
    let required = 0;
    let satisfied = 0;
    for (const [pos, need] of Object.entries(SQUAD_MIN_POSITIONS)) {
        required += need;
        satisfied += Math.min(positionCounts[pos] || 0, need);
    }
    const positionalReadiness = required > 0 ? satisfied / required : 1;
    const totalReadiness = Math.min(1, totalCount / SQUAD_MIN_TOTAL);
    return Math.min(positionalReadiness, totalReadiness);
}

// Welche Pflichtpositionen sind aktuell unterbesetzt? Gibt z.B. { ST: 1 }
// zurück, wenn noch ein Stürmer fehlt, um SQUAD_MIN_POSITIONS zu erfüllen.
function missingPositions(positionCounts = {}) {
    const missing = {};
    for (const [pos, need] of Object.entries(SQUAD_MIN_POSITIONS)) {
        const have = positionCounts[pos] || 0;
        if (have < need) missing[pos] = need - have;
    }
    return missing;
}

module.exports = { SQUAD_MIN_POSITIONS, SQUAD_MIN_TOTAL, computeSquadReadiness, missingPositions };
