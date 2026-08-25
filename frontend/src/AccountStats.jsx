import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeagueEntry } from './useLeagueEntry';
import ligaLogo from './assets/logo.png';
import pokalLogo from './assets/pokal_logo.png';

// EIN Card-Container mit Tabs (Liga / Pokal / Spieltag) statt drei
// gestapelter Einzelkarten - deutlich weniger "Kachel-Gefuehl", mehr Infos
// pro Fleck. Wird auf der Account-Seite direkt unter dem Profil angezeigt.

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
const CalendarIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const StatItem = ({ icon, value, label }) => (
  <div className="flex flex-col items-center text-center flex-1">
    <div className="w-9 h-9 rounded-xl bg-[#000] flex items-center justify-center mb-1.5 text-[#ff5c3e]">{icon}</div>
    <div className="text-base font-black text-white leading-none">{value ?? '–'}</div>
    <div className="text-[8px] font-bold uppercase tracking-widest text-[#626978] mt-1.5">{label}</div>
  </div>
);

// ---------- Liga-Tab ----------

const LigaTab = ({ kickbaseId }) => {
  const entry = useLeagueEntry(kickbaseId);
  if (!entry) return <div className="text-xs text-[#8b92a5] text-center py-6">Lade Liga-Daten...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <img src={ligaLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
          <span
            className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full"
            style={{ backgroundColor: `${entry.leagueColor}26`, color: entry.leagueColor }}
          >
            {entry.leagueName}
          </span>
        </div>
      </div>
      <div className="flex items-stretch gap-2 mb-4">
        <StatItem icon={RankIcon} value={`#${entry.rank}`} label="Platz" />
        <StatItem icon={PointsIcon} value={entry.points} label="Punkte" />
        <StatItem icon={BoltIcon} value={entry.pointsMatchday} label="Letzter ST" />
      </div>
      <Link to={`/user/${kickbaseId}`} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors">
        Vollständige Statistik ansehen
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </Link>
    </div>
  );
};

// ---------- Pokal-Tab ----------

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
  advanced: { color: '#22c55e', label: 'Weiter dabei' },
  upcoming: { color: '#8b5cf6', label: 'Bevorstehend' },
  eliminated: { color: '#6b7280', label: 'Ausgeschieden' },
};

const NameAvatar = ({ name, color, muted, photoUrl }) => (
  <div
    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center font-black text-base shrink-0 overflow-hidden"
    style={muted
      ? { backgroundColor: '#1f1f1f', border: '2px solid #2e2e2e', color: '#8b92a5' }
      : { backgroundColor: `${color}1F`, border: `2px solid ${color}`, color }}
  >
    {photoUrl ? (
      <img src={photoUrl} alt={name || 'Avatar'} className="w-full h-full object-cover" />
    ) : (
      name ? name.charAt(0).toUpperCase() : '?'
    )}
  </div>
);

// Findet den Liga-Eintrag eines Managers anhand seines Kickbase-Namens
// (Pokal-Paarungen speichern nur Namen, keine IDs - siehe pokal-data.json).
const findManagerByName = (leagueData, name) => {
  if (!leagueData || !name) return null;
  for (const league of leagueData.leagues || []) {
    const found = (league.users || []).find((u) => u.name === name);
    if (found) return { ...found, leagueName: league.name, leagueColor: league.color };
  }
  return null;
};

const PokalTab = ({ kickbaseId, kickbaseName, photoURL }) => {
  const [pokalData, setPokalData] = useState(null);
  const [leagueData, setLeagueData] = useState(null);
  const myEntry = useLeagueEntry(kickbaseId);

  useEffect(() => {
    fetch(`/pokal-data.json?t=${Date.now()}`).then((res) => res.json()).then(setPokalData).catch(() => setPokalData(null));
    fetch(`/data.json?t=${Date.now()}`).then((res) => res.json()).then(setLeagueData).catch(() => setLeagueData(null));
  }, []);

  const status = useMemo(() => getPokalStatus(pokalData, kickbaseName), [pokalData, kickbaseName]);
  const roundInfo = pokalData?.meta?.roundSchedule?.[status?.round];
  const opponentEntry = useMemo(
    () => (status?.opponent ? findManagerByName(leagueData, status.opponent) : null),
    [leagueData, status]
  );

  if (!status) return <div className="text-xs text-[#8b92a5] text-center py-6">Lade Pokal-Daten...</div>;
  if (status.status === 'none') return <div className="text-xs text-[#8b92a5] text-center py-6">Du nimmst aktuell nicht am Pokal teil.</div>;

  if (status.status === 'champion') {
    return (
      <div className="text-center py-2">
        <img src={pokalLogo} alt="Pokal" className="w-14 h-14 object-contain mx-auto" />
        <div className="text-base font-black uppercase text-yellow-400 mt-2">Pokalsieger!</div>
        <div className="text-xs text-[#8b92a5] mt-1">Herzlichen Glückwunsch zum Titel 🎉</div>
      </div>
    );
  }

  const theme = STATUS_THEME[status.status];
  const opponentLabel = status.opponent || (status.status === 'eliminated' ? 'Unbekannt' : 'Steht noch nicht fest');
  const canOpenH2H = Boolean(kickbaseId && opponentEntry?.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <img src={pokalLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full" style={{ backgroundColor: `${theme.color}26`, color: theme.color }}>
            {status.round}
          </span>
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full" style={{ backgroundColor: `${theme.color}26`, color: theme.color }}>
          {theme.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex flex-col items-center gap-1.5 w-[42%] min-w-0">
          <NameAvatar name="Du" color={theme.color} photoUrl={photoURL} />
          <span className="text-[11px] font-bold text-gray-100 truncate max-w-full">Du</span>
          {myEntry && (
            <span
              className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full truncate max-w-full"
              style={{ backgroundColor: `${myEntry.leagueColor}26`, color: myEntry.leagueColor }}
            >
              {myEntry.leagueName} · #{myEntry.rank}
            </span>
          )}
        </div>
        <div className="w-7 h-7 rounded-full bg-[#000] border border-[#2e2e2e] flex items-center justify-center text-[8px] font-black text-[#8b92a5] shrink-0">VS</div>
        <div className="flex flex-col items-center gap-1.5 w-[42%] min-w-0">
          <NameAvatar name={status.opponent} muted />
          <span className="text-[11px] font-bold text-gray-100 truncate max-w-full">{opponentLabel}</span>
          {opponentEntry ? (
            <span
              className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full truncate max-w-full"
              style={{ backgroundColor: `${opponentEntry.leagueColor}26`, color: opponentEntry.leagueColor }}
            >
              {opponentEntry.leagueName} · #{opponentEntry.rank}
            </span>
          ) : (
            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full opacity-0">-</span>
          )}
        </div>
      </div>

      {roundInfo && (
        <div className="flex items-center gap-2 text-[11px] text-[#8b92a5] bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2.5 mb-2">
          <CalendarIcon size={13} />
          <span>Bundesliga-Spieltag {roundInfo.matchday} · {roundInfo.date}</span>
        </div>
      )}
      {opponentEntry && (
        <div className="text-[11px] text-[#8b92a5]">
          Gegner-Stats: <span className="text-gray-200 font-bold">Platz {opponentEntry.rank}</span> · <span className="text-gray-200 font-bold">{opponentEntry.points} Punkte</span>
        </div>
      )}

      <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-3">
        {canOpenH2H && (
          <Link to={`/compare/${kickbaseId}/${opponentEntry.id}`} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors">
            Head-to-Head ansehen
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </Link>
        )}
        <Link to="/pokal" className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors">
          Zum Pokal-Baum
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </Link>
      </div>
    </div>
  );
};

// ---------- Spieltag-Tab ----------
// Vorerst nicht in TABS eingebunden (siehe Nutzer-Feedback) - Komponente
// bleibt bewusst erhalten, um sie leicht wieder zu aktivieren.

const SpieltagTab = () => {
  const [plan, setPlan] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/bundesliga-spielplan.json?t=${Date.now()}`).then((res) => res.json()).then(setPlan).catch(() => setPlan(null));
  }, []);

  const next = useMemo(() => {
    if (!plan) return null;
    const todayKey = new Date().toISOString().slice(0, 10);
    return plan.matchdays.find((md) => md.endDate >= todayKey) || plan.matchdays[plan.matchdays.length - 1];
  }, [plan]);

  if (!next) return <div className="text-xs text-[#8b92a5] text-center py-6">Lade Spielplan...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-[#ff5c3e]/15 text-[#ff5c3e]">
          Spieltag {next.number}
        </span>
        <span className="text-[10px] text-[#8b92a5] flex items-center gap-1.5">
          <CalendarIcon size={12} />
          {next.dateRange}
        </span>
      </div>
      <div className="space-y-1.5">
        {next.matches.slice(0, expanded ? undefined : 4).map((m, i) => (
          <div key={i} className="flex items-center justify-between text-xs bg-[#000] border border-[#2e2e2e] rounded-lg px-3 py-2">
            <span className="text-gray-200 font-medium truncate">{m.home}</span>
            <span className="text-[#626978] text-[9px] font-black px-2 shrink-0">VS</span>
            <span className="text-gray-200 font-medium truncate text-right">{m.away}</span>
          </div>
        ))}
      </div>
      {next.matches.length > 4 && (
        <button onClick={() => setExpanded((e) => !e)} className="text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors mt-3">
          {expanded ? 'Weniger anzeigen' : `Alle ${next.matches.length} Partien anzeigen`}
        </button>
      )}
    </div>
  );
};

// ---------- Kader-Tab ----------

const POSITION_COLORS = { TW: '#eab308', ABW: '#3b82f6', MF: '#22c55e', ST: '#ef4444' };

const formatMoney = (val) => {
  if (val === null || val === undefined) return '–';
  return Math.round(val).toLocaleString('de-DE') + ' €';
};

const formatSignedMoney = (val) => {
  if (val === null || val === undefined) return '–';
  const rounded = Math.round(val);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('de-DE')} €`;
};

const SquadPlayerRow = ({ entry }) => {
  const rising = (entry.predictedChange || 0) >= 0;
  return (
    <div className="flex items-center gap-3 bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2.5">
      {entry.position && (
        <span
          className="text-[8px] font-black uppercase tracking-widest rounded px-1.5 py-0.5 shrink-0"
          style={{ backgroundColor: `${POSITION_COLORS[entry.position] || '#8b92a5'}26`, color: POSITION_COLORS[entry.position] || '#8b92a5' }}
        >
          {entry.position}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-gray-100 truncate">{entry.firstName ? `${entry.firstName} ${entry.name}` : entry.name}</div>
        <div className="text-[10px] text-[#8b92a5]">{entry.team} · {formatMoney(entry.marketValue)}</div>
      </div>
      <div className={`text-[11px] font-black shrink-0 ${rising ? 'text-green-400' : 'text-red-400'}`}>
        {rising ? '▲' : '▼'} {formatSignedMoney(entry.predictedChange)}
      </div>
    </div>
  );
};

const KaderTab = ({ kickbaseId }) => {
  const [advisorData, setAdvisorData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/advisor-data.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((json) => setAdvisorData(json))
      .catch(() => setAdvisorData(null))
      .finally(() => setLoaded(true));
  }, []);

  const squad = useMemo(() => {
    if (!advisorData || !kickbaseId) return null;
    for (const league of Object.values(advisorData.leagues || {})) {
      const found = league.managerSquads?.[kickbaseId];
      if (found?.length) return found;
    }
    return null;
  }, [advisorData, kickbaseId]);

  if (!loaded) return <div className="text-xs text-[#8b92a5] text-center py-6">Lade Kader-Empfehlungen...</div>;
  if (!squad) {
    return (
      <div className="text-xs text-[#8b92a5] text-center py-6">
        Für dich sind noch keine Kader-Empfehlungen verfügbar.
      </div>
    );
  }

  const sorted = [...squad].sort((a, b) => (b.predictedChange || 0) - (a.predictedChange || 0));

  return (
    <div>
      <p className="text-[10px] text-[#8b92a5] mb-3">Marktwert-Prognose für deinen Kader (Trading Advisor).</p>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
        {sorted.map((entry, i) => (
          <SquadPlayerRow key={`${entry.playerId}-${i}`} entry={entry} />
        ))}
      </div>
    </div>
  );
};

// ---------- Hauptkomponente ----------

// Spieltag-Tab ist vorerst deaktiviert (siehe Nutzer-Feedback) - Komponente
// (SpieltagTab) bleibt im Code erhalten, um sie leicht wieder zu aktivieren.
// Kader-Tab wurde bewusst entfernt: personalisierte Kader-Empfehlungen sind
// jetzt exklusiv im Trading Advisor (Advisor.jsx) zu finden, nicht mehr auf
// der Account-Seite. KaderTab-Komponente bleibt im Code erhalten.
const TABS = [
  { key: 'liga', label: 'Liga' },
  { key: 'pokal', label: 'Pokal' },
];

export const SeasonSnapshot = ({ kickbaseId, kickbaseName, photoURL }) => {
  const [tab, setTab] = useState('liga');

  return (
    <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl mb-4 overflow-hidden">
      <div className="flex border-b border-[#2a2a2a]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${tab === t.key ? 'text-white border-[#ff5c3e]' : 'text-[#8b92a5] border-transparent hover:text-gray-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-5">
        {tab === 'liga' && <LigaTab kickbaseId={kickbaseId} />}
        {tab === 'pokal' && <PokalTab kickbaseId={kickbaseId} kickbaseName={kickbaseName} photoURL={photoURL} />}
        {/* Kader- und Spieltag-Tab bewusst deaktiviert, siehe TABS oben */}
      </div>
    </div>
  );
};
