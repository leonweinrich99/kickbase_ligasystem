import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

// Zeigt kompakte Liga-Statistiken (aufklappbar) und den Pokal-Status
// (noch dabei? wer ist der nächste Gegner?) direkt auf der Account-Seite,
// sobald ein Kickbase-Name zugeordnet ist.

const ChevronIcon = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b92a5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const StatMini = ({ label, value }) => (
  <div className="bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2.5">
    <div className="text-[9px] font-black uppercase tracking-widest text-[#626978] mb-0.5">{label}</div>
    <div className="text-sm font-black text-gray-100">{value ?? '–'}</div>
  </div>
);

export const LeagueStatsCard = ({ kickbaseId }) => {
  const [userStats, setUserStats] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!kickbaseId) return;
    fetch(`/data.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((json) => {
        for (const league of json.leagues || []) {
          const found = (league.users || []).find((u) => u.id === kickbaseId);
          if (found) {
            setUserStats({ ...found, leagueName: league.name, leagueColor: league.color });
            return;
          }
        }
        setUserStats(null);
      })
      .catch(() => setUserStats(null));
  }, [kickbaseId]);

  if (!kickbaseId || !userStats) return null;

  return (
    <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl mb-4 overflow-hidden">
      <button onClick={() => setIsOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[#1c1c1c] transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0"
            style={{ backgroundColor: `${userStats.leagueColor}33`, color: userStats.leagueColor }}
          >
            {userStats.leagueName}
          </span>
          <span className="text-sm font-bold text-gray-100 truncate">Platz {userStats.rank}</span>
        </div>
        <ChevronIcon open={isOpen} />
      </button>
      {isOpen && (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatMini label="Punkte" value={userStats.points} />
            <StatMini label="Letzter ST" value={userStats.pointsMatchday} />
            <StatMini label="Budget" value={userStats.estimatedBudget} />
          </div>
          <Link
            to={`/user/${kickbaseId}`}
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors"
          >
            Vollständige Statistik ansehen
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </Link>
        </div>
      )}
    </div>
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

const STATUS_CONFIG = {
  champion: { label: 'Pokalsieger!', color: '#eab308' },
  eliminated: { label: 'Ausgeschieden', color: '#ef4444' },
  advanced: { label: 'Weiter dabei', color: '#22c55e' },
  upcoming: { label: 'Noch im Rennen', color: '#8b5cf6' },
};

export const PokalStatusCard = ({ kickbaseName }) => {
  const [pokalData, setPokalData] = useState(null);

  useEffect(() => {
    fetch(`/pokal-data.json?t=${Date.now()}`).then((res) => res.json()).then(setPokalData).catch(() => setPokalData(null));
  }, []);

  const status = useMemo(() => getPokalStatus(pokalData, kickbaseName), [pokalData, kickbaseName]);

  if (!kickbaseName || !status || status.status === 'none') return null;

  const config = STATUS_CONFIG[status.status];

  return (
    <Link
      to="/pokal"
      className="block bg-[#171717] border border-[#2e2e2e] rounded-2xl px-5 py-4 mb-4 hover:border-[#404040] transition-all active:scale-[0.98]"
    >
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
            <path d="M4 22h16"></path>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
            <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z"></path>
          </svg>
          <span className="text-sm font-bold" style={{ color: config.color }}>{config.label}</span>
          {status.round && <span className="text-[10px] text-[#8b92a5]">· {status.round}</span>}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
      {status.status === 'upcoming' && (
        <div className="text-xs text-[#8b92a5]">
          Nächster Gegner: <span className="text-gray-200 font-bold">{status.opponent || 'steht noch nicht fest'}</span>
        </div>
      )}
      {status.status === 'eliminated' && status.opponent && (
        <div className="text-xs text-[#8b92a5]">Ausgeschieden gegen <span className="text-gray-200 font-bold">{status.opponent}</span></div>
      )}
    </Link>
  );
};
