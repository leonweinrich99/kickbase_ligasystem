// Metadaten und Normalisierung fuer Kickbases 5-stufige Startelf-Prognose (`prob`).
// Offizielle Kickbase-Skala:
//   1 = Sicher
//   2 = Erwartet
//   3 = Unsicher
//   4 = Unwahrscheinlich
//   5 = Ausgeschlossen

export const START_PROB_LEVELS = [
  {
    code: 1,
    label: 'Sicher',
    description: 'Der Spieler gilt auf Basis aller verfügbaren Informationen als nahezu sicherer Starter.',
    color: '#1d6ef5',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/35',
  },
  {
    code: 2,
    label: 'Erwartet',
    description: 'Es besteht eine klare Erwartung, dass der Spieler in der Startformation stehen wird.',
    color: '#16a34a',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  },
  {
    code: 3,
    label: 'Unsicher',
    description: 'Der Spieler hat realistische Chancen auf einen Startplatz, aber ist keine sichere Wahl.',
    color: '#f58220',
    badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/35',
  },
  {
    code: 4,
    label: 'Unwahrscheinlich',
    description: 'Der Spieler ist aktuell nicht die erste Option, bleibt aber eine mögliche Alternative.',
    color: '#ef3b1d',
    badgeClass: 'bg-red-500/15 text-red-300 border-red-500/35',
  },
  {
    code: 5,
    label: 'Ausgeschlossen',
    description: 'Der Spieler hat keine realistische Chance, in der Startformation zu stehen.',
    color: '#52525b',
    badgeClass: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/35',
  },
];

const LEVEL_BY_CODE = new Map(START_PROB_LEVELS.map((l) => [l.code, l]));

// Normalisiert sowohl Kickbases 1..5-Codes als auch (defensiv) aeltere 0.0..1.0-Werte.
export const normalizeStartProbCode = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;

  if (num >= 1 && num <= 5) {
    return Math.round(num);
  }
  if (num >= 0 && num < 1) {
    if (num >= 0.85) return 1;
    if (num >= 0.6) return 2;
    if (num >= 0.35) return 3;
    if (num >= 0.15) return 4;
    return 5;
  }
  return null;
};

export const getStartProbMeta = (raw) => {
  const code = normalizeStartProbCode(raw);
  return code != null ? LEVEL_BY_CODE.get(code) || null : null;
};

export const isLikelyStarterProb = (raw) => {
  const code = normalizeStartProbCode(raw);
  return code === 1 || code === 2;
};
