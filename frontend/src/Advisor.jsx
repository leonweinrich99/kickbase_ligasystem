import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Info, RefreshCw, CheckCircle2, XCircle, SlidersHorizontal, X, ChevronDown, AlertTriangle, ArrowRight } from './ui/icons';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import PageHeader from './ui/PageHeader';
import advisorLogo from './assets/advisor_logo.png';
import CloseButton, { IconBackButton } from './ui/CloseButton';
import StatTile from './ui/StatTile';
import PlayerCard from './ui/AdvisorPlayerCard';
import LigaInsiderButton from './ui/LigaInsiderButton';
import StartProbBadge, { StartProbLegend } from './ui/StartProbBadge';
import { START_PROB_LEVELS, normalizeStartProbCode } from './startProbMeta';
import { countPositions, missingPositions, estimateReserveForMissingPositions } from './squadRules';
import {
  enrichPlayerWithCatalog,
  buildCompletePlayerCatalog,
  analyzeOwnSquad,
  evaluatePlayerForSquad,
  evaluateOwnSquadMember,
  computeCleanLeagueBudgets,
  suggestSalesToClearDeficit,
  getEffectiveXp,
} from './advisorSquadEval';
import {
  loadPlayerCatalogBundle,
  loadPlayerMatchdaysBundle,
  unpackPlayerMatchdaySeasons,
  loadTransfersByPlayerId,
  loadManagerLeagueMap,
} from './playerDetailData';
import { pointColor } from './ui/LivePlayerCircle';
import { isOctagonUI } from './ui/shapeTheme';
import { HexActiveDot, HexSmallDot } from './ui/ChartShapes';

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

// Uebersetzt die vom Backend gelieferten Empfehlungs-Gruende (Codes) in
// lesbaren deutschen Text - siehe backend/advisor/run_advisor.py::compute_recommendations.
const REASON_LABELS = {
  rising_value: 'Marktwert steigt',
  likely_starter: 'Voraussichtlich Startelf',
  injured_or_suspended: 'Verletzt/gesperrt',
  falling_value: 'Marktwert fällt',
  benched_last_matchday: 'Zuletzt nicht eingesetzt',
  low_starting_probability: 'Selten in der Startelf',
  confirmed_injured_external: 'Verletzung extern bestätigt',
};

const DB_PAGE_SIZE = 25;

const SECTION_TABS = [
  { key: 'market', label: 'Markt' },
  { key: 'squad', label: 'Kader' },
  { key: 'database', label: 'Datenbank' },
  { key: 'budgets', label: 'Budgets' },
];

const formatMoney = (val) => {
  if (val === null || val === undefined) return '–';
  return Math.round(val).toLocaleString('de-DE') + ' €';
};

const isDummyImage = (url) => url && (url.includes('dummy') || url.includes('placeholder') || url.includes('default') || url.includes('silhouet'));

const formatCompactMoney = (val) => {
  if (val === null || val === undefined) return '–';
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  return `${Math.round(val / 1000)}k €`;
};

const formatSignedCompactMoney = (val) => {
  if (val === null || val === undefined) return '–';
  const sign = val > 0 ? '+' : '';
  if (Math.abs(val) >= 1_000_000) return `${sign}${(val / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  return `${sign}${Math.round(val / 1000)}k €`;
};

const formatShortDate = (dateStr, withYear = false) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return withYear && year ? `${day}.${month}.${year.slice(2)}` : `${day}.${month}.`;
};

// Zentraler, gecachter Loader fuer die deduplizierte Langzeit-Marktwerthistorie
// (frontend/public/player-history.json) - wird einmal pro Sitzung geladen und
// von PlayerDetailView (im Advisor, Manager-Profil & AccountStats) geteilt.
let playerHistoryPromise = null;
const loadPlayerHistoryMap = () => {
  if (!playerHistoryPromise) {
    playerHistoryPromise = fetch(`/player-history.json?t=${Date.now()}`)
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return playerHistoryPromise;
};

// Historie kommt aus Platzgruenden als kompaktes Tupel-Array [datum, mv, punkte]
// (siehe backend/advisor/run_advisor.py::build_history_by_player). Fuer
// recharts brauchen wir benannte Objekte - alte, noch im Cache liegende
// Objekt-Formate werden defensiv weiterhin unterstuetzt.
const normalizeHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => (Array.isArray(entry) ? { date: entry[0], mv: entry[1], points: entry[2] } : entry));
};

const DEFAULT_FILTERS = { search: '', position: 'ALL', team: 'ALL', startProb: 'ALL', sort: 'predictedDesc', risingOnly: false, recommendedOnly: false, onMarketOnly: false, ownedOnly: false };
const DEFAULT_MARKET_FILTERS = { ...DEFAULT_FILTERS, sort: 'expiryAsc' };

function applyFilters(list, filters, recommendationMode) {
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
  if (filters.startProb && filters.startProb !== 'ALL') {
    result = result.filter((p) => {
      const code = normalizeStartProbCode(p.startElfProbability ?? p.prob);
      if (filters.startProb === 'LIKELY') return code === 1 || code === 2;
      return code === Number(filters.startProb);
    });
  }
  if (filters.risingOnly) {
    result = result.filter((p) => (p.predictedChange || 0) > 0);
  }
  if (filters.recommendedOnly && recommendationMode === 'buy') {
    result = result.filter((p) => p.buyRecommended);
  }
  if (filters.recommendedOnly && recommendationMode === 'sell') {
    result = result.filter((p) => p.sellRecommended);
  }
  // Nur in der "Alle Spieler"-Datenbank relevant (siehe dbPlayersAnnotated) -
  // dort fehlen sonst Markt-/Besitzer-Info komplett, anders als in den
  // Markt-/Kader-Listen, die je Definition nur EINEN dieser Zustaende zeigen.
  if (filters.onMarketOnly) {
    result = result.filter((p) => p.onMarket === true);
  }
  if (filters.ownedOnly) {
    result = result.filter((p) => !!p.ownedByAccount);
  }
  const sorters = {
    // Markt-Grundsortierung (Owner-Wunsch 24.11.2026): Spieler ohne Manager-
    // Besitzer nach Ablaufzeit aufsteigend (naechster Ablauf ganz oben),
    // Spieler die bereits einem anderen Manager gehoeren erst darunter.
    expiryAsc: (a, b) => {
      const aOwned = a.ownedByAccount ? 1 : 0;
      const bOwned = b.ownedByAccount ? 1 : 0;
      if (aOwned !== bOwned) return aOwned - bOwned;
      const aHasExp = typeof a.hoursToExpiry === 'number';
      const bHasExp = typeof b.hoursToExpiry === 'number';
      if (aHasExp && bHasExp && a.hoursToExpiry !== b.hoursToExpiry) {
        return a.hoursToExpiry - b.hoursToExpiry;
      }
      if (aHasExp !== bHasExp) return aHasExp ? -1 : 1;
      return (b.predictedChange || 0) - (a.predictedChange || 0);
    },
    predictedDesc: (a, b) => (b.predictedChange || 0) - (a.predictedChange || 0),
    predictedAsc: (a, b) => (a.predictedChange || 0) - (b.predictedChange || 0),
    xpDesc: (a, b) => getEffectiveXp(b) - getEffectiveXp(a),
    marketValueDesc: (a, b) => (b.marketValue || 0) - (a.marketValue || 0),
    marketValueAsc: (a, b) => (a.marketValue || 0) - (b.marketValue || 0),
    nameAsc: (a, b) => (a.name || '').localeCompare(b.name || ''),
  };
  return [...result].sort(sorters[filters.sort] || sorters.predictedDesc);
}

// Kompakte Filterleiste: nur Suche + ein Filter-Icon-Button sind permanent
// sichtbar, alle weiteren Optionen (Position, Team, Sortierung, Toggles)
// stecken in einem Popover - nimmt dadurch deutlich weniger Platz ein als
// vorher (5+ Elemente nebeneinander).
const FilterBar = ({ filters, onChange, teams, showTeamFilter = false, showAvailabilityFilters = false, showExpirySort = false, defaultSort = DEFAULT_FILTERS.sort, recommendationMode }) => {
  const [open, setOpen] = useState(false);

  const activeCount = [
    filters.position !== 'ALL',
    showTeamFilter && filters.team !== 'ALL',
    filters.startProb && filters.startProb !== 'ALL',
    filters.sort !== defaultSort,
    filters.risingOnly,
    recommendationMode && filters.recommendedOnly,
    showAvailabilityFilters && filters.onMarketOnly,
    showAvailabilityFilters && filters.ownedOnly,
  ].filter(Boolean).length;

  return (
    <div className="relative mb-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Suche nach Name oder Team..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="flex-1 min-w-0 bg-[#171717] border border-[#2e2e2e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#626978] outline-none focus:border-cyan-500"
        />
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Filter"
          className={`relative shrink-0 w-11 h-11 flex items-center justify-center rounded-xl border transition-all ${open || activeCount > 0 ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400' : 'bg-[#171717] border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
        >
          <SlidersHorizontal size={16} />
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-black text-[9px] font-black flex items-center justify-center">{activeCount}</span>
          )}
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-full sm:w-80 bg-[#171717] border border-[#2e2e2e] rounded-xl p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5]">Filter</span>
              <button onClick={() => setOpen(false)} className="text-[#8b92a5] hover:text-white transition-colors"><X size={14} /></button>
            </div>

            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-[#626978] mb-1">Position</label>
              <select
                value={filters.position}
                onChange={(e) => onChange({ ...filters, position: e.target.value })}
                className="w-full bg-[#000] border border-[#2e2e2e] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              >
                <option value="ALL">Alle Positionen</option>
                {Object.entries(POSITION_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>

            {showTeamFilter && (
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-[#626978] mb-1">Team</label>
                <select
                  value={filters.team}
                  onChange={(e) => onChange({ ...filters, team: e.target.value })}
                  className="w-full bg-[#000] border border-[#2e2e2e] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                >
                  <option value="ALL">Alle Teams</option>
                  {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-[#626978] mb-1">Startelf-Prognose</label>
              <select
                value={filters.startProb || 'ALL'}
                onChange={(e) => onChange({ ...filters, startProb: e.target.value })}
                className="w-full bg-[#000] border border-[#2e2e2e] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              >
                <option value="ALL">Alle Prognosen</option>
                <option value="LIKELY">Sicher &amp; Erwartet</option>
                {START_PROB_LEVELS.map((lvl) => (
                  <option key={lvl.code} value={String(lvl.code)}>{lvl.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-[#626978] mb-1">Sortierung</label>
              <select
                value={filters.sort}
                onChange={(e) => onChange({ ...filters, sort: e.target.value })}
                className="w-full bg-[#000] border border-[#2e2e2e] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              >
                {showExpirySort && <option value="expiryAsc">Ablaufzeit: nächste zuerst</option>}
                <option value="xpDesc">Erwartete Punkte (xP): höchste zuerst</option>
                <option value="predictedDesc">Prognose: höchste zuerst</option>
                <option value="predictedAsc">Prognose: niedrigste zuerst</option>
                <option value="marketValueDesc">Marktwert: höchster zuerst</option>
                <option value="marketValueAsc">Marktwert: niedrigster zuerst</option>
                <option value="nameAsc">Name (A-Z)</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {recommendationMode && (
                <button
                  onClick={() => onChange({ ...filters, recommendedOnly: !filters.recommendedOnly })}
                  className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filters.recommendedOnly ? (recommendationMode === 'sell' ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-green-500/20 text-green-400 border border-green-500/40') : 'bg-[#000] border border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
                >
                  {recommendationMode === 'sell' ? 'Nur Verkaufsempfehlungen' : 'Nur Kaufempfehlungen'}
                </button>
              )}
              <button
                onClick={() => onChange({ ...filters, risingOnly: !filters.risingOnly })}
                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filters.risingOnly ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-[#000] border border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
              >
                Nur steigend
              </button>
              {showAvailabilityFilters && (
                <>
                  <button
                    onClick={() => onChange({ ...filters, onMarketOnly: !filters.onMarketOnly })}
                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filters.onMarketOnly ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-[#000] border border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
                  >
                    Auf dem Markt
                  </button>
                  <button
                    onClick={() => onChange({ ...filters, ownedOnly: !filters.ownedOnly })}
                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filters.ownedOnly ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-[#000] border border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
                  >
                    Gehört einem Account
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const BudgetRow = ({ entry, rank, color }) => {
  const isNegative = (entry.budget ?? 0) < 0;
  return (
    <div className="flex items-center p-3 mb-2.5 card-surface rounded-[14px] shadow-sm">
      <div className="w-8 flex justify-center items-center text-xs font-bold text-[#8b92a5] shrink-0">{rank}</div>
      <div className="ml-2 flex-1 min-w-0">
        <div className="text-[15px] font-bold text-gray-100 truncate">{entry.manager}</div>
        <div className="text-[10px] text-[#8b92a5] mt-0.5 flex flex-wrap gap-x-2">
          <span>Kader: {formatCompactMoney(entry.teamValue)}</span>
          {typeof entry.wealth === 'number' && <span>· Finanzkraft: {formatCompactMoney(entry.wealth)}</span>}
          {typeof entry.totalProfit === 'number' && (
            <span className={entry.totalProfit >= 0 ? 'text-emerald-400/90' : 'text-red-400/90'}>
              · Gewinn: {formatSignedCompactMoney(entry.totalProfit)}
            </span>
          )}
        </div>
      </div>
      <div className="text-right ml-2 shrink-0">
        <div className="text-[15px] font-bold tabular-nums" style={{ color: isNegative ? '#ef4444' : color }}>
          {formatMoney(entry.budget)}
        </div>
        <div className="text-[9px] font-bold text-[#626978] tracking-widest mt-0.5 uppercase">
          {isNegative ? 'Bis Spieltag auszugleichen' : 'Konto (Spieltags-Ziel ≥ 0)'}
        </div>
        {typeof entry.midweekBuyingPower === 'number' && (
          <div className="text-[10px] text-[#8b92a5] mt-1 tabular-nums">
            Mit 33%-Dispo (unter der Woche): <span className="text-gray-200 font-semibold">{formatCompactMoney(Math.max(0, entry.midweekBuyingPower))}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const val = point.mv !== undefined ? point.mv : point.mv_predicted;
  return (
    <div className="bg-[#0e0e0e]/95 border border-white/15 rounded-lg px-2 py-1 shadow-lg pointer-events-none whitespace-nowrap">
      <span className={`text-xs font-bold tabular-nums ${point.isPredicted ? 'text-[#eab308]' : 'text-white'}`}>
        {formatCompactMoney(val)}
      </span>
      <span className="text-[10px] text-[#8b92a5] ml-1.5 tabular-nums">
        {formatShortDate(label, false)}{point.isPredicted ? ' · Prog.' : ''}
      </span>
    </div>
  );
};

// Einheitliche, nicht-lineare Punkte-Balken-Skala (ueber alle Spieler identisch):
// - 0 Punkte       -> 0 % (Grundlinie)
// - 100 Punkte     -> 50 % (exakt die Mitte!)
// - 100..700 Pkt   -> 50 %..100 % (nach oben hin flacher werdend, logarithmisch komprimiert)
// - Minuspunkte    -> Betrag |p| nach oben als roter Balken (0..700 fester Rahmen)
const POINTS_BAR_MAX = 700;
const getNormalizedPointBarRatio = (points) => {
  const absPts = Math.min(POINTS_BAR_MAX, Math.max(0, Math.abs(points || 0)));
  if (absPts <= 0) return 0;
  if (absPts <= 100) return 0.5 * (absPts / 100);
  const t = (absPts - 100) / (POINTS_BAR_MAX - 100);
  return 0.5 + 0.5 * (Math.log1p(3 * t) / Math.log(4));
};

// Exakte App-Punkte-Farbskala inkl. Gold-Bereich ab 400 Punkten:
// < 0 rot, 0 grau, 1-99 orange, 100-199 gruen, 200-399 dunkelgruen, >= 400 gold; xP cyan.
const getMatchdayBarStyle = (pt, heightPx) => {
  if (pt.isXp) {
    return {
      height: `${heightPx}px`,
      backgroundColor: 'rgba(34, 211, 238, 0.28)',
      border: '1.5px dashed #22d3ee',
    };
  }
  if (!pt.played || pt.points === 0) {
    return {
      height: '3px',
      backgroundColor: pt.played ? '#6b7280' : '#333740',
    };
  }
  if (pt.points < 0) {
    return {
      height: `${heightPx}px`,
      backgroundColor: '#ef4444',
    };
  }
  if (pt.points < 100) {
    return {
      height: `${heightPx}px`,
      backgroundColor: '#fb923c',
    };
  }
  if (pt.points < 200) {
    return {
      height: `${heightPx}px`,
      backgroundColor: '#4ade80',
    };
  }
  if (pt.points < 400) {
    return {
      height: `${heightPx}px`,
      backgroundColor: '#15803d',
      border: '1px solid #22c55e',
    };
  }
  // Goldener Bereich ab 400 Punkten
  return {
    height: `${heightPx}px`,
    background: 'linear-gradient(180deg, #fde047 0%, #eab308 55%, #b45309 100%)',
    border: '1px solid #fef08a',
    boxShadow: '0 0 10px rgba(250, 204, 21, 0.42)',
  };
};

const MiniStat = ({ label, value, positive }) => (
  <div className="bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl p-3 flex-1 min-w-0">
    <div className="text-[8px] font-black uppercase tracking-widest text-[#8b92a5] mb-1 truncate">{label}</div>
    <div className={`text-sm font-black truncate ${positive === undefined ? 'text-white' : positive ? 'text-green-400' : 'text-red-400'}`}>{value}</div>
  </div>
);

const PlayerAvatar = ({ url, name, position, size = 64 }) => {
  const [failed, setFailed] = useState(false);
  // Kickbase sendet oft "dummy" Bilder für Spieler ohne Foto. 
  // Wir ignorieren diese und nutzen stattdessen unseren Initialen-Kreis.
  const isDummy = isDummyImage(url);
  const showImage = url && !isDummy && !failed;
  return (
    <div
      className="rounded-full overflow-hidden shrink-0 flex items-center justify-center font-black bg-[#0a0a0a] border-2"
      style={{ width: size, height: size, borderColor: POSITION_COLORS[position] || '#2e2e2e', fontSize: size / 2.6, color: POSITION_COLORS[position] || '#8b92a5' }}
    >
      {showImage ? (
        <img
          src={url}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        name ? name.charAt(0).toUpperCase() : '?'
      )}
    </div>
  );
};


const PlayerImageDetail = ({ url, name, position, teamLogo }) => {
  const [failed, setFailed] = useState(false);
  const isDummy = isDummyImage(url);
  const showImage = url && !isDummy && !failed;

  if (showImage) {
    return (
      <div 
        className="w-[300px] sm:w-[380px] h-[240px] sm:h-[280px] pointer-events-none relative"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)',
          transform: 'translateX(15%)',
        }}
      >
        {teamLogo && (
          <img 
            src={teamLogo} 
            alt="Team Logo" 
            className="absolute top-4 right-12 sm:right-16 w-32 h-32 sm:w-40 sm:h-40 object-contain opacity-40 z-0 mix-blend-screen" 
          />
        )}
        <img
          src={url}
          alt={name}
          className="w-full h-full object-cover object-top pointer-events-none relative z-10"
          style={{ 
            WebkitMaskImage: 'linear-gradient(270deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 85%)',
            maskImage: 'linear-gradient(270deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 85%)',
            marginTop: '-4%'
          }}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="opacity-10 pointer-events-none blur-md scale-150 transform origin-top-right mt-4 mr-4">
      <PlayerAvatar url={null} name={name} position={position} size={100} />
    </div>
  );
};

const TrendArrow = ({ code }) => {
  // "mvt" (Marktwert-Trendrichtung) in Kickbase v4: 1 = steigend, 2 = fallend, 0 = stabil.
  if (code === 1) return <span className="text-green-400">▲</span>;
  if (code === 2) return <span className="text-red-400">▼</span>;
  return null;
};


const TRANSFER_LEAGUE_COLORS = {
  'LIGA 1': '#4ba6ff',
  'LIGA 2': '#ff5c3e',
  'LIGA 3': '#22c55e',
};

const formatTransferDate = (iso) => {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`;
};

const normalizeLeagueLabel = (raw) => {
  if (!raw) return null;
  const s = String(raw).toUpperCase().replace(/\s+/g, '');
  if (s === 'LIGA1') return 'LIGA 1';
  if (s === 'LIGA2') return 'LIGA 2';
  if (s === 'LIGA3') return 'LIGA 3';
  return String(raw).toUpperCase().trim();
};

export const PlayerDetailView = ({ player, teamLogos = {}, onClose, leagueKey = null }) => {
  const { profile } = useAuth();
  const pointsScrollRef = useRef(null);

  useEffect(() => {
    const scrollY = window.scrollY;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    return () => {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
    };
  }, []);

  const [remoteHistory, setRemoteHistory] = useState(null);
  const [matchdaySeasons, setMatchdaySeasons] = useState([]);
  const [fallbackXp, setFallbackXp] = useState(null);
  const [playerTransfers, setPlayerTransfers] = useState([]);
  const [userLeague, setUserLeague] = useState(null);
  const [showNextXp, setShowNextXp] = useState(true);
  const [onlyDirectDeals, setOnlyDirectDeals] = useState(false);
  const [showAllTransfers, setShowAllTransfers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const pid = String(player.playerId);

    loadPlayerHistoryMap().then((map) => {
      if (cancelled || !map) return;
      const list = map[pid];
      if (Array.isArray(list) && list.length > 0) {
        setRemoteHistory(list);
      }
    });
    loadPlayerCatalogBundle().then((bundle) => {
      if (cancelled || !bundle) return;
      const xp = bundle.xpMap.get(pid) || null;
      if (xp) setFallbackXp(xp);
    });
    loadPlayerMatchdaysBundle().then((bundle) => {
      if (cancelled || !bundle) return;
      const seasons = unpackPlayerMatchdaySeasons(bundle, pid);
      setMatchdaySeasons(seasons);
    });
    loadTransfersByPlayerId().then((map) => {
      if (cancelled || !map) return;
      setPlayerTransfers(map.get(pid) || []);
    });
    return () => { cancelled = true; };
  }, [player.playerId]);

  useEffect(() => {
    let cancelled = false;
    loadManagerLeagueMap().then((lgMap) => {
      if (cancelled || !lgMap) return;
      const byId = profile?.kickbaseId != null ? lgMap.byId.get(String(profile.kickbaseId)) : null;
      const byName = profile?.kickbaseName ? lgMap.byName.get(String(profile.kickbaseName).toLowerCase().trim()) : null;
      const resolved = byId || byName || normalizeLeagueLabel(leagueKey) || null;
      setUserLeague(resolved);
    });
    return () => { cancelled = true; };
  }, [profile?.kickbaseId, profile?.kickbaseName, leagueKey]);

  // Spieltags-Graph automatisch ans rechte Ende (neueste Spieltage + xP) scrollen
  useEffect(() => {
    const el = pointsScrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    });
    return () => cancelAnimationFrame(raf);
  }, [matchdaySeasons, showNextXp]);

  const fullBaseHistory = useMemo(() => {
    const raw = (remoteHistory && remoteHistory.length >= (player.history?.length || 0))
      ? remoteHistory
      : player.history;
    return normalizeHistory(raw).filter((pt) => pt && pt.mv !== null && pt.mv !== undefined);
  }, [remoteHistory, player.history]);
  const [timeRange, setTimeRange] = useState('3m');
  
  const baseHistory = useMemo(() => {
    if (timeRange === 'max') return fullBaseHistory;
    let days = 365;
    if (timeRange === '1w') days = 7;
    else if (timeRange === '1m') days = 30;
    else if (timeRange === '3m') days = 90;
    else if (timeRange === '6m') days = 180;
    return fullBaseHistory.slice(-days);
  }, [fullBaseHistory, timeRange]);
  
  const history = [...baseHistory];
  if (history.length > 0) {
      // Kopiere den letzten Punkt, um das Original-Array nicht zu mutieren
      const lastPoint = { ...history[history.length - 1] };
      history[history.length - 1] = lastPoint;
      
      // Falls wir einen Live-Marktwert haben, der abweicht (z.B. nach 22 Uhr), 
      // fuegen wir ihn als echten Punkt von "Heute" ein, damit die Linien exakt andocken.
      let currentMv = lastPoint.mv;
      let baseDateObj = new Date(lastPoint.date);
      
      if (player.marketValue && player.marketValue !== lastPoint.mv) {
          currentMv = player.marketValue;
          baseDateObj = new Date(); // Heute
          const dateStr = baseDateObj.toISOString().split('T')[0];
          
          // Wenn der letzte Punkt im Graph NICHT von heute ist, fuegen wir heute hinzu
          if (dateStr !== lastPoint.date) {
              const todayPoint = {
                  date: dateStr,
                  mv: currentMv,
                  mv_predicted: currentMv
              };
              history.push(todayPoint);
          } else {
              // Überschreibe den heutigen Wert, falls er schon existiert aber abweicht
              lastPoint.mv = currentMv;
              lastPoint.mv_predicted = currentMv;
          }
      } else {
          lastPoint.mv_predicted = lastPoint.mv;
      }
      
      const addPredictedPoint = (daysAhead, change) => {
          if (change === undefined) return;
          const futureDate = new Date(baseDateObj);
          futureDate.setDate(futureDate.getDate() + daysAhead);
          history.push({
              date: futureDate.toISOString().split('T')[0],
              mv_predicted: currentMv + change,
              isPredicted: true
          });
      };
      
      addPredictedPoint(1, player.predictedChange);
      addPredictedPoint(3, player.predictedChange3d);
      addPredictedPoint(7, player.predictedChange7d);
  }
  
  const isFit = player.status === null || player.status === undefined || player.status === 0;
  const squadEval = player.squadEval;
  const showStartelfBadge = !player.inSquad && squadEval?.tier === 'startelf';
  const showPlayBadge = !player.inSquad && (squadEval?.tier === 'kader' || (!squadEval && player.onMarket && player.playRecommended));
  const showTradeBadge = !player.inSquad && (squadEval?.tier === 'trading' || (!squadEval && player.onMarket && player.tradeRecommended));
  const showSellBadge = player.inSquad && player.sellRecommended;
  const reasons = (player.inSquad ? player.sellReasons : player.buyReasons) || [];

  return (
    <div className="w-full bg-[#000000] min-h-screen relative flex flex-col pb-10">
      <div className="max-w-3xl w-full mx-auto relative flex flex-col flex-1">
        {/* Moderner Detail-Header im normalen Fluss (kein sticky-Ruckeln beim Scrollen) */}
        <div className="px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between gap-2 relative z-20">
          <IconBackButton onClick={onClose} />
          <LigaInsiderButton
            playerId={player.playerId ?? player.id}
            playerName={player.firstName ? `${player.firstName} ${player.name}` : player.name}
          />
        </div>

        <div className="min-h-0 pt-1 pb-8 relative">
          
          {/* Hero background image with dynamic masking */}
          <div className="absolute top-0 right-0 z-0 pointer-events-none overflow-hidden" style={{ width: '100%', height: '240px', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start' }}>
             <PlayerImageDetail url={player.imageUrl} name={player.name} position={player.position} />
          </div>

          {/* Header - Name & Team */}
          <div className="px-4 sm:px-6 mb-3 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex items-center gap-1.5 bg-[#0a0a0a]/60 backdrop-blur-md px-1.5 py-0.5 rounded-md -ml-1.5">
                  {teamLogos[player.team] && (
                    <img src={teamLogos[player.team]} alt={player.team} className="w-4 h-4 object-contain opacity-90 drop-shadow-md" />
                  )}
                  <span className="text-[#8b92a5] font-medium text-sm tracking-wide">{player.team}</span>
                </div>
                {player.position && (
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 backdrop-blur-md"
                      style={{ backgroundColor: `${POSITION_COLORS[player.position] || '#8b92a5'}26`, color: POSITION_COLORS[player.position] || '#8b92a5' }}
                    >
                      {player.position}
                    </span>
                )}
              </div>
              <div className="flex items-center gap-2 max-w-[85%]">
                <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-tight drop-shadow-lg truncate">
                  {player.firstName ? `${player.firstName} ${player.name}` : player.name}
                </h2>
                {normalizeStartProbCode(player.startElfProbability ?? player.prob) != null && (
                  <div className="shrink-0 rounded-full bg-black/75 p-[1.5px] shadow-md">
                    <StartProbBadge prob={player.startElfProbability ?? player.prob} variant="icon" size={20} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Price & Change (Scalable Style) */}
          <div className="px-4 sm:px-6 mb-6 relative z-10">
            <div className="text-3xl sm:text-[40px] font-semibold text-white leading-none tracking-tight mb-2">
              {formatMoney(player.marketValue)}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`text-sm sm:text-base font-medium ${(player.predictedChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {player.predictedChange > 0 ? '+' : ''}{formatMoney(player.predictedChange)} (Prognose Morgen)
              </span>
              
              {(player.predictedChange3d !== undefined || player.predictedChange7d !== undefined) && (
                <div className="flex gap-2 items-center text-xs sm:text-sm font-medium">
                  <span className="text-[#4b5563]">|</span>
                  {player.predictedChange3d !== undefined && (
                    <span className={(player.predictedChange3d || 0) >= 0 ? 'text-green-500/80' : 'text-red-500/80'}>
                      {player.predictedChange3d > 0 ? '+' : ''}{formatCompactMoney(player.predictedChange3d)} (3T)
                    </span>
                  )}
                  {player.predictedChange7d !== undefined && (
                    <>
                      <span className="text-[#4b5563]">·</span>
                      <span className={(player.predictedChange7d || 0) >= 0 ? 'text-green-500/80' : 'text-red-500/80'}>
                        {player.predictedChange7d > 0 ? '+' : ''}{formatCompactMoney(player.predictedChange7d)} (7T)
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Chart (Clean without grid) */}
          {history.length > 0 ? (
            <div className="h-[160px] sm:h-[200px] w-full px-4 sm:px-6 mb-6 relative">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
                  <XAxis
                    dataKey="date"
                    stroke="#4b5563"
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(d) => formatShortDate(d, timeRange === '1y' || timeRange === 'max')}
                    minTickGap={30}
                  />
                  <YAxis
                    stroke="#4b5563"
                    tickLine={false}
                    axisLine={false}
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatCompactMoney}
                    orientation="left"
                    width={0}
                    tickMargin={0}
                    tick={{ dx: 5, dy: -10, fill: '#6b7280', fontSize: 10, textAnchor: 'start', fontWeight: 600 }}
                    tickCount={3}
                  />
                  <Tooltip 
                     content={<ChartTooltip />}
                     cursor={{ stroke: '#2e2e2e', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  {/* connectNulls stellt sicher, dass die Linien perfekt aneinander andocken */}
                  <Line type={isOctagonUI ? 'linear' : 'monotone'} dataKey="mv" stroke="#ffffff" strokeWidth={2.5} dot={false} activeDot={<HexActiveDot r={6} fill="#ffffff" />} connectNulls={true} animationDuration={800} />
                  <Line type={isOctagonUI ? 'linear' : 'monotone'} dataKey="mv_predicted" stroke="#eab308" strokeDasharray="2 3" strokeWidth={1.5} dot={<HexSmallDot r={3.5} fill="#eab308" />} activeDot={<HexActiveDot r={5.5} fill="#eab308" />} connectNulls={true} animationDuration={800} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mx-4 sm:mx-6 mb-6 rounded-xl border border-[#2e2e2e] bg-[#111111] px-4 py-6 text-center text-xs text-[#8b92a5]">
              Marktwert-Verlauf und ML-Prognose werden beim nächsten Trading-Advisor-Lauf ergänzt.
            </div>
          )}

          {/* Time Toggles */}
          <div className="px-4 sm:px-6 mb-8">
            <div className="flex justify-between items-center max-w-[310px] mx-auto border-b border-[#2e2e2e] pb-2">
              {[
                { key: '1w', label: '1W' },
                { key: '1m', label: '1M' },
                { key: '3m', label: '3M' },
                { key: '6m', label: '6M' },
                { key: '1y', label: '1J' },
                { key: 'max', label: 'MAX' },
              ].map((range) => (
                <button
                  key={range.key}
                  onClick={() => setTimeRange(range.key)}
                  className={`text-xs sm:text-[13px] font-medium pb-2 -mb-[9px] transition-colors border-b-2 ${timeRange === range.key ? 'text-white border-white' : 'text-[#6b7280] border-transparent hover:text-gray-300'}`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Badges / Trading Recommendations (Startelf-Kreis sitzt jetzt neben dem Namen) */}
          {(showStartelfBadge || showPlayBadge || showTradeBadge || showSellBadge || !isFit || player.teamOfTheWeek) && (
            <div className="px-4 sm:px-6 mb-6 flex flex-wrap items-center gap-2">
              {showSellBadge && (
                <div className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium">
                  ⚠ Verkaufen
                </div>
              )}
              {showStartelfBadge && (
                <div className="bg-green-500/15 text-green-400 border border-green-500/35 px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium">
                  ★ Startelf-Upgrade
                </div>
              )}
              {showPlayBadge && (
                <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium">
                  {squadEval?.badgeLabel || '✓ Kader-Ergänzung'}
                </div>
              )}
              {showTradeBadge && (
                <div className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium">
                  📈 Nur Trading
                </div>
              )}
              {!isFit && player.statusLabel && (
                <div className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium">
                  {player.statusLabel}
                </div>
              )}
              {player.teamOfTheWeek && (
                <div className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium">
                  ★ S11
                </div>
              )}
              {reasons.length > 0 && (
                <div className="w-full text-[11px] text-[#8b92a5] mt-1">
                  Grund: {reasons.map((r) => REASON_LABELS[r] || r).join(' · ')}
                </div>
              )}
            </div>
          )}

          {/* Spieltags-Punkte (durchgehend ueber alle Saisons scrollbar, borderless wie der Marktwert-Graph) */}
          {(() => {
            if (matchdaySeasons.length === 0) return null;

            const currentSeason = matchdaySeasons[0];
            const chronologicalSeasons = [...matchdaySeasons].reverse();

            const effectiveXpSeason = typeof player.xpSeason === 'number' ? player.xpSeason : fallbackXp?.xpSeason;
            const effectiveXpNext = typeof player.xpNext === 'number' ? player.xpNext : fallbackXp?.xpNext;
            const effectiveNextMd = player.nextMatchday ?? fallbackXp?.nextMatchday ?? null;
            const effectiveNextOpp = player.nextOpponent ?? fallbackXp?.nextOpponent ?? null;
            const effectiveIsHome = player.isHome ?? fallbackXp?.isHome ?? null;
            const effectiveMatchup = player.xpMatchupFactor ?? fallbackXp?.matchupFactor ?? null;

            const currentPlayedEntries = currentSeason.entries.filter((e) => !e.isUpcoming);
            const upcomingEntry = currentSeason.entries.find((e) => e.isUpcoming) || null;

            const timelineItems = [];
            const allPointsForScale = [];

            chronologicalSeasons.forEach((season, sIdx) => {
              const seasonPlayed = season.entries.filter((e) => !e.isUpcoming);
              const isCur = season.isCurrentSeason;
              const willAppendXp = isCur && showNextXp && typeof effectiveXpNext === 'number';
              if (seasonPlayed.length === 0 && !willAppendXp) return;

              timelineItems.push({
                type: 'season',
                key: `season-${season.title}`,
                label: season.shortLabel,
                isCurrent: isCur,
                isFirst: sIdx === 0,
              });

              seasonPlayed.forEach((pt) => {
                timelineItems.push({
                  type: 'matchday',
                  key: `${season.title}-${pt.day}`,
                  pt,
                });
                allPointsForScale.push(pt);
              });

              if (willAppendXp) {
                const nextDay = upcomingEntry?.day ?? effectiveNextMd ?? (seasonPlayed.length > 0 ? seasonPlayed[seasonPlayed.length - 1].day + 1 : null);
                if (nextDay != null) {
                  const oppName = upcomingEntry?.opponent || effectiveNextOpp;
                  const oppLogo = upcomingEntry?.oppLogo || (oppName ? teamLogos[oppName] : null) || null;
                  const xpPt = {
                    day: nextDay,
                    label: `ST ${nextDay}`,
                    points: effectiveXpNext,
                    played: true,
                    opponent: oppName,
                    oppLogo,
                    isHome: upcomingEntry?.isHome ?? effectiveIsHome,
                    isXp: true,
                  };
                  timelineItems.push({
                    type: 'matchday',
                    key: `${season.title}-${nextDay}-xp`,
                    pt: xpPt,
                  });
                  allPointsForScale.push(xpPt);
                }
              }
            });

            if (allPointsForScale.length === 0) return null;

            const playedCurrentOnly = currentPlayedEntries.filter((m) => m.played);
            const avgPlayed = playedCurrentOnly.length > 0
              ? Math.round(playedCurrentOnly.reduce((s, m) => s + m.points, 0) / playedCurrentOnly.length)
              : null;

            const barZonePx = 120;
            const line100BottomPx = Math.round(barZonePx * 0.5); // 100 Pkt = exakt Mitte (50%)
            const line400BottomPx = Math.round(barZonePx * getNormalizedPointBarRatio(400)); // 400 Pkt = Gold-Grenze (~83%)

            return (
              <div className="mb-8">
                <div className="px-4 sm:px-6 flex items-center justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-white leading-tight">Spieltags-Punkte</h3>
                    {avgPlayed != null && (
                      <div className="text-[11px] text-[#8b92a5] tabular-nums mt-0.5">
                        Ø <span className={`font-semibold ${pointColor(avgPlayed)}`}>{avgPlayed}</span> Pkt ({playedCurrentOnly.length} Einsätze {currentSeason.shortLabel})
                        {typeof effectiveXpSeason === 'number' ? ` · ${effectiveXpSeason} xP` : ''}
                      </div>
                    )}
                  </div>
                  {typeof effectiveXpNext === 'number' && (effectiveNextMd != null || upcomingEntry?.day != null) && (
                    <button
                      type="button"
                      onClick={() => setShowNextXp((v) => !v)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                        showNextXp
                          ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/45'
                          : 'bg-white/[0.04] text-[#8b92a5] border-white/10 hover:text-white'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${showNextXp ? 'bg-cyan-400' : 'bg-[#626978]'}`} />
                      <span>xP ST {upcomingEntry?.day ?? effectiveNextMd}</span>
                    </button>
                  )}
                </div>

                {/* Borderless, durchgehend wischbare Saison-Timeline mit fester 0..700 Skala
                    (100 Pkt = Mitte, ab 400 Pkt Gold, Minus = rot nach oben):
                    Saison-Trenner + Spieltag -> Gegner-Logo -> Ergebnis -> Balken -> Punkte -> Minuten */}
                <div ref={pointsScrollRef} className="overflow-x-auto no-scrollbar w-full">
                  <div className="flex items-stretch gap-1 min-w-max px-4 sm:px-6 py-1 relative">
                    {timelineItems.map((item) => {
                      if (item.type === 'season') {
                        return (
                          <div
                            key={item.key}
                            className={`shrink-0 flex flex-col items-center justify-between py-1.5 ${
                              item.isFirst ? 'pr-2' : 'px-2.5'
                            }`}
                          >
                            <span
                              className={`text-[9px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded-md tabular-nums ${
                                item.isCurrent
                                  ? 'bg-white/12 text-white'
                                  : 'bg-white/[0.05] text-[#8b92a5]'
                              }`}
                            >
                              {item.label}
                            </span>
                            <div className="w-[1px] flex-1 my-1.5 bg-gradient-to-b from-white/25 via-white/10 to-transparent" />
                          </div>
                        );
                      }

                      const pt = item.pt;
                      const hasBarValue = (pt.played || pt.isXp) && pt.points !== 0;
                      const ratio = hasBarValue ? getNormalizedPointBarRatio(pt.points) : 0;
                      const barHeightPx = hasBarValue ? Math.max(5, Math.round(ratio * barZonePx)) : 3;
                      const barStyle = getMatchdayBarStyle(pt, barHeightPx);

                      const ptsText = pt.isXp
                        ? `${pt.points}`
                        : pt.played
                          ? `${pt.points}`
                          : '–';
                      const ptsColorClass = pt.isXp
                        ? 'text-cyan-400'
                        : pt.played
                          ? pointColor(pt.points)
                          : 'text-[#525866]';
                      const minutesText = pt.isXp
                        ? 'xP'
                        : pt.played
                          ? `${pt.minutes}'`
                          : "0'";
                      const resultText = pt.isXp
                        ? (pt.isHome === true ? 'Heim' : pt.isHome === false ? 'Ausw.' : 'Progn.')
                        : (pt.score || '–');

                      return (
                        <div
                          key={item.key}
                          title={`${pt.label}${pt.opponent ? ` (${pt.isHome === true ? 'vs.' : pt.isHome === false ? '@' : ''} ${pt.opponent})` : ''}${pt.score ? ` ${pt.score}` : ''} · ${pt.isXp ? `${pt.points} xP` : pt.played ? `${pt.points} Pkt (${pt.minutes}')` : 'nicht eingesetzt'}`}
                          className={`w-[46px] shrink-0 flex flex-col items-center rounded-xl py-1.5 transition-colors ${
                            pt.isXp ? 'bg-cyan-500/[0.07]' : 'hover:bg-white/[0.03]'
                          }`}
                        >
                          {/* 1. Spieltag */}
                          <div className={`text-[10px] font-bold tabular-nums leading-none ${pt.isXp ? 'text-cyan-400' : 'text-[#8b92a5]'}`}>
                            ST {pt.day}
                          </div>

                          {/* 2. Gegner-Logo */}
                          <div className="w-5 h-5 mt-1.5 flex items-center justify-center shrink-0">
                            {pt.oppLogo ? (
                              <img
                                src={pt.oppLogo}
                                alt={pt.opponent || ''}
                                loading="lazy"
                                decoding="async"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                className="w-5 h-5 object-contain"
                              />
                            ) : pt.opponent ? (
                              <span className="text-[8px] font-black text-[#626978] uppercase">
                                {pt.opponent.slice(0, 3)}
                              </span>
                            ) : (
                              <span className="text-[9px] text-[#4b5563]">–</span>
                            )}
                          </div>

                          {/* 3. Ergebnis */}
                          <div className={`text-[9px] font-semibold tabular-nums leading-none mt-1 ${pt.isXp ? 'text-cyan-300/80' : 'text-[#626978]'}`}>
                            {resultText}
                          </div>

                          {/* 4. Einheitlicher Balken (0..700, 100=Mitte, 400+=Gold, Minus=rot nach oben) */}
                          <div
                            className="w-full flex flex-col justify-end items-center mt-2 relative"
                            style={{ height: `${barZonePx}px` }}
                          >
                            {/* Dezente 400-Pkt Gold-Grenze & 100-Pkt Mittellinie */}
                            <div
                              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-yellow-400/20"
                              style={{ bottom: `${line400BottomPx}px` }}
                            />
                            <div
                              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/[0.08]"
                              style={{ bottom: `${line100BottomPx}px` }}
                            />

                            <div
                              className={`relative z-10 ${hasBarValue ? (isOctagonUI ? 'w-[20px]' : 'w-[20px] rounded-t-[5px] rounded-b-[2px]') : 'w-[14px] rounded-full oct-pill mb-[1px]'}`}
                              style={
                                hasBarValue && isOctagonUI
                                  ? {
                                      ...barStyle,
                                      clipPath: 'polygon(0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 0 100%)',
                                    }
                                  : barStyle
                              }
                            />

                            {/* Feste 0-Grundlinie */}
                            <div className="w-full h-[1px] bg-white/15 shrink-0" />
                          </div>

                          {/* 5. Punkte als Zahl */}
                          <div className={`text-[12px] font-extrabold tabular-nums leading-none mt-2 ${ptsColorClass}`}>
                            {ptsText}
                          </div>

                          {/* 6. Minuten gespielt */}
                          <div className={`text-[9px] font-semibold tabular-nums leading-none mt-1 ${pt.isXp ? 'text-cyan-400/80 uppercase' : 'text-[#626978]'}`}>
                            {minutesText}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {showNextXp && typeof effectiveXpNext === 'number' && (effectiveNextMd != null || upcomingEntry?.day != null) && (
                  <div className="px-4 sm:px-6 mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-[#8b92a5]">
                      Prognose ST {upcomingEntry?.day ?? effectiveNextMd}
                      {(upcomingEntry?.opponent || effectiveNextOpp)
                        ? ` (${(upcomingEntry?.isHome ?? effectiveIsHome) ? 'vs.' : '@'} ${upcomingEntry?.opponent || effectiveNextOpp})`
                        : ''}
                    </span>
                    <span className="font-bold text-cyan-400 tabular-nums">
                      {effectiveXpNext} xP
                      {typeof effectiveMatchup === 'number' && Math.abs(effectiveMatchup - 1) >= 0.02 && (
                        <span className={`ml-1.5 text-[10px] ${effectiveMatchup > 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                          ({effectiveMatchup > 1 ? '+' : ''}{Math.round((effectiveMatchup - 1) * 100)}% Matchup)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Trading-Historie (nur eigener Markt / eigene Liga) */}
          {(() => {
            const ownMarketTransfers = userLeague
              ? playerTransfers.filter((t) => t._league === userLeague)
              : playerTransfers;

            if (ownMarketTransfers.length === 0 && !userLeague) return null;

            const hasDirectDeals = ownMarketTransfers.some((t) => t.buyerName && t.sellerName);
            const filteredTransfers = onlyDirectDeals
              ? ownMarketTransfers.filter((t) => Boolean(t.buyerName && t.sellerName))
              : ownMarketTransfers;
            const visibleTransfers = showAllTransfers ? filteredTransfers : filteredTransfers.slice(0, 8);
            const ownLgColor = userLeague ? (TRANSFER_LEAGUE_COLORS[userLeague] || '#8b92a5') : null;

            return (
              <div className="px-4 sm:px-6 mb-8">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">Trading-Historie</h3>
                    {userLeague && (
                      <span
                        className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                        style={{
                          color: ownLgColor,
                          borderColor: `${ownLgColor}55`,
                          backgroundColor: `${ownLgColor}18`,
                        }}
                      >
                        {userLeague}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#8b92a5] tabular-nums shrink-0">
                    {filteredTransfers.length} {filteredTransfers.length === 1 ? 'Transfer' : 'Transfers'}
                  </span>
                </div>

                {hasDirectDeals && (
                  <div className="flex items-center gap-1.5 pb-1 mb-2.5">
                    <button
                      type="button"
                      onClick={() => setOnlyDirectDeals(false)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                        !onlyDirectDeals
                          ? 'bg-white text-black border-white'
                          : 'bg-white/[0.04] text-[#8b92a5] border-white/10 hover:text-white'
                      }`}
                    >
                      Alle
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnlyDirectDeals(true)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                        onlyDirectDeals
                          ? 'bg-purple-500 text-white border-purple-400'
                          : 'bg-white/[0.04] text-purple-300 border-purple-400/25 hover:text-white'
                      }`}
                    >
                      Manager-Deals
                    </button>
                  </div>
                )}

                {visibleTransfers.length === 0 ? (
                  <div className="card-surface rounded-xl px-4 py-4 text-center text-xs text-[#8b92a5]">
                    Noch keine Transfers in {userLeague || 'deiner Liga'} in dieser Saison.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {visibleTransfers.map((tr) => {
                      const isDirect = Boolean(tr.buyerName && tr.sellerName);
                      const fromLabel = tr.sellerName || 'Markt';
                      const toLabel = tr.buyerName || 'Markt';
                      const mvAt = typeof tr.marketValueAtTimeOfTransfer === 'number' ? tr.marketValueAtTimeOfTransfer : null;
                      const diff = mvAt && typeof tr.price === 'number' ? tr.price - mvAt : null;
                      const diffPct = mvAt && mvAt > 0 && diff != null ? (diff / mvAt) * 100 : null;

                      return (
                        <div
                          key={tr.id || `${tr.date}-${fromLabel}-${toLabel}-${tr.price}`}
                          className={`card-surface rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 ${
                            isDirect ? 'border-purple-500/35' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-white min-w-0">
                              <span className={`truncate ${tr.sellerName ? 'text-gray-200' : 'text-[#8b92a5]'}`}>
                                {fromLabel}
                              </span>
                              <ArrowRight size={11} className={`shrink-0 ${isDirect ? 'text-purple-400' : 'text-[#626978]'}`} />
                              <span className={`truncate ${tr.buyerName ? 'text-white' : 'text-[#8b92a5]'}`}>
                                {toLabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[#8b92a5] tabular-nums">
                              <span>{formatTransferDate(tr.date)}</span>
                              {!userLeague && tr._league && (
                                <>
                                  <span>·</span>
                                  <span className="font-bold" style={{ color: TRANSFER_LEAGUE_COLORS[tr._league] || '#8b92a5' }}>
                                    {tr._league}
                                  </span>
                                </>
                              )}
                              {isDirect && (
                                <>
                                  <span>·</span>
                                  <span className="font-bold text-purple-300">Direktdeal</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-xs sm:text-sm font-bold text-white tabular-nums leading-none">
                              {formatCompactMoney(tr.price)}
                            </div>
                            {diff != null && Math.abs(diff) >= 5000 && (
                              <div className={`text-[10px] font-semibold tabular-nums mt-1 leading-none ${diff > 0 ? 'text-amber-400/90' : 'text-emerald-400/90'}`}>
                                {formatSignedCompactMoney(diff)} {diffPct != null ? `(${diffPct > 0 ? '+' : ''}${Math.round(diffPct)}%)` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredTransfers.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTransfers((v) => !v)}
                    className="mt-2.5 w-full py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] font-bold text-gray-300 transition-colors cursor-pointer"
                  >
                    {showAllTransfers ? 'Weniger anzeigen' : `Alle ${filteredTransfers.length} Transfers anzeigen`}
                  </button>
                )}
              </div>
            );
          })()}

          {/* Key Statistics Grid (Scalable Style) */}
          <div className="px-4 sm:px-6">
            <h3 className="text-lg font-semibold text-white mb-4">Kennzahlen</h3>
            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-medium mb-1">Erwartete Punkte (xP)</span>
                <span className="text-cyan-400 font-bold">
                  {typeof player.xpSeason === 'number' ? `${player.xpSeason} xP` : '–'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-medium mb-1">
                  {player.nextOpponent ? `Nächster ST (${player.isHome ? 'vs.' : '@'} ${player.nextOpponent})` : 'Nächster Spieltag (xP)'}
                </span>
                <span className="text-white font-semibold">
                  {typeof player.xpNext === 'number' ? (
                    <>
                      {player.xpNext} xP
                      {typeof player.xpMatchupFactor === 'number' && Math.abs(player.xpMatchupFactor - 1) >= 0.02 && (
                        <span className={`ml-1.5 text-xs ${player.xpMatchupFactor > 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                          ({player.xpMatchupFactor > 1 ? '+' : ''}{Math.round((player.xpMatchupFactor - 1) * 100)}%)
                        </span>
                      )}
                    </>
                  ) : '–'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-medium mb-1">Max-Gebot</span>
                <span className="text-white font-semibold">{player.maxBid > 0 && player.onMarket ? formatMoney(player.maxBid) : '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-medium mb-1">Ø Punkte (bisher)</span>
                <span className="text-white font-semibold">{player.avgPoints ?? '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-medium mb-1">Saisonpunkte</span>
                <span className="text-white font-semibold">{player.seasonPoints ?? '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-medium mb-1">Einsätze</span>
                <span className="text-white font-semibold">{player.officialSeasonAppearances ?? player.appearances ?? '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-medium mb-1">Gesamtminuten</span>
                <span className="text-white font-semibold">{player.totalMinutes ? `${player.totalMinutes}'` : '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-medium mb-1">Tore / Vorlagen</span>
                <span className="text-white font-semibold">
                  {typeof player.officialGoals === 'number' ? player.officialGoals : '–'} / {typeof player.officialAssists === 'number' ? player.officialAssists : '–'}
                </span>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};

const Advisor = () => {
  const { isAdmin, profile } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const goBack = useBackNavigation('/account');
  const [data, setData] = useState(null);
  const [ratingsMap, setRatingsMap] = useState(null);
  const [error, setError] = useState(false);
  const [activeLeague, setActiveLeague] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const autoOpenedPlayerRef = useRef(null);
  const [marketFilters, setMarketFilters] = useState(DEFAULT_MARKET_FILTERS);
  const [dbFilters, setDbFilters] = useState({ ...DEFAULT_FILTERS, sort: 'xpDesc' });
  const [squadFilters, setSquadFilters] = useState({ ...DEFAULT_FILTERS, sort: 'xpDesc' });
  const [selectedManagerId, setSelectedManagerId] = useState('');
  // Kader-Tab zeigt standardmaessig IMMER den eigenen Account (siehe
  // profile.kickbaseId unten) - der Manager-Wechsler ist nur noch eine
  // eingeklappte Test-/Debug-Option fuer Admins, kein prominentes UI-Element mehr.
  const [showManagerSwitcher, setShowManagerSwitcher] = useState(false);
  const [dbVisibleCount, setDbVisibleCount] = useState(DB_PAGE_SIZE);
  const [isAdvisorUpdating, setIsAdvisorUpdating] = useState(false);
  const [advisorUpdateStatus, setAdvisorUpdateStatus] = useState(null);
  const [advisorUpdateStatusOk, setAdvisorUpdateStatusOk] = useState(true);
  const [sectionTab, setSectionTab] = useState('market');
  const [showInfo, setShowInfo] = useState(false);

  const [catalogBundle, setCatalogBundle] = useState(null);
  const allPlayersRaw = useMemo(() => catalogBundle?.allPlayersRaw || [], [catalogBundle]);
  const catalogMap = useMemo(() => catalogBundle?.catalogMap || new Map(), [catalogBundle]);
  const xpMap = useMemo(() => catalogBundle?.xpMap || new Map(), [catalogBundle]);

  // Vereinslogos auslesen (players-lite.json + Advisor-Tabelle)
  const teamLogos = useMemo(() => {
    const logos = { ...(catalogBundle?.teamLogos || {}) };
    const teamsData = data?.leagues ? Object.values(data.leagues)[0]?.teams || [] : [];
    teamsData.forEach((t) => {
      if (t.tn && !logos[t.tn]) {
        const svgKey = Object.keys(t).find((k) => typeof t[k] === 'string' && t[k].endsWith('.svg'));
        if (svgKey) {
          logos[t.tn] = `https://kickbase.b-cdn.net/${t[svgKey]}`;
        }
      }
    });
    return logos;
  }, [data, catalogBundle]);

  const loadData = () => {
    loadPlayerCatalogBundle()
      .then((bundle) => { if (bundle) setCatalogBundle(bundle); })
      .catch(() => {});

    fetch('/history/manager-ratings.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (json && typeof json === 'object') setRatingsMap(json); })
      .catch(() => {});

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
      // Bewusst per Authorization-Header statt Query-Parameter (siehe AdminPanel.jsx) -
      // sonst landet das Passwort im Klartext im Browser-Netzwerk-Tab und in
      // Vercels HTTP-Zugriffslogs.
      const res = await fetch('/api/advisor-cron', {
        headers: { Authorization: `Bearer ${password}` }
      });
      if (res.ok) {
        setAdvisorUpdateStatusOk(true);
        setAdvisorUpdateStatus("Angestoßen! Läuft ca. 2-5 Minuten im Hintergrund.");
        setTimeout(() => setAdvisorUpdateStatus(null), 6000);
      } else {
        const errData = await res.json();
        setAdvisorUpdateStatusOk(false);
        setAdvisorUpdateStatus(`Fehler: ${errData.error || "Unbefugt"}`);
        setTimeout(() => setAdvisorUpdateStatus(null), 6000);
      }
    } catch {
      setAdvisorUpdateStatusOk(false);
      setAdvisorUpdateStatus("Netzwerkfehler beim Update-Aufruf.");
      setTimeout(() => setAdvisorUpdateStatus(null), 6000);
    } finally {
      setIsAdvisorUpdating(false);
    }
  };

  const league = data?.leagues?.[activeLeague];
  const generatedAt = data?.generatedAt ? new Date(data.generatedAt) : null;

  // Vollstaendige Spieler-Datenbank inkl. neuem Spieler-xP (xpSeason & xpNext)
  const completePlayers = useMemo(
    () => buildCompletePlayerCatalog(data?.players || [], allPlayersRaw, catalogMap, xpMap),
    [data, allPlayersRaw, catalogMap, xpMap]
  );

  // Saubere Bilanz-Budgets (Startkapital + Gesamtgewinn + Punktepraemien - Teamwert)
  const cleanBudgets = useMemo(
    () => computeCleanLeagueBudgets(league, ratingsMap),
    [league, ratingsMap]
  );

  const effectiveManagerSquads = useMemo(() => {
    let rawSquads = {};
    if (league?.managerSquads && Object.keys(league.managerSquads).length) {
      rawSquads = league.managerSquads;
    } else if (league?.squadRecommendations?.length) {
      rawSquads = { OWN: league.squadRecommendations };
    }
    const enriched = {};
    for (const [mid, squad] of Object.entries(rawSquads)) {
      enriched[mid] = (squad || []).map((p) => enrichPlayerWithCatalog(p, catalogMap, xpMap));
    }
    return enriched;
  }, [league, catalogMap, xpMap]);

  const resolvedManagers = useMemo(() => {
    if (league?.managers?.length) return league.managers;
    const squadIds = Object.keys(effectiveManagerSquads);
    if (!squadIds.length) return [];
    return squadIds.map((id) => ({ id, name: id === 'OWN' ? 'Eigener Account' : `Manager ${id}` }));
  }, [effectiveManagerSquads, league]);

  const playerManagerMap = useMemo(() => {
    const map = {};
    if (!effectiveManagerSquads || !resolvedManagers) return map;

    const managerNames = {};
    resolvedManagers.forEach((m) => { managerNames[m.id] = m.name; });

    for (const [managerId, squad] of Object.entries(effectiveManagerSquads)) {
      const managerName = managerNames[managerId] || `Manager ${managerId}`;
      squad.forEach((p) => {
        map[p.playerId] = managerName;
      });
    }
    return map;
  }, [effectiveManagerSquads, resolvedManagers]);

  // Eigener Kader + xP-basierte Startelf-Rekonstruktion + smarte Kader-Bewertung
  const currentSquadRaw = useMemo(
    () => effectiveManagerSquads[selectedManagerId] || [],
    [effectiveManagerSquads, selectedManagerId]
  );
  const ownSquadAnalysis = useMemo(() => analyzeOwnSquad(currentSquadRaw), [currentSquadRaw]);
  const currentSquad = useMemo(
    () => currentSquadRaw.map((p) => evaluateOwnSquadMember(p, ownSquadAnalysis)),
    [currentSquadRaw, ownSquadAnalysis]
  );

  const marketPlayersAnnotated = useMemo(
    () => (league?.marketRecommendations || []).map((raw) => {
      const enriched = enrichPlayerWithCatalog(raw, catalogMap, xpMap);
      const squadEval = evaluatePlayerForSquad(enriched, ownSquadAnalysis);
      return {
        ...enriched,
        ownedByAccount: Boolean(playerManagerMap[enriched.playerId]),
        squadEval,
        buyRecommended: squadEval.isBuyRecommended,
        playRecommended: squadEval.isPlayFit,
        tradeRecommended: squadEval.isTradeOnly,
      };
    }),
    [league, catalogMap, xpMap, playerManagerMap, ownSquadAnalysis]
  );
  const marketTeams = useMemo(
    () => [...new Set(marketPlayersAnnotated.map((p) => p.team).filter(Boolean))].sort(),
    [marketPlayersAnnotated]
  );
  const filteredMarket = useMemo(
    () => applyFilters(marketPlayersAnnotated, marketFilters, 'buy'),
    [marketPlayersAnnotated, marketFilters]
  );

  const dbTeams = useMemo(
    () => [...new Set(completePlayers.map((p) => p.team).filter(Boolean))].sort(),
    [completePlayers]
  );

  // Nur die "Alle Spieler"-Datenbank enthaelt Spieler unabhaengig von Markt-/
  // Kaderstatus - hier um Markt-, Besitzer- und eigene Kader-Bewertung ergaenzt.
  const marketPlayerIds = useMemo(
    () => new Set(marketPlayersAnnotated.map((p) => String(p.playerId))),
    [marketPlayersAnnotated]
  );
  const dbPlayersAnnotated = useMemo(
    () => completePlayers.map((p) => {
      const onMarket = marketPlayerIds.has(String(p.playerId));
      const squadEval = evaluatePlayerForSquad({ ...p, onMarket }, ownSquadAnalysis);
      return {
        ...p,
        onMarket,
        ownedByAccount: Boolean(playerManagerMap[p.playerId]),
        squadEval,
        buyRecommended: squadEval.isBuyRecommended,
        playRecommended: squadEval.isPlayFit,
        tradeRecommended: squadEval.isTradeOnly,
      };
    }),
    [completePlayers, marketPlayerIds, playerManagerMap, ownSquadAnalysis]
  );
  const filteredDb = useMemo(() => applyFilters(dbPlayersAnnotated, dbFilters, 'buy'), [dbPlayersAnnotated, dbFilters]);

  const filteredSquad = useMemo(
    () => applyFilters(currentSquad, squadFilters, 'sell'),
    [currentSquad, squadFilters]
  );

  // Saubere Bilanz-Budget-Schaetzung fuer den ausgewaehlten Manager:
  // - rawBudget: Konto-Prognose zum Spieltag (Ziel >= 0 EUR bis Spieltagsanfang!)
  // - midweekBuyingPower: max. Gebotsspielraum unter der Woche inkl. 33%-Dispo
  const selectedManagerBudget = cleanBudgets.budgetsById[selectedManagerId] || league?.managerBudgets?.[selectedManagerId] || null;
  const rawBudget = selectedManagerBudget?.budget ?? 0;
  const midweekBuyingPower = selectedManagerBudget?.midweekBuyingPower ?? rawBudget;

  // Kader-Vollstaendigkeit: reicht das Budget noch fuer eine volle Elf?
  const squadPositionCounts = useMemo(() => countPositions(currentSquad), [currentSquad]);
  const squadMissing = useMemo(() => missingPositions(squadPositionCounts), [squadPositionCounts]);
  const squadReserveInfo = useMemo(
    () => estimateReserveForMissingPositions(squadMissing, completePlayers),
    [squadMissing, completePlayers]
  );
  const netBudgetAfterReserve = rawBudget - squadReserveInfo.reserve;

  // Bei negativem Spieltags-Budget: schmerzaermste Verkaeufe bis >= 0 EUR vorschlagen
  const deficitClearSales = useMemo(
    () => (rawBudget < 0 ? suggestSalesToClearDeficit(currentSquad, Math.abs(rawBudget), ownSquadAnalysis) : []),
    [currentSquad, rawBudget, ownSquadAnalysis]
  );

  // Priorisiert echte Startelf-Upgrades nach +xP-Gewinn, dann Kader-Ergaenzungen, dann Trading
  const rankBuyCandidates = (list) => {
    const tierScore = (p) => (p.squadEval?.tier === 'startelf' ? 3 : p.squadEval?.tier === 'kader' ? 2 : 1);
    return [...list].sort((a, b) => {
      const td = tierScore(b) - tierScore(a);
      if (td !== 0) return td;
      const xd = (b.squadEval?.xpDelta || 0) - (a.squadEval?.xpDelta || 0);
      if (xd !== 0) return xd;
      return getEffectiveXp(b) - getEffectiveXp(a) || (b.predictedChange || 0) - (a.predictedChange || 0);
    });
  };

  const affordableBuyRecommendations = useMemo(() => {
    if (!selectedManagerBudget || !marketPlayersAnnotated.length || netBudgetAfterReserve <= 0) return [];
    const eligible = marketPlayersAnnotated.filter(
      (p) => p.buyRecommended && !p.ownedByAccount && (p.marketValue || 0) <= netBudgetAfterReserve
    );
    return rankBuyCandidates(eligible).slice(0, 5);
  }, [selectedManagerBudget, marketPlayersAnnotated, netBudgetAfterReserve]);

  // Zusaetzliche Top-Upgrades, die unter der Woche per 33%-Dispo erreichbar waeren
  // (erfordern vor Spieltagsanfang einen entsprechenden Verkauf zum Ausgleich).
  const dispoUpgradeRecommendations = useMemo(() => {
    if (!selectedManagerBudget || !marketPlayersAnnotated.length) return [];
    const safeIds = new Set(affordableBuyRecommendations.map((p) => p.playerId));
    const maxMidweek = Math.max(0, midweekBuyingPower - squadReserveInfo.reserve);
    const eligible = marketPlayersAnnotated.filter(
      (p) =>
        p.squadEval?.tier === 'startelf' &&
        !p.ownedByAccount &&
        !safeIds.has(p.playerId) &&
        (p.marketValue || 0) > Math.max(0, netBudgetAfterReserve) &&
        (p.marketValue || 0) <= maxMidweek
    );
    return rankBuyCandidates(eligible).slice(0, 3);
  }, [selectedManagerBudget, marketPlayersAnnotated, affordableBuyRecommendations, midweekBuyingPower, netBudgetAfterReserve, squadReserveInfo.reserve]);

  // "Verkaufe X, dann kannst du dir auch noch Y leisten"
  const sellUnlockOpportunities = useMemo(() => {
    if (!marketPlayersAnnotated.length) return [];
    const alreadyAffordableIds = new Set(affordableBuyRecommendations.map((p) => p.playerId));
    const sellCandidates = currentSquad.filter((p) => p.sellRecommended);

    return sellCandidates
      .map((sellPlayer) => {
        const budgetAfterSale = netBudgetAfterReserve + (sellPlayer.marketValue || 0);
        const unlocked = rankBuyCandidates(
          marketPlayersAnnotated.filter(
            (p) =>
              p.buyRecommended &&
              !p.ownedByAccount &&
              !alreadyAffordableIds.has(p.playerId) &&
              (p.marketValue || 0) <= budgetAfterSale
          )
        ).slice(0, 3);
        return { sellPlayer, budgetAfterSale, unlocked };
      })
      .filter((entry) => entry.unlocked.length > 0);
  }, [currentSquad, marketPlayersAnnotated, netBudgetAfterReserve, affordableBuyRecommendations]);

  // Wenn sich die aktive Liga aendert (oder Daten neu laden): der eigene
  // Account (per profile.kickbaseId verknuepft) hat immer Vorrang, damit der
  // Kader-Tab standardmaessig den eigenen Kader zeigt. Nur falls kein eigener
  // Kader gefunden wird (z.B. noch nicht verknuepft), faellt es auf den
  // ersten verfuegbaren Manager zurueck.
  useEffect(() => {
    const managerIds = Object.keys(effectiveManagerSquads);
    if (!managerIds.length) {
      if (selectedManagerId) setSelectedManagerId('');
      return;
    }
    if (profile?.kickbaseId && managerIds.includes(profile.kickbaseId)) {
      if (selectedManagerId !== profile.kickbaseId) setSelectedManagerId(profile.kickbaseId);
      return;
    }
    if (!managerIds.includes(selectedManagerId)) {
      setSelectedManagerId(managerIds[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveManagerSquads, profile?.kickbaseId]);

  // Direkt-Sprung zu einem bestimmten Spieler (z.B. per Klick auf Foto/Name in
  // PlayerLiveDetailPage -> /admin/advisor?playerId=17288): sucht zuerst im
  // Markt/eigenen Kader (reichste Kontextdaten) und dann in der vollstaendigen
  // Datenbank (inkl. all_players.json-Fallback).
  const requestedPlayerId = searchParams.get('playerId') || location.state?.openPlayerId || null;
  useEffect(() => {
    if (!requestedPlayerId || !data) return;
    const targetId = String(requestedPlayerId);
    if (autoOpenedPlayerRef.current === targetId) return;

    const found =
      marketPlayersAnnotated.find((p) => String(p.playerId) === targetId) ||
      currentSquad.find((p) => String(p.playerId) === targetId) ||
      dbPlayersAnnotated.find((p) => String(p.playerId) === targetId);

    if (found) {
      autoOpenedPlayerRef.current = targetId;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPlayer(found);
    }
  }, [requestedPlayerId, data, marketPlayersAnnotated, currentSquad, dbPlayersAnnotated]);

  const returnOnClose = Boolean(location.state?.returnOnClose);
  const handleClosePlayerDetail = () => {
    if (returnOnClose) {
      goBack();
      return;
    }
    setSelectedPlayer(null);
    if (searchParams.has('playerId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('playerId');
      setSearchParams(next, { replace: true });
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
        <div className="text-center card-surface rounded-2xl p-8">
          <h1 className="text-lg font-black text-white uppercase mb-3">Kein Zugriff</h1>
          <p className="text-sm text-[#8b92a5] mb-6">Diese Seite ist nur für Admins.</p>
          <Link to="/" className="text-[#ff5c3e] text-sm font-bold uppercase tracking-widest">Zurück zum Ligasystem</Link>
        </div>
      </div>
    );
  }

  if (selectedPlayer) {
    return (
      <div className="bg-[#000000] min-h-screen">
        <PlayerDetailView
          player={selectedPlayer}
          teamLogos={teamLogos}
          onClose={handleClosePlayerDetail}
          leagueKey={activeLeague}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <img src={advisorLogo} alt="Trading Advisor Logo" className="w-12 h-12 sm:w-14 sm:h-14 object-contain shrink-0" />
            <PageHeader eyebrow="ADMIN" accentColor="#22d3ee" title="Trading Advisor" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowInfo((v) => !v)}
              aria-label="Info"
              className={`oct-md w-10 h-10 flex items-center justify-center rounded-xl border transition-all ${showInfo ? 'bg-cyan-500/20 border-cyan-500 oct-bd-cyan text-cyan-400' : 'bg-[#171717] border-[#2e2e2e] text-[#8b92a5] hover:text-white hover:border-[#404040]'}`}
            >
              <Info size={18} strokeWidth={2.5} />
            </button>
            <button
              onClick={handleAdvisorUpdate}
              disabled={isAdvisorUpdating}
              aria-label="Trading Advisor aktualisieren"
              title="Trading Advisor aktualisieren"
              className="oct-md oct-bd-cyan w-10 h-10 flex items-center justify-center rounded-xl bg-[#171717] border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500 transition-all disabled:opacity-50"
            >
              <RefreshCw size={16} strokeWidth={2.5} className={isAdvisorUpdating ? 'animate-spin' : ''} />
            </button>
            <CloseButton onClick={goBack} />
          </div>
        </div>

        {advisorUpdateStatus && (
          <p className={`flex items-center gap-1.5 text-xs mb-4 ${advisorUpdateStatus.includes('...') ? 'text-cyan-400' : advisorUpdateStatusOk ? 'text-green-400' : 'text-red-400'}`}>
            {!advisorUpdateStatus.includes('...') && (advisorUpdateStatusOk ? <CheckCircle2 size={13} /> : <XCircle size={13} />)}
            {advisorUpdateStatus}
          </p>
        )}

        {showInfo && (
          <div className="card-surface rounded-xl p-4 text-xs text-[#8b92a5] mb-6">
            <p>
              Budget-Schätzungen & Marktwert-Prognosen, basierend auf dem Open-Source-Tool{' '}
              <a href="https://github.com/LennardFe/Kickbase-Trading-Advisor" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Kickbase-Trading-Advisor</a>{' '}
              von LennardFe. Läuft täglich automatisch, alle Werte sind Schätzungen ohne Gewähr.
            </p>
            {data && (
              <div className="flex flex-wrap gap-3 mt-4">
                <StatTile
                  label="Zuletzt aktualisiert"
                  value={generatedAt ? generatedAt.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–'}
                  valueColor="#8b92a5"
                />
                {data.modelStats && (
                  <>
                    <StatTile label="Richtungstreffer" value={`${data.modelStats.signsCorrectPercent}%`} valueColor="#22d3ee" />
                    <StatTile label="Trainingsdaten" value={data.modelStats.trainSamples} valueColor="#8b92a5" />
                  </>
                )}
              </div>
            )}
            <StartProbLegend className="mt-4" />
          </div>
        )}

        {error && (
          <div className="card-surface rounded-2xl p-6 text-center text-sm text-[#8b92a5] mb-6">
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
                  className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 flex items-center gap-1.5 ${sectionTab === t.key ? 'text-white border-cyan-400' : 'text-[#8b92a5] border-transparent hover:text-gray-300'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {league && sectionTab === 'budgets' && (
              <>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-white">Manager-Budgets (Bilanz-Schätzung)</h2>
                  <p className="text-[11px] text-[#8b92a5] mt-1">
                    Finanzkraft aus 150 Mio. € Startbudget + Gesamtgewinn + Punkteprämien &amp; Boni; davon abgezogen der aktuelle Kaderwert. Unter der Woche ist ein Minus bis ~33 % erlaubt, vor Spieltagsanfang muss das Konto ≥ 0 € sein.
                  </p>
                </div>
                {cleanBudgets.budgetsList.length ? (
                  <div className="mb-10">
                    {cleanBudgets.budgetsList.map((entry, index) => (
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
                  <h2 className="text-lg font-semibold text-white">Markt-Empfehlungen</h2>
                  <span className="text-[10px] text-[#8b92a5]">{filteredMarket.length} von {league.marketRecommendations?.length || 0} Spielern</span>
                </div>
                {league.marketRecommendations?.length ? (
                  <>
                    <FilterBar filters={marketFilters} onChange={setMarketFilters} teams={marketTeams} showTeamFilter showExpirySort defaultSort={DEFAULT_MARKET_FILTERS.sort} recommendationMode="buy" />
                    {filteredMarket.length ? (
                      <div className="mb-10">
                        {filteredMarket.map((entry, index) => (
                          <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} ownerName={playerManagerMap[entry.playerId]} teamLogo={teamLogos[entry.team]} onClick={() => setSelectedPlayer(entry)} />
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

            {/* Kader-Empfehlungen: standardmaessig IMMER der eigene Account
                (per profile.kickbaseId verknuepft, siehe Auto-Auswahl-Effekt
                oben). Das Durchschalten anderer Manager (fuer JEDEN Manager
                der Liga verfuegbar, siehe
                backend/advisor/run_advisor.py::build_manager_squads_payload)
                bleibt als eingeklappte Test-/Debug-Option fuer Admins
                erhalten. Immer sichtbar (auch mit alten/unvollstaendigen
                Daten, siehe effectiveManagerSquads/resolvedManagers oben),
                zeigt sonst einen klaren Hinweis statt einfach zu verschwinden. */}
            {league && sectionTab === 'squad' && (
              <>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Kader-Empfehlungen</h2>
                    <p className="text-[10px] text-[#8b92a5] mt-1">
                      {profile?.kickbaseId && selectedManagerId === profile.kickbaseId ? 'Dein Kader mit Kauf-/Verkaufsempfehlungen.' : 'Personalisiert pro Manager.'}
                    </p>
                  </div>
                  {resolvedManagers.length > 0 && (
                    <span className="text-[10px] text-[#8b92a5]">{filteredSquad.length} von {(effectiveManagerSquads[selectedManagerId] || []).length} Spielern</span>
                  )}
                </div>
                {resolvedManagers.length > 0 ? (
                  <>
                    <button
                      onClick={() => setShowManagerSwitcher((v) => !v)}
                      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors mb-3"
                    >
                      <ChevronDown size={12} className={`transition-transform ${showManagerSwitcher ? 'rotate-180' : ''}`} />
                      Testweise anderen Manager anzeigen
                    </button>
                    {showManagerSwitcher && (
                      <select
                        value={selectedManagerId}
                        onChange={(e) => setSelectedManagerId(e.target.value)}
                        className="w-full bg-[#171717] border border-[#2e2e2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500 mb-4"
                      >
                        {resolvedManagers.map((m) => (
                          <option key={m.id} value={m.id} disabled={!effectiveManagerSquads[m.id]?.length}>
                            {m.name}{!effectiveManagerSquads[m.id]?.length ? ' (kein Kader gefunden)' : ''}{m.id === profile?.kickbaseId ? ' (Du)' : ''}
                          </option>
                        ))}
                      </select>
                    )}

                    {selectedManagerBudget && (
                      <div className="bg-[#000] border border-[#2e2e2e] rounded-xl p-4 mb-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-[#8b92a5] mb-1">
                              {rawBudget < 0 ? 'Konto (Bis Spieltag auszugleichen)' : 'Konto-Prognose (Spieltags-Ziel ≥ 0 €)'}
                            </div>
                            <div className={`text-lg font-black tabular-nums ${rawBudget < 0 ? 'text-red-400' : 'text-white'}`}>
                              {formatMoney(rawBudget)}
                            </div>
                            <div className="text-[10px] text-[#8b92a5] mt-1">
                              Gebots-Spielraum unter der Woche (33%-Dispo):{' '}
                              <span className="text-gray-200 font-semibold">{formatCompactMoney(Math.max(0, midweekBuyingPower))}</span>
                            </div>
                          </div>

                          {ownSquadAnalysis && (
                            <div className="sm:border-l sm:border-[#2e2e2e] sm:pl-4">
                              <div className="text-[9px] font-black uppercase tracking-widest text-[#8b92a5] mb-1">
                                Beste Startelf ({ownSquadAnalysis.starterCount}/11 · xP)
                              </div>
                              <div className="text-lg font-black text-cyan-400 tabular-nums">
                                {ownSquadAnalysis.bestLineupXp.toLocaleString('de-DE')} xP
                              </div>
                              <div className="text-[10px] text-[#8b92a5] mt-1">
                                Nächster ST (Matchups):{' '}
                                <span className="text-gray-200 font-semibold">{ownSquadAnalysis.bestLineupNextXp.toLocaleString('de-DE')} xP</span>
                                {ownSquadAnalysis.weakestPos && (
                                  <span> · Fokus: <span className="text-amber-400 font-semibold">{POSITION_LABELS[ownSquadAnalysis.weakestPos] || ownSquadAnalysis.weakestPos}</span></span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {rawBudget < 0 && (
                          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
                            <div className="flex items-start gap-2">
                              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                              <div className="text-[10px] text-red-200 leading-relaxed">
                                Geschätzt <span className="font-bold text-white">{formatMoney(Math.abs(rawBudget))}</span> im Minus – muss bis Spieltagsanfang ausgeglichen sein, um Punkte zu erhalten.
                              </div>
                            </div>
                            {deficitClearSales.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-red-500/20">
                                <div className="text-[9px] font-black uppercase tracking-widest text-red-300 mb-1.5">
                                  xP-schonendste Ausgleichs-Verkäufe
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {deficitClearSales.map((p) => (
                                    <button
                                      key={p.playerId}
                                      onClick={() => setSelectedPlayer(p)}
                                      className="text-[10px] font-semibold bg-black/40 hover:bg-black/70 text-gray-100 border border-red-500/30 rounded px-2 py-1 transition-colors"
                                    >
                                      {p.name} ({formatCompactMoney(p.marketValue)} · {getEffectiveXp(p)} xP)
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {Object.keys(squadMissing).length > 0 && (
                          <div className="flex items-start gap-2 mt-3 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
                            <AlertTriangle size={14} className="text-orange-400 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-orange-300 leading-relaxed">
                              Kader wäre ohne Nachbesetzung nicht startelf-fähig (fehlt: {Object.entries(squadMissing).map(([pos, n]) => `${n}x ${POSITION_LABELS[pos] || pos}`).join(', ')}).
                              {' '}Dafür reserviert: <span className="font-bold text-orange-200">{formatMoney(squadReserveInfo.reserve)}</span> → frei nutzbar: <span className="font-bold text-orange-200">{formatMoney(Math.max(0, netBudgetAfterReserve))}</span>
                            </div>
                          </div>
                        )}

                        <div className="mt-3">
                          {affordableBuyRecommendations.length > 0 ? (
                            <>
                              <div className="text-[9px] font-black uppercase tracking-widest text-green-400 mb-2">Direkt leistbare Top-Empfehlungen (ohne Minus)</div>
                              <div className="space-y-1.5">
                                {affordableBuyRecommendations.map((p, i) => (
                                  <button
                                    key={`${p.playerId}-${i}`}
                                    onClick={() => setSelectedPlayer(p)}
                                    className="w-full flex items-center justify-between text-xs bg-[#171717] hover:bg-[#1f1f1f] border border-[#2e2e2e] rounded-lg px-3 py-2 text-left transition-colors"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-[9px] font-black shrink-0" style={{ color: POSITION_COLORS[p.position] || '#8b92a5' }}>{p.position}</span>
                                      <span className="text-gray-200 font-bold truncate">{p.firstName ? `${p.firstName} ${p.name}` : p.name}</span>
                                      {p.squadEval?.tier === 'startelf' && (
                                        <span className="text-[9px] font-bold bg-green-500/15 text-green-400 border border-green-500/35 rounded px-1.5 py-0.5 shrink-0">
                                          +{p.squadEval.xpDelta} xP
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[#8b92a5] shrink-0 ml-2 tabular-nums">
                                      {getEffectiveXp(p)} xP · {formatCompactMoney(p.marketValue)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-[10px] text-[#8b92a5]">
                              {rawBudget < 0
                                ? 'Ohne vorherigen Verkauf aktuell kein freies Spieltags-Budget.'
                                : 'Aktuell keine passende, direkt leistbare Kaufempfehlung auf dem Markt.'}
                            </div>
                          )}
                        </div>

                        {dispoUpgradeRecommendations.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-[#2e2e2e]">
                            <div className="text-[9px] font-black uppercase tracking-widest text-amber-400 mb-1.5">
                              Per Dispo unter der Woche erreichbare Startelf-Upgrades (Verkauf vor Spieltag nötig)
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {dispoUpgradeRecommendations.map((p) => (
                                <button
                                  key={p.playerId}
                                  onClick={() => setSelectedPlayer(p)}
                                  className="text-[10px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 border border-amber-500/30 rounded px-2 py-1 transition-colors"
                                >
                                  {p.position} {p.name} (+{p.squadEval?.xpDelta} xP · {formatCompactMoney(p.marketValue)})
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {sellUnlockOpportunities.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-[#2e2e2e]">
                            <div className="text-[9px] font-black uppercase tracking-widest text-cyan-400 mb-2">Verkaufen schafft zusätzlichen Spielraum</div>
                            <div className="space-y-2">
                              {sellUnlockOpportunities.map(({ sellPlayer, budgetAfterSale, unlocked }, i) => (
                                <div key={`${sellPlayer.playerId}-${i}`} className="bg-[#171717] border border-[#2e2e2e] rounded-lg px-3 py-2">
                                  <div className="text-[10px] text-gray-300">
                                    Verkaufe <span className="font-bold text-white">{sellPlayer.firstName ? `${sellPlayer.firstName} ${sellPlayer.name}` : sellPlayer.name}</span> ({formatCompactMoney(sellPlayer.marketValue)} · {getEffectiveXp(sellPlayer)} xP) → {formatMoney(budgetAfterSale)} verfügbar
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {unlocked.map((p, j) => (
                                      <button
                                        key={`${p.playerId}-${j}`}
                                        onClick={() => setSelectedPlayer(p)}
                                        className="text-[9px] font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded px-1.5 py-0.5 transition-colors"
                                      >
                                        {p.firstName ? `${p.firstName} ${p.name}` : p.name}{p.squadEval?.xpDelta > 0 ? ` (+${p.squadEval.xpDelta} xP)` : ''}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {selectedManagerId && effectiveManagerSquads[selectedManagerId]?.length > 0 ? (
                      <>
                        <FilterBar filters={squadFilters} onChange={setSquadFilters} teams={[]} recommendationMode="sell" />
                        {filteredSquad.length ? (
                          <div className="mb-10">
                            {filteredSquad.map((entry, index) => (
                              <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} ownerName={playerManagerMap[entry.playerId]} teamLogo={teamLogos[entry.team]} onClick={() => setSelectedPlayer(entry)} />
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
                    <h2 className="text-lg font-semibold text-white">Alle Spieler durchsuchen</h2>
                    <p className="text-[10px] text-[#8b92a5] mt-1">Marktwert-Prognose für die komplette Bundesliga, unabhängig davon, ob gerade jemand verkauft.</p>
                  </div>
                  <span className="text-[10px] text-[#8b92a5]">{filteredDb.length} von {completePlayers.length} Spielern</span>
                </div>
                {completePlayers.length ? (
                  <>
                    <FilterBar filters={dbFilters} onChange={(f) => { setDbFilters(f); setDbVisibleCount(DB_PAGE_SIZE); }} teams={dbTeams} showTeamFilter showAvailabilityFilters recommendationMode="buy" />
                    {filteredDb.length ? (
                      <>
                        <div>
                          {filteredDb.slice(0, dbVisibleCount).map((entry, index) => (
                            <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} ownerName={playerManagerMap[entry.playerId]} teamLogo={teamLogos[entry.team]} onClick={() => setSelectedPlayer(entry)} />
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


      </div>
    </div>
  );
};

export default Advisor;
