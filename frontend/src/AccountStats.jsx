import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { useLeagueEntry } from './useLeagueEntry';
import ManagerAvatar from './ui/ManagerAvatar';
import ligaLogo from './assets/logo.png';
import pokalLogo from './assets/pokal_logo.png';

// Kartenlose Liga/Pokal-Ansicht im selben Duktus wie die Advisor-Detailseite
// (PlayerDetailView) - freistehende Zahlen statt Kacheln, dünne Trennlinien
// statt Card-Rahmen. Wird auf der Account-Seite direkt unter dem Profil
// angezeigt.

// ---------- Liga-Tab ----------

const LigaTab = ({ kickbaseId }) => {
  const entry = useLeagueEntry(kickbaseId);
  if (!entry) return <div className="text-xs text-[#8b92a5] text-center py-6">Lade Liga-Daten...</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <img src={ligaLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: entry.leagueColor }}>
          {entry.leagueName}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="flex flex-col">
          <span className="text-[#8b92a5] text-[10px] font-bold uppercase tracking-widest mb-1">Platz</span>
          <span className="text-2xl font-semibold text-white">#{entry.rank}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[#8b92a5] text-[10px] font-bold uppercase tracking-widest mb-1">Punkte</span>
          <span className="text-2xl font-semibold text-white">{entry.points}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[#8b92a5] text-[10px] font-bold uppercase tracking-widest mb-1">Letzter ST</span>
          <span className="text-2xl font-semibold text-white">{entry.pointsMatchday}</span>
        </div>
      </div>
      <Link to={`/user/${kickbaseId}`} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors">
        Vollständige Statistik ansehen
        <ChevronRight size={12} strokeWidth={3} />
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
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <img src={pokalLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.color }}>{status.round}</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.color }}>
          {theme.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mb-5">
        <div className="flex flex-col items-center gap-1.5 w-[42%] min-w-0">
          <ManagerAvatar name={kickbaseName} photoURL={photoURL} size={56} ringColor={theme.color} />
          <span className="text-[11px] font-bold text-gray-100 truncate max-w-full">Du</span>
          {myEntry && (
            <span className="text-[9px] font-bold text-[#8b92a5] truncate max-w-full">
              {myEntry.leagueName} · #{myEntry.rank}
            </span>
          )}
        </div>
        <div className="text-[11px] font-black text-[#4b5563] italic shrink-0">VS</div>
        <div className="flex flex-col items-center gap-1.5 w-[42%] min-w-0">
          <ManagerAvatar name={status.opponent} size={56} />
          <span className="text-[11px] font-bold text-gray-100 truncate max-w-full">{opponentLabel}</span>
          {opponentEntry ? (
            <span className="text-[9px] font-bold text-[#8b92a5] truncate max-w-full">
              {opponentEntry.leagueName} · #{opponentEntry.rank}
            </span>
          ) : (
            <span className="text-[9px] font-bold text-[#8b92a5] truncate max-w-full opacity-0">-</span>
          )}
        </div>
      </div>

      {roundInfo && (
        <div className="flex items-center gap-2 text-[11px] text-[#8b92a5] border-t border-[#2a2a2a] pt-3 mb-1">
          <Calendar size={13} strokeWidth={2.5} />
          <span>Bundesliga-Spieltag {roundInfo.matchday} · {roundInfo.date}</span>
        </div>
      )}
      {opponentEntry && (
        <div className="text-[11px] text-[#8b92a5]">
          Gegner-Stats: <span className="text-gray-200 font-bold">Platz {opponentEntry.rank}</span> · <span className="text-gray-200 font-bold">{opponentEntry.points} Punkte</span>
        </div>
      )}

      <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-4">
        {canOpenH2H && (
          <Link to={`/compare/${kickbaseId}/${opponentEntry.id}`} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors">
            Head-to-Head ansehen
            <ChevronRight size={12} strokeWidth={3} />
          </Link>
        )}
        <Link to="/pokal" className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors">
          Zum Pokal-Baum
          <ChevronRight size={12} strokeWidth={3} />
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
          <Calendar size={12} strokeWidth={2.5} />
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
      <div className={`flex items-center gap-1 text-[11px] font-black shrink-0 ${rising ? 'text-green-400' : 'text-red-400'}`}>
        {rising ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {formatSignedMoney(entry.predictedChange)}
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
    <div className="mb-6">
      <div className="flex gap-5 border-b border-[#2a2a2a] mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-3 -mb-px text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${tab === t.key ? 'text-white border-[#ff5c3e]' : 'text-[#6b7280] border-transparent hover:text-gray-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'liga' && <LigaTab kickbaseId={kickbaseId} />}
      {tab === 'pokal' && <PokalTab kickbaseId={kickbaseId} kickbaseName={kickbaseName} photoURL={photoURL} />}
      {/* Kader- und Spieltag-Tab bewusst deaktiviert, siehe TABS oben */}
    </div>
  );
};
