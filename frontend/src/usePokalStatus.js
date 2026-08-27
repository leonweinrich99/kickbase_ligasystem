import { useEffect, useMemo, useState } from 'react';

// Turnierbaum-Reihenfolge, in der nach dem aktuellsten Auftritt eines Namens
// gesucht wird - gemeinsame Grundlage fuer AccountStats.jsx (Pokal-Sektion)
// und die Section-Kopfzeile (Spieltag+Datum rechtsbuendig neben dem Logo).
const ROUND_ORDER = [
  { key: 'Sechzehntelfinale', sides: ['roundOf32Left', 'roundOf32Right'] },
  { key: 'Achtelfinale', sides: ['roundOf16Left', 'roundOf16Right'] },
  { key: 'Viertelfinale', sides: ['quarterFinalsLeft', 'quarterFinalsRight'] },
  { key: 'Halbfinale', sides: ['semiFinalsLeft', 'semiFinalsRight'] },
  { key: 'Finale', sides: ['final'] },
];

// "Sieger SF13" & Co. sind Platzhalter für noch nicht ausgespielte Partien,
// "Freilos" für einen direkten Aufstieg ohne Gegner - beides ist (noch) kein
// echter Manager.
const isPlaceholderName = (name) => !name || name.startsWith('Sieger') || name === 'Freilos';

function getPokalStatus(data, playerName) {
  if (!data || !playerName) return null;
  let lastFound = null;
  for (const round of ROUND_ORDER) {
    for (const sideKey of round.sides) {
      for (const match of data[sideKey] || []) {
        if (match.p1 === playerName || match.p2 === playerName) {
          const slot = match.p1 === playerName ? 1 : 2;
          lastFound = { round, match, slot };
        }
      }
    }
  }
  if (!lastFound) return { status: 'none' };
  const { round, match, slot } = lastFound;
  const opponentRaw = slot === 1 ? match.p2 : match.p1;
  const opponent = isPlaceholderName(opponentRaw) ? null : opponentRaw;

  if (match.winner) {
    if (match.winner === slot) {
      if (round.key === 'Finale') return { status: 'champion' };
      return { status: 'advanced', round: round.key };
    }
    return { status: 'eliminated', round: round.key, opponent };
  }
  return { status: 'upcoming', round: round.key, opponent };
}

// Ermittelt den aktuellen Pokal-Status + die zugehoerige Bundesliga-
// Spieltag/Datum-Info eines Managers (per Name, da Pokal-Paarungen keine
// IDs speichern) - eigene Datei statt in AccountStats.jsx gemischt mit
// Komponenten (Fast-Refresh-Konvention, siehe useLeagueEntry.js). Wird sowohl
// fuer die Section-Kopfzeile (Spieltag rechtsbuendig) als auch fuer den
// Pokal-Tab-Inhalt selbst gebraucht - EIN gemeinsamer Fetch statt zwei.
export const usePokalStatus = (kickbaseName) => {
  const [pokalData, setPokalData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/pokal-data.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setPokalData(json);
      })
      .catch(() => {
        if (!cancelled) setPokalData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const status = useMemo(() => getPokalStatus(pokalData, kickbaseName), [pokalData, kickbaseName]);
  const roundInfo = pokalData?.meta?.roundSchedule?.[status?.round];

  return { pokalData, status, roundInfo };
};
