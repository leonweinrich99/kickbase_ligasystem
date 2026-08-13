import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';

// Zeigt die Auswertungen des "Kickbase Trading Advisor" an (siehe
// backend/advisor/, generiert per GitHub Action aus
// frontend/public/advisor-data.json). Basiert auf dem Open-Source-Tool
// https://github.com/LennardFe/Kickbase-Trading-Advisor von LennardFe,
// angepasst auf unser 3-Ligen-System.

const LEAGUE_COLORS = {
  LIGA1: '#3b82f6',
  LIGA2: '#f97316',
  LIGA3: '#22c55e',
  TEST: '#22d3ee',
};
const DEFAULT_LEAGUE_COLOR = '#22d3ee';

const POSITION_COLORS = { TW: '#eab308', ABW: '#3b82f6', MF: '#22c55e', ST: '#ef4444' };
const POSITION_LABELS = { TW: 'Torwart', ABW: 'Abwehr', MF: 'Mittelfeld', ST: 'Sturm' };

const DB_PAGE_SIZE = 25;

const SECTION_TABS = [
  { key: 'budgets', label: 'Budgets' },
  { key: 'market', label: 'Markt' },
  { key: 'squad', label: 'Kader' },
  { key: 'database', label: 'Datenbank' },
];

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

const formatCompactMoney = (val) => {
  if (val === null || val === undefined) return '–';
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  return `${Math.round(val / 1000)}k €`;
};

const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  const [, month, day] = dateStr.split('-');
  return `${day}.${month}.`;
};

// Historie kommt aus Platzgruenden als kompaktes Tupel-Array [datum, mv, punkte]
// (siehe backend/advisor/run_advisor.py::build_history_by_player). Fuer
// recharts brauchen wir benannte Objekte - alte, noch im Cache liegende
// Objekt-Formate werden defensiv weiterhin unterstuetzt.
const normalizeHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => (Array.isArray(entry) ? { date: entry[0], mv: entry[1], points: entry[2] } : entry));
};

const DEFAULT_FILTERS = { search: '', position: 'ALL', team: 'ALL', sort: 'predictedDesc', risingOnly: false };

function applyFilters(list, filters) {
  let result = list;
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter((p) => `${p.firstName || ''} ${p.name || ''} ${p.team || ''}`.toLowerCase().includes(q));
  }
  if (filters.position && filters.position !== 'ALL') {
    result = result.filter((p) => p.position === filters.position);
  }
  if (filters.team && filters.team !== 'ALL') {
    result = result.filter((p) => p.team === filters.team);
  }
  if (filters.risingOnly) {
    result = result.filter((p) => (p.predictedChange || 0) > 0);
  }
  const sorters = {
    predictedDesc: (a, b) => (b.predictedChange || 0) - (a.predictedChange || 0),
    predictedAsc: (a, b) => (a.predictedChange || 0) - (b.predictedChange || 0),
    marketValueDesc: (a, b) => (b.marketValue || 0) - (a.marketValue || 0),
    marketValueAsc: (a, b) => (a.marketValue || 0) - (b.marketValue || 0),
    nameAsc: (a, b) => (a.name || '').localeCompare(b.name || ''),
  };
  return [...result].sort(sorters[filters.sort] || sorters.predictedDesc);
}

const FilterBar = ({ filters, onChange, teams, showTeamFilter = false }) => (
  <div className="flex flex-wrap gap-2 mb-4">
    <input
      type="text"
      placeholder="Suche nach Name oder Team..."
      value={filters.search}
      onChange={(e) => onChange({ ...filters, search: e.target.value })}
      className="flex-1 min-w-[180px] bg-[#171717] border border-[#2e2e2e] rounded-xl px-3 py-2 text-sm text-white placeholder-[#626978] outline-none focus:border-cyan-500"
    />
    <select
      value={filters.position}
      onChange={(e) => onChange({ ...filters, position: e.target.value })}
      className="bg-[#171717] border border-[#2e2e2e] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
    >
      <option value="ALL">Alle Positionen</option>
      {Object.entries(POSITION_LABELS).map(([code, label]) => (
        <option key={code} value={code}>{label}</option>
      ))}
    </select>
    {showTeamFilter && (
      <select
        value={filters.team}
        onChange={(e) => onChange({ ...filters, team: e.target.value })}
        className="bg-[#171717] border border-[#2e2e2e] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
      >
        <option value="ALL">Alle Teams</option>
        {teams.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    )}
    <select
      value={filters.sort}
      onChange={(e) => onChange({ ...filters, sort: e.target.value })}
      className="bg-[#171717] border border-[#2e2e2e] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
    >
      <option value="predictedDesc">Prognose: höchste zuerst</option>
      <option value="predictedAsc">Prognose: niedrigste zuerst</option>
      <option value="marketValueDesc">Marktwert: höchster zuerst</option>
      <option value="marketValueAsc">Marktwert: niedrigster zuerst</option>
      <option value="nameAsc">Name (A-Z)</option>
    </select>
    <button
      onClick={() => onChange({ ...filters, risingOnly: !filters.risingOnly })}
      className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filters.risingOnly ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-[#171717] border border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
    >
      Nur steigend
    </button>
  </div>
);

const StatCard = ({ label, value, accent = '#22d3ee' }) => (
  <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-4 flex-1 min-w-[120px]">
    <div className="text-[9px] font-black uppercase tracking-widest text-[#8b92a5] mb-1">{label}</div>
    <div className="text-xl font-black" style={{ color: accent }}>{value}</div>
  </div>
);

const BudgetRow = ({ entry, rank, color }) => (
  <div className="flex items-center p-3 mb-2.5 bg-[#171717] border border-[#2e2e2e] rounded-[14px] shadow-sm">
    <div className="w-8 flex justify-center items-center text-xs font-bold text-[#8b92a5] shrink-0">{rank}</div>
    <div className="ml-2 flex-1 min-w-0">
      <div className="text-[15px] font-bold text-gray-100 truncate">{entry.manager}</div>
      <div className="text-[10px] text-[#8b92a5] mt-0.5">Teamwert: {formatMoney(entry.teamValue)}</div>
    </div>
    <div className="text-right ml-2 shrink-0">
      <div className="text-[15px] font-bold" style={{ color }}>{formatMoney(entry.budget)}</div>
      <div className="text-[9px] font-bold text-[#626978] tracking-widest mt-0.5 uppercase">Budget (geschätzt)</div>
      {typeof entry.availableBudget === 'number' && (
        <div className="text-[10px] text-[#8b92a5] mt-1">Verfügbar (inkl. Dispo): {formatMoney(entry.availableBudget)}</div>
      )}
    </div>
  </div>
);

const PlayerCard = ({ entry, onClick }) => {
  const rising = (entry.predictedChange || 0) >= 0;
  const hasHistory = Array.isArray(entry.history) && entry.history.length > 1;
  return (
    <button
      onClick={hasHistory ? onClick : undefined}
      className={`w-full flex items-center p-3 mb-2.5 bg-[#171717] border border-[#2e2e2e] rounded-[14px] shadow-sm text-left transition-all ${hasHistory ? 'hover:border-cyan-500/50 hover:bg-[#1c1c1c] active:scale-[0.99] cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {entry.position && (
            <span
              className="text-[8px] font-black uppercase tracking-widest rounded px-1.5 py-0.5 shrink-0"
              style={{ backgroundColor: `${POSITION_COLORS[entry.position] || '#8b92a5'}26`, color: POSITION_COLORS[entry.position] || '#8b92a5' }}
            >
              {entry.position}
            </span>
          )}
          <div className="text-[15px] font-bold text-gray-100 truncate">
            {entry.firstName ? `${entry.firstName} ${entry.name}` : entry.name}
          </div>
          {entry.onMarket && (
            <span className="text-[8px] font-black uppercase tracking-widest bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-full px-1.5 py-0.5 shrink-0">Auf dem Markt</span>
          )}
          {entry.inSquad && (
            <span className="text-[8px] font-black uppercase tracking-widest bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full px-1.5 py-0.5 shrink-0">Im Kader</span>
          )}
          {entry.expiringToday && (
            <span className="text-[8px] font-black uppercase tracking-widest bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded-full px-1.5 py-0.5 shrink-0">Läuft heute ab</span>
          )}
          {hasHistory && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#626978" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
              <polyline points="17 6 23 6 23 12"></polyline>
            </svg>
          )}
        </div>
        <div className="text-[10px] text-[#8b92a5] mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{entry.team}</span>
          <span>·</span>
          <span>{formatMoney(entry.marketValue)}</span>
          {typeof entry.avgPoints === 'number' && (
            <>
              <span>·</span>
              <span>Ø {entry.avgPoints} Pkt.{entry.appearances ? ` (${entry.appearances} Sp.)` : ''}</span>
            </>
          )}
          {typeof entry.startElfProbability === 'number' && (
            <>
              <span>·</span>
              <span>Startelf-Wahrsch.: {Math.round(entry.startElfProbability * 100)}%</span>
            </>
          )}
          {typeof entry.hoursToExpiry === 'number' && (
            <>
              <span>·</span>
              <span>Noch {entry.hoursToExpiry}h im Angebot</span>
            </>
          )}
        </div>
      </div>
      <div className={`text-right ml-2 shrink-0 font-black text-[15px] ${rising ? 'text-green-400' : 'text-red-400'}`}>
        {rising ? '▲' : '▼'} {formatSignedMoney(entry.predictedChange)}
      </div>
    </button>
  );
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl px-3 py-2 shadow-xl">
      <div className="text-[10px] text-[#8b92a5] mb-1">{formatShortDate(label)}</div>
      <div className="text-sm font-bold text-cyan-400">{formatMoney(point.mv)}</div>
      {typeof point.points === 'number' && (
        <div className="text-[10px] text-[#8b92a5] mt-0.5">{point.points} Punkte an diesem Spieltag</div>
      )}
    </div>
  );
};

const formatSignedPercent = (val) => {
  if (val === null || val === undefined) return '–';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1).replace('.', ',')}%`;
};

const MiniStat = ({ label, value, positive }) => (
  <div className="bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl p-3 flex-1 min-w-0">
    <div className="text-[8px] font-black uppercase tracking-widest text-[#8b92a5] mb-1 truncate">{label}</div>
    <div className={`text-sm font-black truncate ${positive === undefined ? 'text-white' : positive ? 'text-green-400' : 'text-red-400'}`}>{value}</div>
  </div>
);

const PlayerHistoryModal = ({ player, onClose }) => {
  const history = normalizeHistory(player.history);
  const hasScoutingFacts = player.appearances !== undefined || player.totalMinutes !== undefined || player.avgPoints !== undefined;

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="max-w-lg w-full bg-[#171717] border border-[#2e2e2e] rounded-3xl p-6 shadow-2xl relative my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8b92a5] hover:text-white transition-colors"
          aria-label="Schließen"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="flex items-center gap-2 flex-wrap mb-1 pr-8">
          {player.position && (
            <span
              className="text-[9px] font-black uppercase tracking-widest rounded px-1.5 py-0.5"
              style={{ backgroundColor: `${POSITION_COLORS[player.position] || '#8b92a5'}26`, color: POSITION_COLORS[player.position] || '#8b92a5' }}
            >
              {player.position}
            </span>
          )}
          <h2 className="text-lg font-black uppercase text-white">
            {player.firstName ? `${player.firstName} ${player.name}` : player.name}
          </h2>
        </div>
        <p className="text-xs text-[#8b92a5] mb-5">{player.team}</p>

        <div className="flex gap-3 mb-3">
          <div className="bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl p-3 flex-1">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#8b92a5] mb-1">Aktueller Marktwert</div>
            <div className="text-base font-black text-white">{formatMoney(player.marketValue)}</div>
          </div>
          <div className="bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl p-3 flex-1">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#8b92a5] mb-1">Prognose morgen</div>
            <div className={`text-base font-black ${(player.predictedChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(player.predictedChange || 0) >= 0 ? '▲' : '▼'} {formatSignedMoney(player.predictedChange)}
            </div>
          </div>
        </div>

        {/* Mehrere Zeitraeume statt EINER Gesamt-Veraenderung ueber das ganze
            Chart-Fenster - genau das hat vorher fuer Verwirrung gesorgt
            (Chart wirkt zuletzt steigend, obwohl der Wert vor 60 Tagen noch
            hoeher war). 1/3/7-Tage-Werte kommen direkt aus dem Vorhersage-
            modell, nicht aus dem sichtbaren Chart-Ausschnitt berechnet. */}
        <div className="flex gap-2 mb-5">
          <MiniStat label="1 Tag" value={formatSignedMoney(player.changeYesterday)} positive={(player.changeYesterday || 0) >= 0} />
          <MiniStat label="3 Tage" value={formatSignedMoney(player.changeLast3Days)} positive={(player.changeLast3Days || 0) >= 0} />
          <MiniStat label="7 Tage" value={formatSignedPercent(player.trendLast7DaysPercent)} positive={(player.trendLast7DaysPercent || 0) >= 0} />
        </div>

        <div className="h-[180px] w-full mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#4b5563"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatShortDate}
                minTickGap={30}
              />
              <YAxis
                stroke="#4b5563"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                domain={['dataMin', 'dataMax']}
                tickFormatter={formatCompactMoney}
                width={70}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="mv" stroke="#22d3ee" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} animationDuration={800} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-[#8b92a5] text-center mb-5">Marktwert-Verlauf der letzten {history.length} Tage</p>

        {/* Scouting-Report: alles, was Kickbase zuverlaessig hergibt (Einsatz-
            minuten, Punkte). Vereinshistorie/Transfers gibt die Kickbase-API
            NICHT her - dafuer bräuchte man transfermarkt.de. */}
        {hasScoutingFacts && (
          <div className="pt-5 border-t border-[#2e2e2e]">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] mb-3">Scouting-Report (Saison)</h3>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Einsätze" value={player.appearances ?? '–'} />
              <MiniStat label="Gesamtminuten" value={player.totalMinutes ? `${player.totalMinutes}'` : '–'} />
              <MiniStat label="Ø Punkte / Spiel" value={player.avgPoints ?? '–'} />
              <MiniStat
                label="Letzter Spieltag"
                value={player.lastMinutesPlayed ? `${player.lastMinutesPlayed}' · ${player.lastPoints ?? 0} Pkt.` : 'Nicht eingesetzt'}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Advisor = () => {
  const { isAdmin } = useAuth();
  const goBack = useBackNavigation('/account');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [activeLeague, setActiveLeague] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [marketFilters, setMarketFilters] = useState(DEFAULT_FILTERS);
  const [dbFilters, setDbFilters] = useState(DEFAULT_FILTERS);
  const [squadFilters, setSquadFilters] = useState(DEFAULT_FILTERS);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [dbVisibleCount, setDbVisibleCount] = useState(DB_PAGE_SIZE);
  const [isAdvisorUpdating, setIsAdvisorUpdating] = useState(false);
  const [advisorUpdateStatus, setAdvisorUpdateStatus] = useState(null);
  const [sectionTab, setSectionTab] = useState('budgets');
  const [showInfo, setShowInfo] = useState(false);

  const loadData = () => {
    fetch(`/advisor-data.json?t=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then((json) => {
        setData(json);
        setError(false);
        // Ersten verfuegbaren Liga-Key automatisch aktiv setzen - fix auf
        // "LIGA1" waere falsch, solange der Advisor (vorerst) nur gegen die
        // einzelne "TEST"-Liga laeuft.
        const firstKey = Object.keys(json.leagues || {})[0];
        if (firstKey) setActiveLeague(firstKey);
      })
      .catch(() => setError(true));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdvisorUpdate = async () => {
    const password = window.prompt("Bitte Admin-Passwort eingeben:");
    if (!password) return;

    setIsAdvisorUpdating(true);
    setAdvisorUpdateStatus("Trading Advisor wird gestartet...");

    try {
      const res = await fetch(`/api/advisor-cron?secret=${encodeURIComponent(password)}`);
      if (res.ok) {
        setAdvisorUpdateStatus("✅ Angestoßen! Läuft ca. 2-5 Minuten im Hintergrund.");
        setTimeout(() => setAdvisorUpdateStatus(null), 6000);
      } else {
        const errData = await res.json();
        setAdvisorUpdateStatus(`❌ Fehler: ${errData.error || "Unbefugt"}`);
        setTimeout(() => setAdvisorUpdateStatus(null), 6000);
      }
    } catch {
      setAdvisorUpdateStatus("❌ Netzwerkfehler beim Update-Aufruf.");
      setTimeout(() => setAdvisorUpdateStatus(null), 6000);
    } finally {
      setIsAdvisorUpdating(false);
    }
  };

  const league = data?.leagues?.[activeLeague];
  const generatedAt = data?.generatedAt ? new Date(data.generatedAt) : null;

  const marketTeams = useMemo(
    () => [...new Set((league?.marketRecommendations || []).map((p) => p.team).filter(Boolean))].sort(),
    [league]
  );
  const filteredMarket = useMemo(
    () => applyFilters(league?.marketRecommendations || [], marketFilters),
    [league, marketFilters]
  );

  const dbTeams = useMemo(
    () => [...new Set((data?.players || []).map((p) => p.team).filter(Boolean))].sort(),
    [data]
  );
  const filteredDb = useMemo(() => applyFilters(data?.players || [], dbFilters), [data, dbFilters]);

  // Robust gegen aeltere/unvollstaendige Advisor-Daten (z.B. von einem Lauf
  // vor diesem Feature): Falls "managers" fehlt, aber "managerSquads"
  // trotzdem Daten hat, die Manager-Liste direkt daraus ableiten - damit die
  // Sektion IMMER sichtbar ist, sobald irgendwelche Kader-Daten bekannt sind.
  // Noch aeltere Laeufe (vor der Multi-Manager-Umstellung) hatten stattdessen
  // ein flaches "squadRecommendations"-Array fuer den eingeloggten Account -
  // auch das wird hier noch unterstuetzt, statt einfach nichts anzuzeigen.
  const effectiveManagerSquads = useMemo(() => {
    if (league?.managerSquads && Object.keys(league.managerSquads).length) return league.managerSquads;
    if (league?.squadRecommendations?.length) return { OWN: league.squadRecommendations };
    return {};
  }, [league]);

  const resolvedManagers = useMemo(() => {
    if (league?.managers?.length) return league.managers;
    const squadIds = Object.keys(effectiveManagerSquads);
    if (!squadIds.length) return [];
    return squadIds.map((id) => ({ id, name: id === 'OWN' ? 'Eigener Account' : `Manager ${id}` }));
  }, [effectiveManagerSquads, league]);

  const filteredSquad = useMemo(
    () => applyFilters(effectiveManagerSquads[selectedManagerId] || [], squadFilters),
    [effectiveManagerSquads, squadFilters, selectedManagerId]
  );

  // Wenn sich die aktive Liga aendert (oder Daten neu laden), automatisch
  // den ersten Manager mit einem tatsaechlich vorhandenen Kader auswaehlen.
  useEffect(() => {
    const managerIds = Object.keys(effectiveManagerSquads);
    if (managerIds.length && !managerIds.includes(selectedManagerId)) {
      setSelectedManagerId(managerIds[0]);
    } else if (!managerIds.length && selectedManagerId) {
      setSelectedManagerId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveManagerSquads]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
        <div className="text-center bg-[#171717] border border-[#2e2e2e] rounded-2xl p-8">
          <h1 className="text-lg font-black text-white uppercase mb-3">Kein Zugriff</h1>
          <p className="text-sm text-[#8b92a5] mb-6">Diese Seite ist nur für Admins.</p>
          <Link to="/" className="text-[#ff5c3e] text-sm font-bold uppercase tracking-widest">Zurück zum Ligasystem</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-cyan-400 mb-1">ADMIN</div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase text-white">Trading Advisor</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowInfo((v) => !v)}
              aria-label="Info"
              className={`w-9 h-9 flex items-center justify-center rounded-full border transition-all font-black text-xs ${showInfo ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'bg-[#171717] border-[#2e2e2e] text-[#8b92a5] hover:text-white hover:border-[#404040]'}`}
            >
              i
            </button>
            <button
              onClick={handleAdvisorUpdate}
              disabled={isAdvisorUpdating}
              aria-label="Trading Advisor aktualisieren"
              title="Trading Advisor aktualisieren"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#171717] border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500 transition-all disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isAdvisorUpdating ? 'animate-spin' : ''}>
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
            <button
              onClick={goBack}
              aria-label="Schließen"
              className="w-9 h-9 flex items-center justify-center bg-[#171717] border border-[#2e2e2e] rounded-full text-[#8b92a5] hover:text-white hover:border-[#404040] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {advisorUpdateStatus && (
          <p className="text-xs text-cyan-400 mb-4">{advisorUpdateStatus}</p>
        )}

        {showInfo && (
          <div className="bg-[#171717] border border-[#2e2e2e] rounded-xl p-4 text-xs text-[#8b92a5] mb-6">
            <p>
              Budget-Schätzungen & Marktwert-Prognosen, basierend auf dem Open-Source-Tool{' '}
              <a href="https://github.com/LennardFe/Kickbase-Trading-Advisor" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Kickbase-Trading-Advisor</a>{' '}
              von LennardFe. Läuft täglich automatisch, alle Werte sind Schätzungen ohne Gewähr.
            </p>
            {data && (
              <div className="flex flex-wrap gap-3 mt-4">
                <StatCard
                  label="Zuletzt aktualisiert"
                  value={generatedAt ? generatedAt.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–'}
                  accent="#8b92a5"
                />
                {data.modelStats && (
                  <>
                    <StatCard label="Richtungstreffer" value={`${data.modelStats.signsCorrectPercent}%`} accent="#22d3ee" />
                    <StatCard label="Trainingsdaten" value={data.modelStats.trainSamples} accent="#8b92a5" />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-6 text-center text-sm text-[#8b92a5] mb-6">
            Noch keine Auswertung vorhanden. Klicke oben auf das Aktualisieren-Symbol, um sie einmalig zu erzeugen.
          </div>
        )}

        {!error && !data && (
          <div className="text-center text-[#8b92a5] text-sm py-10">Lade Auswertung...</div>
        )}

        {data && (
          <>
            <div className="flex gap-2 mb-6 overflow-x-auto">
              {Object.keys(data.leagues || {}).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveLeague(key)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex items-center gap-2 ${activeLeague === key ? 'bg-white text-black' : 'bg-[#171717] border border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LEAGUE_COLORS[key] || DEFAULT_LEAGUE_COLOR }}></span>
                  {data.leagues[key].name}
                </button>
              ))}
            </div>

            <div className="flex border-b border-[#2e2e2e] mb-6 overflow-x-auto">
              {SECTION_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSectionTab(t.key)}
                  className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 ${sectionTab === t.key ? 'text-white border-cyan-400' : 'text-[#8b92a5] border-transparent hover:text-gray-300'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {league && sectionTab === 'budgets' && (
              <>
                <h2 className="text-[1.2rem] font-black text-[#f8fafc] mb-4 tracking-tight uppercase">Manager-Budgets (geschätzt)</h2>
                {league.budgets?.length ? (
                  <div className="mb-10">
                    {league.budgets.map((entry, index) => (
                      <BudgetRow key={entry.manager} entry={entry} rank={index + 1} color={LEAGUE_COLORS[activeLeague] || DEFAULT_LEAGUE_COLOR} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-[#8b92a5] text-sm py-6 mb-10">Keine Budget-Daten für diese Liga verfügbar.</div>
                )}
              </>
            )}

            {league && sectionTab === 'market' && (
              <>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="text-[1.2rem] font-black text-[#f8fafc] tracking-tight uppercase">Markt-Empfehlungen</h2>
                  <span className="text-[10px] text-[#8b92a5]">{filteredMarket.length} von {league.marketRecommendations?.length || 0} Spielern</span>
                </div>
                {league.marketRecommendations?.length ? (
                  <>
                    <FilterBar filters={marketFilters} onChange={setMarketFilters} teams={marketTeams} showTeamFilter />
                    {filteredMarket.length ? (
                      <div className="mb-10">
                        {filteredMarket.map((entry, index) => (
                          <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} onClick={() => setSelectedPlayer(entry)} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-[#8b92a5] text-sm py-6 mb-10">Kein Spieler passt zu den aktuellen Filtern.</div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-[#8b92a5] text-sm py-6 mb-10">Aktuell steht niemand auf dem Markt dieser Liga.</div>
                )}
              </>
            )}

            {/* Kader-Empfehlungen: eigener Tab, damit sie nicht in einer
                langen Seite untergehen. Fuer JEDEN Manager der Liga
                verfuegbar (siehe backend/advisor/run_advisor.py::build_manager_squads_payload).
                Admins koennen hier durchschalten, was ein beliebiger Manager
                an personalisierten Empfehlungen sehen wuerde. Immer
                sichtbar (auch mit alten/unvollstaendigen Daten, siehe
                effectiveManagerSquads/resolvedManagers oben), zeigt sonst
                einen klaren Hinweis statt einfach zu verschwinden. */}
            {league && sectionTab === 'squad' && (
              <>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h2 className="text-[1.2rem] font-black text-[#f8fafc] tracking-tight uppercase">Kader-Empfehlungen</h2>
                    <p className="text-[10px] text-[#8b92a5] mt-1">Personalisiert pro Manager - jeder Nutzer sieht (später) nur seinen eigenen Kader.</p>
                  </div>
                  {resolvedManagers.length > 0 && (
                    <span className="text-[10px] text-[#8b92a5]">{filteredSquad.length} von {(effectiveManagerSquads[selectedManagerId] || []).length} Spielern</span>
                  )}
                </div>
                {resolvedManagers.length > 0 ? (
                  <>
                    <select
                      value={selectedManagerId}
                      onChange={(e) => setSelectedManagerId(e.target.value)}
                      className="w-full bg-[#171717] border border-[#2e2e2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500 mb-4"
                    >
                      {resolvedManagers.map((m) => (
                        <option key={m.id} value={m.id} disabled={!effectiveManagerSquads[m.id]?.length}>
                          {m.name}{!effectiveManagerSquads[m.id]?.length ? ' (kein Kader gefunden)' : ''}
                        </option>
                      ))}
                    </select>
                    {selectedManagerId && effectiveManagerSquads[selectedManagerId]?.length > 0 ? (
                      <>
                        <FilterBar filters={squadFilters} onChange={setSquadFilters} teams={[]} />
                        {filteredSquad.length ? (
                          <div className="mb-10">
                            {filteredSquad.map((entry, index) => (
                              <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} onClick={() => setSelectedPlayer(entry)} />
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-[#8b92a5] text-sm py-6 mb-10">Kein Spieler passt zu den aktuellen Filtern.</div>
                        )}
                      </>
                    ) : (
                      <div className="text-center text-[#8b92a5] text-sm py-6 mb-10">Für diesen Manager konnte kein Kader abgerufen werden.</div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-[#8b92a5] text-sm py-6 mb-10">Noch keine Kader-Daten vorhanden - bitte den Advisor einmal aktualisieren.</div>
                )}
              </>
            )}

            {sectionTab === 'database' && (
              <>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h2 className="text-[1.2rem] font-black text-[#f8fafc] tracking-tight uppercase">Alle Spieler durchsuchen</h2>
                    <p className="text-[10px] text-[#8b92a5] mt-1">Marktwert-Prognose für die komplette Bundesliga, unabhängig davon, ob gerade jemand verkauft.</p>
                  </div>
                  <span className="text-[10px] text-[#8b92a5]">{filteredDb.length} von {data.players?.length || 0} Spielern</span>
                </div>
                {data.players?.length ? (
                  <>
                    <FilterBar filters={dbFilters} onChange={(f) => { setDbFilters(f); setDbVisibleCount(DB_PAGE_SIZE); }} teams={dbTeams} showTeamFilter />
                    {filteredDb.length ? (
                      <>
                        <div>
                          {filteredDb.slice(0, dbVisibleCount).map((entry, index) => (
                            <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} onClick={() => setSelectedPlayer(entry)} />
                          ))}
                        </div>
                        {dbVisibleCount < filteredDb.length && (
                          <button
                            onClick={() => setDbVisibleCount((c) => c + DB_PAGE_SIZE)}
                            className="w-full text-center text-[10px] font-black uppercase tracking-widest text-cyan-400 border border-cyan-500/30 rounded-2xl py-3 hover:bg-cyan-500/10 transition-colors"
                          >
                            Weitere {Math.min(DB_PAGE_SIZE, filteredDb.length - dbVisibleCount)} von {filteredDb.length - dbVisibleCount} laden
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="text-center text-[#8b92a5] text-sm py-6">Kein Spieler passt zu den aktuellen Filtern.</div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-[#8b92a5] text-sm py-6">Die Spieler-Datenbank ist noch nicht verfügbar (erst ab dem nächsten Advisor-Lauf).</div>
                )}
              </>
            )}
          </>
        )}

        {selectedPlayer && <PlayerHistoryModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
      </div>
    </div>
  );
};

export default Advisor;
