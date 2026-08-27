import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Info, RefreshCw, CheckCircle2, XCircle, Star, SlidersHorizontal, X, ChevronDown, AlertTriangle } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import { useFavorites } from './useFavorites';
import PageHeader from './ui/PageHeader';
import CloseButton from './ui/CloseButton';
import StatTile from './ui/StatTile';
import { countPositions, missingPositions, estimateReserveForMissingPositions } from './squadRules';

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
  { key: 'favorites', label: 'Favoriten' },
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

const DEFAULT_FILTERS = { search: '', position: 'ALL', team: 'ALL', sort: 'predictedDesc', risingOnly: false, recommendedOnly: false };

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
  if (filters.risingOnly) {
    result = result.filter((p) => (p.predictedChange || 0) > 0);
  }
  if (filters.recommendedOnly && recommendationMode === 'buy') {
    result = result.filter((p) => p.buyRecommended);
  }
  if (filters.recommendedOnly && recommendationMode === 'sell') {
    result = result.filter((p) => p.sellRecommended);
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

// Kompakte Filterleiste: nur Suche + ein Filter-Icon-Button sind permanent
// sichtbar, alle weiteren Optionen (Position, Team, Sortierung, Toggles)
// stecken in einem Popover - nimmt dadurch deutlich weniger Platz ein als
// vorher (5+ Elemente nebeneinander).
const FilterBar = ({ filters, onChange, teams, showTeamFilter = false, recommendationMode }) => {
  const [open, setOpen] = useState(false);

  const activeCount = [
    filters.position !== 'ALL',
    showTeamFilter && filters.team !== 'ALL',
    filters.sort !== DEFAULT_FILTERS.sort,
    filters.risingOnly,
    recommendationMode && filters.recommendedOnly,
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
              <label className="block text-[9px] font-bold uppercase tracking-widest text-[#626978] mb-1">Sortierung</label>
              <select
                value={filters.sort}
                onChange={(e) => onChange({ ...filters, sort: e.target.value })}
                className="w-full bg-[#000] border border-[#2e2e2e] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              >
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
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const BudgetRow = ({ entry, rank, color }) => (
  <div className="flex items-center p-3 mb-2.5 card-surface rounded-[14px] shadow-sm">
    <div className="w-8 flex justify-center items-center text-xs font-bold text-[#8b92a5] shrink-0">{rank}</div>
    <div className="ml-2 flex-1 min-w-0">
      <div className="text-[15px] font-bold text-gray-100 truncate">{entry.manager}</div>
      <div className="text-[10px] text-[#8b92a5] mt-0.5">Teamwert: {formatMoney(entry.teamValue)}</div>
    </div>
    <div className="text-right ml-2 shrink-0">
      <div className="text-[15px] font-bold" style={{ color }}>{formatMoney(entry.budget)}</div>
      <div className="text-[9px] font-bold text-[#626978] tracking-widest mt-0.5 uppercase">Verfügbares Budget</div>
      {typeof entry.dispoBuffer === 'number' && entry.dispoBuffer > 0 && (
        <div className="text-[10px] text-[#8b92a5] mt-1">Zulässiger Puffer bis Spieltag: {formatMoney(entry.dispoBuffer)}</div>
      )}
    </div>
  </div>
);

const StarIcon = ({ filled }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? '#eab308' : 'none'} stroke={filled ? '#eab308' : '#626978'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

const PlayerCard = ({ entry, teamLogo, ownerName, onClick, isFavorite, onToggleFavorite }) => {
  const rising = (entry.predictedChange || 0) >= 0;
  const hasHistory = Array.isArray(entry.history) && entry.history.length > 1;
  const isBuyContext = entry.onMarket;
  const isSellContext = entry.inSquad;
  const showPlayBadge = isBuyContext && entry.playRecommended;
  const showTradeBadge = isBuyContext && entry.tradeRecommended;
  const showSellBadge = isSellContext && entry.sellRecommended;
  const isFit = entry.status === null || entry.status === undefined || entry.status === 0;

  return (
    <div
      role={hasHistory ? 'button' : undefined}
      tabIndex={hasHistory ? 0 : undefined}
      onClick={hasHistory ? onClick : undefined}
      onKeyDown={hasHistory ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      // p-3 instead of pl-[72px], the text wrapper gets margin instead
      className={`relative overflow-hidden w-full h-[72px] flex items-center p-3 mb-2 card-surface rounded-xl shadow-sm text-left transition-all ${hasHistory ? 'hover:border-cyan-500/50 hover:bg-[#1c1c1c] active:scale-[0.99] cursor-pointer' : 'cursor-default'}`}
      style={{ borderColor: showSellBadge ? 'rgba(239,68,68,0.4)' : (showPlayBadge || showTradeBadge) ? 'rgba(34,197,94,0.4)' : undefined }}
    >
      {/* Background Hero Image + Team Logo Watermark (LEFT ALIGNED) */}
      <div className="absolute top-0 left-0 bottom-0 z-0 pointer-events-none w-1/2 flex justify-start overflow-hidden rounded-l-xl">
        {teamLogo && (
          <img 
            src={teamLogo} 
            alt={entry.team} 
            className="absolute top-1/2 -translate-y-1/2 left-4 w-16 h-16 sm:w-20 sm:h-20 object-contain opacity-[0.12] mix-blend-screen" 
          />
        )}
        {entry.imageUrl && !isDummyImage(entry.imageUrl) && (
          <img 
            src={entry.imageUrl}
            alt=""
            className="h-[150%] w-auto object-cover object-top pointer-events-none"
            style={{ 
              transform: 'translateY(-10%) translateX(-5%)',
              // Fade von links nach rechts (90deg)
              WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0) 95%)',
              maskImage: 'linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0) 95%)',
            }}
          />
        )}
      </div>

      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(entry.playerId); }}
          aria-label={isFavorite ? 'Favorit entfernen' : 'Als Favorit speichern'}
          className="absolute left-3 top-1/2 -translate-y-1/2 p-1 z-10 opacity-70 hover:opacity-100 transition-opacity"
        >
          <StarIcon filled={isFavorite} />
        </button>
      )}
      
      {/* Left Text Content - margin keeps it clear from the face and the star */}
      <div className="flex-1 min-w-0 relative z-10 drop-shadow-md ml-[84px] sm:ml-[100px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          {entry.position && (
            <span className="text-[9px] font-black" style={{ color: POSITION_COLORS[entry.position] || '#8b92a5' }}>
              {entry.position}
            </span>
          )}
          <div className="text-[13px] sm:text-[14px] font-bold text-white truncate">
            {entry.firstName ? `${entry.firstName} ${entry.name}` : entry.name}
          </div>
        </div>
        
        <div className="text-[9px] text-[#8b92a5] mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-gray-400">{entry.team}</span>
          
          {/* Strictly ONE badge per player! Priority: Sell -> Play (Kader) -> Trade -> Status */}
          {(() => {
            if (showSellBadge) {
              return <span className="text-[7px] font-bold uppercase tracking-widest bg-red-500/15 text-red-400 border border-red-500/40 rounded px-1 shrink-0 ml-1">⚠ Verkaufen</span>;
            }
            if (showPlayBadge) {
              return <span className="text-[7px] font-bold uppercase tracking-widest bg-green-500/15 text-green-400 border border-green-500/40 rounded px-1 shrink-0 ml-1">✓ Kader-Potenzial</span>;
            }
            if (showTradeBadge) {
              return <span className="text-[7px] font-bold uppercase tracking-widest bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 rounded px-1 shrink-0 ml-1">📈 Trading</span>;
            }
            if (entry.statusLabel && !isFit) {
              return <span className="text-[7px] font-bold uppercase tracking-widest bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded px-1 shrink-0 ml-1">{entry.statusLabel}</span>;
            }
            return null;
          })()}
        </div>
      </div>
      
      {/* Right Numbers Content */}
      <div className="text-right ml-2 shrink-0 flex flex-col justify-center items-end relative z-10">
        <div className="text-[13px] sm:text-[14px] font-bold text-gray-100 leading-none mb-1">
          {formatCompactMoney(entry.marketValue)}
        </div>
        <div className={`text-[11px] sm:text-[12px] font-black leading-none ${rising ? 'text-green-400' : 'text-red-400'}`}>
          {rising ? '▲' : '▼'} {formatCompactMoney(entry.predictedChange)}
        </div>
        {typeof entry.hoursToExpiry === 'number' && isBuyContext ? (
          <div className="text-[8px] sm:text-[9px] text-[#8b92a5] mt-1.5 font-bold tracking-wide">
            Ablauf: <span className="text-white">{entry.hoursToExpiry < 24 ? `${entry.hoursToExpiry}h` : `${Math.round(entry.hoursToExpiry/24)}d`}</span>
          </div>
        ) : ownerName ? (
          <div className="text-[8px] sm:text-[9px] text-[#8b92a5] mt-1.5 font-bold tracking-wide">
            Besitzer: <span className="text-white truncate max-w-[80px] inline-block align-bottom">{ownerName}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl px-3 py-2 shadow-xl">
      <div className="text-[10px] text-[#8b92a5] mb-1">
        {formatShortDate(label)}
        {point.isPredicted && " (Prognose)"}
      </div>
      <div className={`text-sm font-bold ${point.isPredicted ? 'text-[#eab308]' : 'text-cyan-400'}`}>
        {formatMoney(point.mv !== undefined ? point.mv : point.mv_predicted)}
      </div>
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
  // "mvt" (Marktwert-Trendrichtung) ist ein Kickbase-interner Code - anhand
  // von Beobachtungen: 1 = fallend, 2 = steigend. Defensiv nur als kleiner
  // Zusatzhinweis genutzt (nicht die Hauptquelle für Auf/Ab, das übernehmen
  // weiterhin unsere eigenen 1/3/7-Tage-Berechnungen).
  if (code === 2) return <span className="text-green-400">▲</span>;
  if (code === 1) return <span className="text-red-400">▼</span>;
  return null;
};


const generateAIReasoning = (player) => {
  if (player.predictedChange === undefined) return null;
  const isRising = player.predictedChange >= 0;
  const changeStr = formatMoney(Math.abs(player.predictedChange));
  const trend = isRising ? "einen Anstieg" : "einen Wertverlust";
  
  let sentences = [];
  
  sentences.push(`Die KI prognostiziert für morgen ${trend} um ca. ${changeStr}.`);

  const reasons = [];
  if (isRising) {
    if (player.buyReasons?.includes('rising_value')) reasons.push("das Marktmomentum stark positiv ist");
    if (player.buyReasons?.includes('likely_starter')) reasons.push("hohe Startelf-Chancen bestehen");
    if (player.avgPoints > 70) reasons.push("der Punkteschnitt exzellent ist");
    if (player.teamOfTheWeek) reasons.push("die Nominierung fürs Team der Woche den Hype pusht");
    if (!reasons.length) reasons.push("die Algorithmen subtile, positive Marktsignale in der Datenhistorie erkennen");
    
    // Join logic with "und"
    let reasonText = reasons.join(", ");
    if (reasons.length > 1) {
        reasonText = reasons.slice(0, -1).join(", ") + " und " + reasons[reasons.length - 1];
    }
    sentences.push(`Dieser Trend wird gestützt, da ${reasonText}.`);
  } else {
    if (player.sellReasons?.includes('injured_or_suspended') || player.sellReasons?.includes('confirmed_injured_external') || (player.status && player.status !== 0)) reasons.push("der Spieler aktuell ausfällt");
    if (player.sellReasons?.includes('falling_value')) reasons.push("bereits ein klarer Abwärtstrend messbar ist");
    if (player.sellReasons?.includes('benched_last_matchday')) reasons.push("er zuletzt nicht zum Einsatz kam");
    if (player.sellReasons?.includes('low_starting_probability')) reasons.push("seine Spielzeiten unsicher sind");
    if (!reasons.length) reasons.push("die Marktdynamik für diesen Spieler aktuell spürbar abkühlt");
    
    let reasonText = reasons.join(", ");
    if (reasons.length > 1) {
        reasonText = reasons.slice(0, -1).join(", ") + " und " + reasons[reasons.length - 1];
    }
    sentences.push(`Die Abwertung droht, weil ${reasonText}.`);
  }
  
  if (player.predictedChange3d !== undefined) {
    if (player.predictedChange > 0 && player.predictedChange3d < 0) {
      sentences.push("⚠️ Vorsicht: Auf 3-Tages-Sicht kippt die Prognose ins Negative.");
    } else if (player.predictedChange < 0 && player.predictedChange3d > 0) {
      sentences.push("💡 Lichtblick: Auf 3-Tages-Sicht rechnet das Modell bereits wieder mit einer Erholung.");
    }
  }

  return sentences.join(" ");
};

const PlayerDetailView = ({ player, teamLogos = {}, onClose, isFavorite, onToggleFavorite }) => {
  const fullBaseHistory = normalizeHistory(player.history);
  const [timeRange, setTimeRange] = useState('3m');
  
  const baseHistory = useMemo(() => {
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
  
  const hasScoutingFacts = player.appearances !== undefined || player.totalMinutes !== undefined || player.avgPoints !== undefined;
  const isFit = player.status === null || player.status === undefined || player.status === 0;
  const showPlayBadge = player.onMarket && player.playRecommended;
  const showTradeBadge = player.onMarket && player.tradeRecommended;
  const showSellBadge = player.inSquad && player.sellRecommended;
  const reasons = (player.inSquad ? player.sellReasons : player.buyReasons) || [];

  return (
    <div className="w-full bg-[#000000] min-h-screen relative flex flex-col pb-10">
      {/* Header mit Zurueck-Button (Page-Look) */}
      <div className="sticky top-0 z-50 bg-[#000000]/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#2e2e2e]/50">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-[#8b92a5] hover:text-white transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span className="font-bold text-sm">Zurück</span>
        </button>
        {onToggleFavorite && (
          <button
            onClick={() => onToggleFavorite(player.playerId)}
            aria-label={isFavorite ? 'Favorit entfernen' : 'Als Favorit speichern'}
            className="p-1"
          >
            <StarIcon filled={isFavorite} />
          </button>
        )}
      </div>

        <div className="overflow-y-auto min-h-0 pt-6 pb-8 relative">
          
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
              <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-tight drop-shadow-lg w-[80%]">
                {player.firstName ? `${player.firstName} ${player.name}` : player.name}
              </h2>
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
          <div className="h-[160px] sm:h-[200px] w-full px-4 sm:px-6 mb-6 relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
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
                <Line type="monotone" dataKey="mv" stroke="#ffffff" strokeWidth={2.5} dot={false} activeDot={{ r: 6, fill: "#ffffff", strokeWidth: 0 }} connectNulls={true} animationDuration={800} />
                <Line type="monotone" dataKey="mv_predicted" stroke="#eab308" strokeDasharray="2 3" strokeWidth={1.5} dot={{ r: 3, fill: "#eab308", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#eab308", strokeWidth: 0 }} connectNulls={true} animationDuration={800} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Time Toggles */}
          <div className="px-4 sm:px-6 mb-8">
            <div className="flex justify-between items-center max-w-[260px] mx-auto border-b border-[#2e2e2e] pb-2">
              {['1w', '1m', '3m', '6m', '1y'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`text-xs sm:text-[13px] font-medium pb-2 -mb-[9px] transition-colors border-b-2 ${timeRange === range ? 'text-white border-white' : 'text-[#6b7280] border-transparent hover:text-gray-300'}`}
                >
                  {range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Badges / Trading Recommendations */}
          {(showPlayBadge || showTradeBadge || showSellBadge || !isFit || player.teamOfTheWeek) && (
            <div className="px-4 sm:px-6 mb-6 flex flex-wrap gap-2">
              {showSellBadge && (
                <div className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium">
                  ⚠ Verkaufen
                </div>
              )}
              {showPlayBadge && (
                <div className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium">
                  ✓ Stammelf
                </div>
              )}
              {showTradeBadge && (
                <div className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium">
                  📈 Trading
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

          {/* KI Analyse Block */}
          {player.predictedChange !== undefined && (
            <div className="px-4 sm:px-6 mb-8">
              <div className="bg-[#111111] border border-[#2e2e2e] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold tracking-widest text-[#22d3ee] uppercase">KI Analyse</span>
                </div>
                <p className="text-xs sm:text-sm text-[#8b92a5] leading-relaxed">
                  {generateAIReasoning(player)}
                </p>
              </div>
            </div>
          )}

          {/* Key Statistics Grid (Scalable Style) */}
          <div className="px-4 sm:px-6">
            <h3 className="text-lg font-semibold text-white mb-4">Kennzahlen</h3>
            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-medium mb-1">Max-Gebot</span>
                <span className="text-white font-semibold">{player.maxBid > 0 && player.onMarket ? formatMoney(player.maxBid) : '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-medium mb-1">Ø Punkte</span>
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
  );
};

const Advisor = () => {
  const { isAdmin, profile } = useAuth();
  const goBack = useBackNavigation('/account');
  const { isFavorite, toggleFavorite, favoritePlayers } = useFavorites();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [activeLeague, setActiveLeague] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [marketFilters, setMarketFilters] = useState(DEFAULT_FILTERS);
  const [dbFilters, setDbFilters] = useState(DEFAULT_FILTERS);
  const [squadFilters, setSquadFilters] = useState(DEFAULT_FILTERS);
  const [favoritesFilters, setFavoritesFilters] = useState(DEFAULT_FILTERS);
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

  // Vereinslogos auslesen (Kickbase API liefert die Tabelle mit den Logos als SVG)
  const teamsData = data?.leagues ? Object.values(data.leagues)[0]?.teams || [] : [];
  const teamLogos = {};
  teamsData.forEach(t => {
    if (t.tn) {
      // Suche im Objekt nach der Eigenschaft, die den SVG-Link enthält
      const svgKey = Object.keys(t).find(k => typeof t[k] === 'string' && t[k].endsWith('.svg'));
      if (svgKey) {
        teamLogos[t.tn] = `https://kickbase.b-cdn.net/${t[svgKey]}`;
      }
    }
  });


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

  const marketTeams = useMemo(
    () => [...new Set((league?.marketRecommendations || []).map((p) => p.team).filter(Boolean))].sort(),
    [league]
  );
  const filteredMarket = useMemo(
    () => applyFilters(league?.marketRecommendations || [], marketFilters, 'buy'),
    [league, marketFilters]
  );

  const dbTeams = useMemo(
    () => [...new Set((data?.players || []).map((p) => p.team).filter(Boolean))].sort(),
    [data]
  );
  const filteredDb = useMemo(() => applyFilters(data?.players || [], dbFilters, 'buy'), [data, dbFilters]);

  // Favoriten: aus der kompletten Spieler-Datenbank gefiltert, damit auch
  // Spieler auftauchen, die aktuell weder auf dem Markt noch im Kader sind.
  const favoritePlayersList = useMemo(
    () => (data?.players || []).filter((p) => favoritePlayers.includes(String(p.playerId))),
    [data, favoritePlayers]
  );
  const filteredFavorites = useMemo(
    () => applyFilters(favoritePlayersList, favoritesFilters, 'buy'),
    [favoritePlayersList, favoritesFilters]
  );

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

  const playerManagerMap = useMemo(() => {
    const map = {};
    if (!effectiveManagerSquads || !resolvedManagers) return map;
    
    const managerNames = {};
    resolvedManagers.forEach(m => managerNames[m.id] = m.name);

    for (const [managerId, squad] of Object.entries(effectiveManagerSquads)) {
      const managerName = managerNames[managerId] || `Manager ${managerId}`;
      squad.forEach(p => {
        map[p.playerId] = managerName;
      });
    }
    return map;
  }, [effectiveManagerSquads, resolvedManagers]);

  const filteredSquad = useMemo(
    () => applyFilters(effectiveManagerSquads[selectedManagerId] || [], squadFilters, 'sell'),
    [effectiveManagerSquads, squadFilters, selectedManagerId]
  );

  // Budget des ausgewaehlten Managers + welche Kaufempfehlungen er sich damit
  // tatsaechlich leisten koennte - beantwortet direkt "was kann ich mit
  // meinem Geld anfangen?", ohne Markt- und Budget-Tab manuell abgleichen
  // zu muessen. Bewusst NUR das reine Budget (kein Dispo-Zuschlag mehr, siehe
  // backend/advisor/budgets.py) - der Dispo-Puffer muss bis zum naechsten
  // Spieltag wieder ausgeglichen sein, ist also kein sicher ausgebbares Geld.
  const selectedManagerBudget = league?.managerBudgets?.[selectedManagerId] || null;
  const rawBudget = selectedManagerBudget?.budget ?? 0;

  // Kader-Vollstaendigkeit: reicht das Budget noch fuer eine volle Elf, oder
  // muessten fehlende Pflichtpositionen (siehe squadRules.js) zuerst
  // nachbesetzt werden, bevor man "frei" Geld ausgeben kann?
  const currentSquad = effectiveManagerSquads[selectedManagerId] || [];
  const squadPositionCounts = useMemo(() => countPositions(currentSquad), [currentSquad]);
  const squadMissing = useMemo(() => missingPositions(squadPositionCounts), [squadPositionCounts]);
  const squadReserveInfo = useMemo(
    () => estimateReserveForMissingPositions(squadMissing, data?.players || []),
    [squadMissing, data]
  );
  const netBudgetAfterReserve = rawBudget - squadReserveInfo.reserve;

  const affordableBuyRecommendations = useMemo(() => {
    if (!selectedManagerBudget || !league?.marketRecommendations) return [];
    return league.marketRecommendations
      .filter((p) => p.buyRecommended && (p.marketValue || 0) <= netBudgetAfterReserve)
      .slice(0, 5);
  }, [selectedManagerBudget, league, netBudgetAfterReserve]);

  // "Verkaufe X, dann kannst du dir auch noch Y leisten": pro Verkaufs-
  // empfehlung im eigenen Kader wird geprueft, welches zusaetzliche Budget
  // dieser eine Verkauf freigeben wuerde und welche (bisher nicht leistbaren)
  // Kaufempfehlungen dadurch neu in Reichweite kommen.
  const sellUnlockOpportunities = useMemo(() => {
    if (!league?.marketRecommendations) return [];
    const alreadyAffordableIds = new Set(affordableBuyRecommendations.map((p) => p.playerId));
    const sellCandidates = currentSquad.filter((p) => p.sellRecommended);

    return sellCandidates
      .map((sellPlayer) => {
        const budgetAfterSale = netBudgetAfterReserve + (sellPlayer.marketValue || 0);
        const unlocked = league.marketRecommendations
          .filter((p) => p.buyRecommended && !alreadyAffordableIds.has(p.playerId) && (p.marketValue || 0) <= budgetAfterSale)
          .slice(0, 3);
        return { sellPlayer, budgetAfterSale, unlocked };
      })
      .filter((entry) => entry.unlocked.length > 0);
  }, [currentSquad, league, netBudgetAfterReserve, affordableBuyRecommendations]);

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
          onClose={() => setSelectedPlayer(null)}
          isFavorite={isFavorite(selectedPlayer.playerId)}
          onToggleFavorite={toggleFavorite}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <PageHeader eyebrow="ADMIN" accentColor="#22d3ee" title="Trading Advisor" />
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowInfo((v) => !v)}
              aria-label="Info"
              className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all ${showInfo ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'bg-[#171717] border-[#2e2e2e] text-[#8b92a5] hover:text-white hover:border-[#404040]'}`}
            >
              <Info size={18} strokeWidth={2.5} />
            </button>
            <button
              onClick={handleAdvisorUpdate}
              disabled={isAdvisorUpdating}
              aria-label="Trading Advisor aktualisieren"
              title="Trading Advisor aktualisieren"
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#171717] border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500 transition-all disabled:opacity-50"
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
                  {t.key === 'favorites' && <Star size={12} fill={sectionTab === t.key ? 'currentColor' : 'none'} />}
                  {t.label}
                </button>
              ))}
            </div>

            {league && sectionTab === 'budgets' && (
              <>
                <h2 className="text-lg font-semibold text-white mb-4">Manager-Budgets (geschätzt)</h2>
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
                  <h2 className="text-lg font-semibold text-white">Markt-Empfehlungen</h2>
                  <span className="text-[10px] text-[#8b92a5]">{filteredMarket.length} von {league.marketRecommendations?.length || 0} Spielern</span>
                </div>
                {league.marketRecommendations?.length ? (
                  <>
                    <FilterBar filters={marketFilters} onChange={setMarketFilters} teams={marketTeams} showTeamFilter recommendationMode="buy" />
                    {filteredMarket.length ? (
                      <div className="mb-10">
                        {filteredMarket.map((entry, index) => (
                          <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} ownerName={playerManagerMap[entry.playerId]} teamLogo={teamLogos[entry.team]} onClick={() => setSelectedPlayer(entry)} isFavorite={isFavorite(entry.playerId)} onToggleFavorite={toggleFavorite} />
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
                        <div className="text-[9px] font-black uppercase tracking-widest text-[#8b92a5] mb-2">Verfügbares Budget</div>
                        <div className="text-lg font-black text-white">{formatMoney(rawBudget)}</div>

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
                              <div className="text-[9px] font-black uppercase tracking-widest text-green-400 mb-2">Damit leistbare Kaufempfehlungen</div>
                              <div className="space-y-1.5">
                                {affordableBuyRecommendations.map((p, i) => (
                                  <div key={`${p.playerId}-${i}`} className="flex items-center justify-between text-xs bg-[#171717] border border-[#2e2e2e] rounded-lg px-3 py-2">
                                    <span className="text-gray-200 font-bold truncate">{p.firstName ? `${p.firstName} ${p.name}` : p.name}</span>
                                    <span className="text-[#8b92a5] shrink-0 ml-2">{formatMoney(p.marketValue)}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-[10px] text-[#8b92a5]">Aktuell keine passende, leistbare Kaufempfehlung auf dem Markt.</div>
                          )}
                        </div>

                        {sellUnlockOpportunities.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-[#2e2e2e]">
                            <div className="text-[9px] font-black uppercase tracking-widest text-cyan-400 mb-2">Verkaufen schafft zusätzlichen Spielraum</div>
                            <div className="space-y-2">
                              {sellUnlockOpportunities.map(({ sellPlayer, budgetAfterSale, unlocked }, i) => (
                                <div key={`${sellPlayer.playerId}-${i}`} className="bg-[#171717] border border-[#2e2e2e] rounded-lg px-3 py-2">
                                  <div className="text-[10px] text-gray-300">
                                    Verkaufe <span className="font-bold text-white">{sellPlayer.firstName ? `${sellPlayer.firstName} ${sellPlayer.name}` : sellPlayer.name}</span> ({formatMoney(sellPlayer.marketValue)}) → {formatMoney(budgetAfterSale)} verfügbar
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {unlocked.map((p, j) => (
                                      <span key={`${p.playerId}-${j}`} className="text-[9px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded px-1.5 py-0.5">
                                        {p.firstName ? `${p.firstName} ${p.name}` : p.name}
                                      </span>
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
                              <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} ownerName={playerManagerMap[entry.playerId]} teamLogo={teamLogos[entry.team]} onClick={() => setSelectedPlayer(entry)} isFavorite={isFavorite(entry.playerId)} onToggleFavorite={toggleFavorite} />
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
                  <span className="text-[10px] text-[#8b92a5]">{filteredDb.length} von {data.players?.length || 0} Spielern</span>
                </div>
                {data.players?.length ? (
                  <>
                    <FilterBar filters={dbFilters} onChange={(f) => { setDbFilters(f); setDbVisibleCount(DB_PAGE_SIZE); }} teams={dbTeams} showTeamFilter recommendationMode="buy" />
                    {filteredDb.length ? (
                      <>
                        <div>
                          {filteredDb.slice(0, dbVisibleCount).map((entry, index) => (
                            <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} ownerName={playerManagerMap[entry.playerId]} teamLogo={teamLogos[entry.team]} onClick={() => setSelectedPlayer(entry)} isFavorite={isFavorite(entry.playerId)} onToggleFavorite={toggleFavorite} />
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

            {sectionTab === 'favorites' && (
              <>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Star size={16} className="text-yellow-500" fill="currentColor" />
                      Favoriten
                    </h2>
                    <p className="text-[10px] text-[#8b92a5] mt-1">Deine gemerkten Spieler, geräteübergreifend gespeichert.</p>
                  </div>
                  <span className="text-[10px] text-[#8b92a5]">{filteredFavorites.length} von {favoritePlayersList.length} Spielern</span>
                </div>
                {favoritePlayersList.length ? (
                  <>
                    <FilterBar filters={favoritesFilters} onChange={setFavoritesFilters} teams={dbTeams} showTeamFilter recommendationMode="buy" />
                    {filteredFavorites.length ? (
                      <div className="mb-10">
                        {filteredFavorites.map((entry, index) => (
                          <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} ownerName={playerManagerMap[entry.playerId]} teamLogo={teamLogos[entry.team]} onClick={() => setSelectedPlayer(entry)} isFavorite={isFavorite(entry.playerId)} onToggleFavorite={toggleFavorite} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-[#8b92a5] text-sm py-6 mb-10">Kein Favorit passt zu den aktuellen Filtern.</div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-[#8b92a5] text-sm py-10">
                    Noch keine Favoriten gespeichert. Klicke auf den ★-Stern bei einer Spielerkarte, um sie hier zu sammeln.
                  </div>
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
