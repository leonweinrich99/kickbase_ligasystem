import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import { useFavorites } from './useFavorites';

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
  { key: 'budgets', label: 'Budgets' },
  { key: 'market', label: 'Markt' },
  { key: 'squad', label: 'Kader' },
  { key: 'database', label: 'Datenbank' },
  { key: 'favorites', label: '★ Favoriten' },
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

const FilterBar = ({ filters, onChange, teams, showTeamFilter = false, recommendationMode }) => (
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
    {recommendationMode && (
      <button
        onClick={() => onChange({ ...filters, recommendedOnly: !filters.recommendedOnly })}
        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filters.recommendedOnly ? (recommendationMode === 'sell' ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-green-500/20 text-green-400 border border-green-500/40') : 'bg-[#171717] border border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
      >
        {recommendationMode === 'sell' ? 'Nur Verkaufsempfehlungen' : 'Nur Kaufempfehlungen'}
      </button>
    )}
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

const StarIcon = ({ filled }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? '#eab308' : 'none'} stroke={filled ? '#eab308' : '#626978'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

const PlayerCard = ({ entry, onClick, isFavorite, onToggleFavorite }) => {
  const rising = (entry.predictedChange || 0) >= 0;
  const hasHistory = Array.isArray(entry.history) && entry.history.length > 1;
  const isBuyContext = entry.onMarket;
  const isSellContext = entry.inSquad;
  const showPlayBadge = isBuyContext && entry.playRecommended;
  const showTradeBadge = isBuyContext && entry.tradeRecommended;
  const showSellBadge = isSellContext && entry.sellRecommended;
  const reasons = (isSellContext ? entry.sellReasons : entry.buyReasons) || [];
  const isFit = entry.status === null || entry.status === undefined || entry.status === 0;

  return (
    <div
      role={hasHistory ? 'button' : undefined}
      tabIndex={hasHistory ? 0 : undefined}
      onClick={hasHistory ? onClick : undefined}
      onKeyDown={hasHistory ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`w-full flex items-center p-2 mb-2 bg-[#171717] border rounded-xl shadow-sm text-left transition-all ${showSellBadge ? 'border-red-500/40' : (showPlayBadge || showTradeBadge) ? 'border-green-500/40' : 'border-[#2e2e2e]'} ${hasHistory ? 'hover:border-cyan-500/50 hover:bg-[#1c1c1c] active:scale-[0.99] cursor-pointer' : 'cursor-default'}`}
    >
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(entry.playerId); }}
          aria-label={isFavorite ? 'Favorit entfernen' : 'Als Favorit speichern'}
          className="mr-2 shrink-0 p-1 -m-1"
        >
          <StarIcon filled={isFavorite} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {entry.position && (
            <span className="text-[10px] font-black" style={{ color: POSITION_COLORS[entry.position] || '#8b92a5' }}>
              {entry.position}
            </span>
          )}
          <div className="text-[14px] font-bold text-gray-100 truncate">
            {entry.firstName ? `${entry.firstName} ${entry.name}` : entry.name}
          </div>
          {showPlayBadge && (
            <span className="text-[8px] font-black uppercase tracking-widest bg-green-500/15 text-green-400 border border-green-500/40 rounded px-1 shrink-0">✓ Stammelf</span>
          )}
          {showTradeBadge && (
            <span className="text-[8px] font-black uppercase tracking-widest bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 rounded px-1 shrink-0">📈 Trading</span>
          )}
          {showSellBadge && (
            <span className="text-[8px] font-black uppercase tracking-widest bg-red-500/15 text-red-400 border border-red-500/40 rounded px-1 shrink-0">⚠ Verkaufen</span>
          )}
          {entry.statusLabel && !isFit && (
            <span className="text-[8px] font-black uppercase tracking-widest bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded px-1 shrink-0">{entry.statusLabel}</span>
          )}
          {entry.expiringToday && (
            <span className="text-[8px] font-black uppercase tracking-widest bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded px-1 shrink-0">Läuft heute ab</span>
          )}
        </div>
        <div className="text-[10px] text-[#8b92a5] mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-gray-300">{entry.team}</span>
          {typeof entry.avgPoints === 'number' && (
            <>
              <span>·</span>
              <span>Ø {entry.avgPoints} Pkt.{entry.appearances ? ` (${entry.appearances} Sp.)` : ''}</span>
            </>
          )}
          {typeof entry.startElfProbability === 'number' && (
            <>
              <span>·</span>
              <span>Startelf: {Math.round(entry.startElfProbability * 100)}%</span>
            </>
          )}
          {typeof entry.hoursToExpiry === 'number' && (
            <>
              <span>·</span>
              <span>{entry.hoursToExpiry}h verbleibend</span>
            </>
          )}
        </div>
        {(showPlayBadge || showTradeBadge || showSellBadge) && reasons.length > 0 && (
          <div className={`text-[9px] mt-0.5 ${showSellBadge ? 'text-red-400' : 'text-green-400/80'}`}>
            {reasons.map((r) => REASON_LABELS[r] || r).join(' · ')}
          </div>
        )}
      </div>
      <div className="text-right ml-2 shrink-0 flex flex-col justify-center items-end">
        <div className="text-[12px] font-bold text-gray-300 leading-none mb-1">
          {formatCompactMoney(entry.marketValue)}
        </div>
        <div className={`text-[13px] font-black leading-none ${rising ? 'text-green-400' : 'text-red-400'}`}>
          {rising ? '▲' : '▼'} {formatCompactMoney(entry.predictedChange)}
        </div>
        {entry.maxBid > 0 && isBuyContext && (
          <div className="text-[9px] text-[#8b92a5] mt-1 font-bold tracking-wide">
            Max: <span className="text-white">{formatCompactMoney(entry.maxBid)}</span>
          </div>
        )}
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
  const showImage = url && !failed;
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

const TrendArrow = ({ code }) => {
  // "mvt" (Marktwert-Trendrichtung) ist ein Kickbase-interner Code - anhand
  // von Beobachtungen: 1 = fallend, 2 = steigend. Defensiv nur als kleiner
  // Zusatzhinweis genutzt (nicht die Hauptquelle für Auf/Ab, das übernehmen
  // weiterhin unsere eigenen 1/3/7-Tage-Berechnungen).
  if (code === 2) return <span className="text-green-400">▲</span>;
  if (code === 1) return <span className="text-red-400">▼</span>;
  return null;
};

const PlayerHistoryModal = ({ player, onClose, isFavorite, onToggleFavorite }) => {
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
      const lastPoint = history[history.length - 1];
      const todayDateObj = new Date(lastPoint.date);
      lastPoint.mv_predicted = lastPoint.mv;
      
      const addPredictedPoint = (daysAhead, change) => {
          if (change === undefined) return;
          const futureDate = new Date(todayDateObj);
          futureDate.setDate(futureDate.getDate() + daysAhead);
          const dateStr = futureDate.toISOString().split('T')[0];
          history.push({
              date: dateStr,
              mv_predicted: (player.marketValue || lastPoint.mv) + change,
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
    <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4 sm:p-0" onClick={onClose}>
      <div
        className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-[#111111] sm:rounded-3xl shadow-2xl relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-[#8b92a5] hover:text-white transition-colors z-10"
          aria-label="Schließen"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="overflow-y-auto min-h-0 pt-6 pb-8">
          {/* Header - Name & Team */}
          <div className="px-4 sm:px-6 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[#8b92a5] font-semibold text-sm tracking-wide">{player.team}</span>
              {player.position && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5"
                    style={{ backgroundColor: `${POSITION_COLORS[player.position] || '#8b92a5'}26`, color: POSITION_COLORS[player.position] || '#8b92a5' }}
                  >
                    {player.position}
                  </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
              {player.firstName ? `${player.firstName} ${player.name}` : player.name}
            </h2>
          </div>

          {/* Price & Change (Scalable Style) */}
          <div className="px-4 sm:px-6 mb-6">
            <div className="text-3xl sm:text-[40px] font-black text-white leading-none tracking-tighter mb-2">
              {formatMoney(player.marketValue)}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`text-sm sm:text-base font-bold ${(player.predictedChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {player.predictedChange > 0 ? '+' : ''}{formatMoney(player.predictedChange)} (Prognose Morgen)
              </span>
              
              {(player.predictedChange3d !== undefined || player.predictedChange7d !== undefined) && (
                <div className="flex gap-2 items-center text-xs sm:text-sm font-semibold">
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
          <div className="h-[160px] sm:h-[200px] w-full mb-6 relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <YAxis
                  domain={['dataMin', 'dataMax']}
                  hide={true}
                />
                <Tooltip 
                   content={<ChartTooltip />}
                   cursor={{ stroke: '#2e2e2e', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Line type="monotone" dataKey="mv" stroke="#ffffff" strokeWidth={2.5} dot={false} activeDot={{ r: 6, fill: "#ffffff", strokeWidth: 0 }} animationDuration={800} />
                <Line type="monotone" dataKey="mv_predicted" stroke="#eab308" strokeDasharray="4 4" strokeWidth={2.5} dot={{ r: 4, fill: "#eab308", strokeWidth: 0 }} activeDot={{ r: 6, fill: "#eab308", strokeWidth: 0 }} animationDuration={800} />
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
                  className={`text-xs sm:text-[13px] font-bold pb-2 -mb-[9px] transition-colors border-b-2 ${timeRange === range ? 'text-white border-white' : 'text-[#6b7280] border-transparent hover:text-gray-300'}`}
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
                <div className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold">
                  ⚠ Verkaufen
                </div>
              )}
              {showPlayBadge && (
                <div className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold">
                  ✓ Stammelf
                </div>
              )}
              {showTradeBadge && (
                <div className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold">
                  📈 Trading
                </div>
              )}
              {!isFit && player.statusLabel && (
                <div className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold">
                  {player.statusLabel}
                </div>
              )}
              {player.teamOfTheWeek && (
                <div className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold">
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

          {/* Key Statistics Grid (Scalable Style) */}
          <div className="px-4 sm:px-6">
            <h3 className="text-lg font-bold text-white mb-4">Kennzahlen</h3>
            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-semibold mb-1">Max-Gebot</span>
                <span className="text-white font-medium">{player.maxBid > 0 && player.onMarket ? formatMoney(player.maxBid) : '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-semibold mb-1">Ø Punkte</span>
                <span className="text-white font-medium">{player.avgPoints ?? '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-semibold mb-1">Saisonpunkte</span>
                <span className="text-white font-medium">{player.seasonPoints ?? '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-semibold mb-1">Einsätze</span>
                <span className="text-white font-medium">{player.officialSeasonAppearances ?? player.appearances ?? '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-semibold mb-1">Gesamtminuten</span>
                <span className="text-white font-medium">{player.totalMinutes ? `${player.totalMinutes}'` : '–'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8b92a5] text-xs font-semibold mb-1">Tore / Vorlagen</span>
                <span className="text-white font-medium">
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
  const { isAdmin } = useAuth();
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
      // Bewusst per Authorization-Header statt Query-Parameter (siehe AdminPanel.jsx) -
      // sonst landet das Passwort im Klartext im Browser-Netzwerk-Tab und in
      // Vercels HTTP-Zugriffslogs.
      const res = await fetch('/api/advisor-cron', {
        headers: { Authorization: `Bearer ${password}` }
      });
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

  const filteredSquad = useMemo(
    () => applyFilters(effectiveManagerSquads[selectedManagerId] || [], squadFilters, 'sell'),
    [effectiveManagerSquads, squadFilters, selectedManagerId]
  );

  // Budget des ausgewaehlten Managers + welche Kaufempfehlungen er sich damit
  // tatsaechlich leisten koennte - beantwortet direkt "was kann ich mit
  // meinem Geld anfangen?", ohne Markt- und Budget-Tab manuell abgleichen
  // zu muessen.
  const selectedManagerBudget = league?.managerBudgets?.[selectedManagerId] || null;
  const affordableBuyRecommendations = useMemo(() => {
    if (!selectedManagerBudget || !league?.marketRecommendations) return [];
    const budget = selectedManagerBudget.availableBudget ?? selectedManagerBudget.budget ?? 0;
    return league.marketRecommendations
      .filter((p) => p.buyRecommended && (p.marketValue || 0) <= budget)
      .slice(0, 5);
  }, [selectedManagerBudget, league]);

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
                    <FilterBar filters={marketFilters} onChange={setMarketFilters} teams={marketTeams} showTeamFilter recommendationMode="buy" />
                    {filteredMarket.length ? (
                      <div className="mb-10">
                        {filteredMarket.map((entry, index) => (
                          <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} onClick={() => setSelectedPlayer(entry)} isFavorite={isFavorite(entry.playerId)} onToggleFavorite={toggleFavorite} />
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

                    {selectedManagerBudget && (
                      <div className="bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl p-4 mb-4">
                        <div className="text-[9px] font-black uppercase tracking-widest text-[#8b92a5] mb-2">Verfügbares Budget</div>
                        <div className="text-lg font-black text-white mb-3">{formatMoney(selectedManagerBudget.availableBudget ?? selectedManagerBudget.budget)}</div>
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
                    )}
                    {selectedManagerId && effectiveManagerSquads[selectedManagerId]?.length > 0 ? (
                      <>
                        <FilterBar filters={squadFilters} onChange={setSquadFilters} teams={[]} recommendationMode="sell" />
                        {filteredSquad.length ? (
                          <div className="mb-10">
                            {filteredSquad.map((entry, index) => (
                              <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} onClick={() => setSelectedPlayer(entry)} isFavorite={isFavorite(entry.playerId)} onToggleFavorite={toggleFavorite} />
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
                    <FilterBar filters={dbFilters} onChange={(f) => { setDbFilters(f); setDbVisibleCount(DB_PAGE_SIZE); }} teams={dbTeams} showTeamFilter recommendationMode="buy" />
                    {filteredDb.length ? (
                      <>
                        <div>
                          {filteredDb.slice(0, dbVisibleCount).map((entry, index) => (
                            <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} onClick={() => setSelectedPlayer(entry)} isFavorite={isFavorite(entry.playerId)} onToggleFavorite={toggleFavorite} />
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
                    <h2 className="text-[1.2rem] font-black text-[#f8fafc] tracking-tight uppercase">★ Favoriten</h2>
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
                          <PlayerCard key={`${entry.playerId ?? entry.name}-${index}`} entry={entry} onClick={() => setSelectedPlayer(entry)} isFavorite={isFavorite(entry.playerId)} onToggleFavorite={toggleFavorite} />
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

        {selectedPlayer && (
          <PlayerHistoryModal
            player={selectedPlayer}
            onClose={() => setSelectedPlayer(null)}
            isFavorite={isFavorite(selectedPlayer.playerId)}
            onToggleFavorite={toggleFavorite}
          />
        )}
      </div>
    </div>
  );
};

export default Advisor;
