// Gemeinsame Mindestanforderungen an eine "startelf-fähige" Kaderaufstellung.
// Spiegel von backend/squadRules.js (Node/Browser sind getrennte
// Modulsysteme, daher keine direkte gemeinsame Datei) - genutzt vom Trading
// Advisor Budget-Check ("reicht das Geld nach diesem Kauf noch für eine
// vollständige Elf?"). Bei Änderungen bitte BEIDE Dateien synchron halten.
export const SQUAD_MIN_POSITIONS = { TW: 1, ABW: 3, MF: 2, ST: 1 };
export const SQUAD_MIN_TOTAL = 11;

// Zählt, wie viele Spieler pro Position im Kader stehen.
export function countPositions(squad = []) {
  const counts = {};
  squad.forEach((p) => {
    if (p.position) counts[p.position] = (counts[p.position] || 0) + 1;
  });
  return counts;
}

// Welche Pflichtpositionen sind aktuell unterbesetzt? Gibt z.B. { ST: 1 }
// zurück, wenn noch ein Stürmer fehlt, um SQUAD_MIN_POSITIONS zu erfüllen.
export function missingPositions(positionCounts = {}) {
  const missing = {};
  for (const [pos, need] of Object.entries(SQUAD_MIN_POSITIONS)) {
    const have = positionCounts[pos] || 0;
    if (have < need) missing[pos] = need - have;
  }
  return missing;
}

// 0 (kein brauchbarer Kader) bis 1 (startelf-fähig) - gleiche Logik wie
// backend/squadRules.js::computeSquadReadiness.
export function computeSquadReadiness(positionCounts, totalCount) {
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

// Schätzt, wie viel Budget reserviert werden muss, um fehlende Pflicht-
// positionen mit dem jeweils günstigsten verfügbaren Spieler der Datenbank
// aufzufüllen - Grundlage für die "reicht das Geld noch für eine volle Elf?"-
// Warnung im Trading Advisor.
export function estimateReserveForMissingPositions(missing, allPlayers = []) {
  let reserve = 0;
  const details = [];
  for (const [pos, count] of Object.entries(missing)) {
    const cheapestInPosition = allPlayers
      .filter((p) => p.position === pos && (p.marketValue || 0) > 0)
      .sort((a, b) => (a.marketValue || 0) - (b.marketValue || 0))[0];
    const unitCost = cheapestInPosition?.marketValue || 0;
    reserve += unitCost * count;
    details.push({ position: pos, count, unitCost, cheapestPlayer: cheapestInPosition || null });
  }
  return { reserve, details };
}
