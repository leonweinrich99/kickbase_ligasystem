import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeagueEntry } from './useLeagueEntry';

// Liga-Statistiken (Kennzahlen-Reihe) und Pokal-Matchkarte fuer die
// Account-Seite. Bewusst mit einer einzigen Akzentfarbe (Marken-Orange)
// gehalten statt bunt gemischt - fuer ein ruhigeres Gesamtbild.

const ArrowIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const RankIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
    <path d="M4 22h16"></path>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
    <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z"></path>
  </svg>
);

const PointsIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

const BoltIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
  </svg>
);

// Sucht den Eintrag eines Kickbase-Managers in den aktuellen Liga-Daten -
// wird sowohl fuer die Statistik-Kachel als auch (spaeter) andere
// Account-Elemente gebraucht, daher als eigener Hook (siehe useLeagueEntry.js).

const StatItem = ({ icon, value, label }) => (
  <div className="flex flex-col items-center text-center flex-1">
    <div className="w-9 h-9 rounded-xl bg-[#000] flex items-center justify-center mb-1.5 text-[#ff5c3e]">{icon}</div>
    <div className="text-base font-black text-white leading-none">{value ?? '–'}</div>
    <div className="text-[8px] font-bold uppercase tracking-widest text-[#626978] mt-1.5">{label}</div>
  </div>
);

export const LeagueStatsCard = ({ kickbaseId }) => {
  const entry = useLeagueEntry(kickbaseId);

  if (!kickbaseId || !entry) return null;

  return (
    <Link
      to={`/user/${kickbaseId}`}
      className="block bg-[#171717] border border-[#2e2e2e] rounded-2xl p-5 mb-4 hover:border-[#404040] transition-all active:scale-[0.98]"
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full"
          style={{ backgroundColor: `${entry.leagueColor}26`, color: entry.leagueColor }}
        >
          {entry.leagueName}
        </span>
        <span className="text-[10px] font-bold text-[#8b92a5] flex items-center gap-1">
          Details <ArrowIcon />
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        <StatItem icon={RankIcon} value={`#${entry.rank}`} label="Platz" />
        <StatItem icon={PointsIcon} value={entry.points} label="Punkte" />
        <StatItem icon={BoltIcon} value={entry.pointsMatchday} label="Letzter ST" />
      </div>
    </Link>
  );
};

// Reihenfolge der Pokal-Runden, jeweils mit den beiden Bracket-Haelften, die
// zusammengehören (siehe frontend/public/pokal-data.json / Pokal.jsx).
const ROUND_ORDER = [
  { key: 'Sechzehntelfinale', sides: ['roundOf32Left', 'roundOf32Right'] },
  { key: 'Achtelfinale', sides: ['roundOf16Left', 'roundOf16Right'] },
  { key: 'Viertelfinale', sides: ['quarterFinalsLeft', 'quarterFinalsRight'] },
  { key: 'Halbfinale', sides: ['semiFinalsLeft', 'semiFinalsRight'] },
  { key: 'Finale', sides: ['final'] },
];

const isPlaceholderName = (name) => !name || name.startsWith('Sieger') || name === 'Freilos';

function getPokalStatus(data, playerName) {
  if (!data || !playerName) return null;

  // Ueber alle Runden in Reihenfolge iterieren und sich das letzte Match
  // merken, in dem der Name auftaucht - das ist der aktuelle Stand.
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

const STATUS_THEME = {
  advanced: { color: '#22c55e', label: 'Weiter dabei', glow: 'rgba(34,197,94,0.08)' },
  upcoming: { color: '#8b5cf6', label: 'Bevorstehend', glow: 'rgba(139,92,246,0.08)' },
  eliminated: { color: '#6b7280', label: 'Ausgeschieden', glow: 'transparent' },
};

const TrophyIconSvg = ({ color, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
    <path d="M4 22h16"></path>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
    <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z"></path>
  </svg>
);

const NameAvatar = ({ name, color, muted }) => (
  <div
    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center font-black text-base shrink-0"
    style={muted
      ? { backgroundColor: '#1f1f1f', border: '2px solid #2e2e2e', color: '#8b92a5' }
      : { backgroundColor: `${color}1F`, border: `2px solid ${color}`, color }}
  >
    {name ? name.charAt(0).toUpperCase() : '?'}
  </div>
);

export const PokalMatchCard = ({ kickbaseName }) => {
  const [pokalData, setPokalData] = useState(null);

  useEffect(() => {
    fetch(`/pokal-data.json?t=${Date.now()}`).then((res) => res.json()).then(setPokalData).catch(() => setPokalData(null));
  }, []);

  const status = useMemo(() => getPokalStatus(pokalData, kickbaseName), [pokalData, kickbaseName]);

  if (!kickbaseName || !status || status.status === 'none') return null;

  // Sonderfall Pokalsieger: eigenes, groesseres Layout statt "DU vs GEGNER" -
  // es gibt schliesslich keinen naechsten Gegner mehr.
  if (status.status === 'champion') {
    return (
      <Link
        to="/pokal"
        className="block relative overflow-hidden bg-gradient-to-br from-yellow-500/15 via-[#171717] to-[#171717] border border-yellow-500/40 rounded-2xl p-6 mb-4 text-center hover:border-yellow-500 transition-all active:scale-[0.98]"
      >
        <TrophyIconSvg color="#eab308" size={32} />
        <div className="text-base font-black uppercase text-yellow-400 mt-2">Pokalsieger!</div>
        <div className="text-xs text-[#8b92a5] mt-1">Herzlichen Glückwunsch zum Titel 🎉</div>
      </Link>
    );
  }

  const theme = STATUS_THEME[status.status];
  const opponentLabel = status.opponent || (status.status === 'eliminated' ? 'Unbekannt' : 'Steht noch nicht fest');

  return (
    <Link
      to="/pokal"
      className="block relative overflow-hidden bg-[#171717] border border-[#2e2e2e] rounded-2xl p-5 mb-4 hover:border-[#404040] transition-all active:scale-[0.98]"
      style={{ backgroundImage: `radial-gradient(circle at top right, ${theme.glow}, transparent 70%)` }}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full"
          style={{ backgroundColor: `${theme.color}26`, color: theme.color }}
        >
          {status.round}
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: theme.color }}>
          <TrophyIconSvg color={theme.color} size={12} />
          {theme.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <NameAvatar name="Du" color={theme.color} />
          <span className="text-[11px] font-bold text-gray-100">Du</span>
        </div>

        <div className="w-7 h-7 rounded-full bg-[#000] border border-[#2e2e2e] flex items-center justify-center text-[8px] font-black text-[#8b92a5] shrink-0">VS</div>

        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <NameAvatar name={status.opponent} muted />
          <span className="text-[11px] font-bold text-gray-100 truncate max-w-full">{opponentLabel}</span>
        </div>
      </div>
    </Link>
  );
};
