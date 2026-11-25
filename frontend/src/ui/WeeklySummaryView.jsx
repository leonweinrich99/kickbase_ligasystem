import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarRange,
  Trophy,
  ArrowLeftRight,
  Compass,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { formatArticleDate } from '../feedMeta';
import StartProbBadge from './StartProbBadge';

// Gecachter Loader fuer weekly-summary.json, damit Tab-Wechsel im Newsfeed
// keinen erneuten Fetch ausloesen.
let weeklyPromise = null;
const loadWeeklySummary = () => {
  if (!weeklyPromise) {
    weeklyPromise = fetch('/weekly-summary.json', { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        if (!data) weeklyPromise = null;
        return data;
      });
  }
  return weeklyPromise;
};

const POS_COLORS = { TW: '#eab308', ABW: '#3b82f6', MF: '#22c55e', ST: '#ef4444' };

const formatMoneySigned = (val) => {
  if (val === null || val === undefined || Number.isNaN(val)) return '–';
  const sign = val > 0 ? '+' : val < 0 ? '-' : '';
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2).replace('.', ',')} Mrd €`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k €`;
  return `${sign}${Math.round(abs)} €`;
};

const formatMoney = (val) => {
  if (val === null || val === undefined || Number.isNaN(val)) return '–';
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) return `${(abs / 1_000_000_000).toFixed(2).replace('.', ',')} Mrd €`;
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  if (abs >= 1_000) return `${Math.round(abs / 1_000)}k €`;
  return `${Math.round(abs)} €`;
};

const formatPts = (val) => Number(val || 0).toLocaleString('de-DE');

const formatShortDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
};

const difficultyPillClass = (diff) => {
  if (diff <= 2.2) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (diff <= 3.1) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-red-500/15 text-red-300 border-red-500/30';
};

/**
 * Kompakte Admin-Vorschau-Kachel im Newsfeed ("Alle"-Ansicht), die direkt in
 * den Weekly-Tab fuehrt. Wird in FeedPage.jsx nur fuer Admins gerendert.
 */
export const WeeklyTeaserCard = ({ onOpen }) => {
  const { profile } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadWeeklySummary().then((res) => {
      if (!cancelled) setData(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const myId = profile?.kickbaseId ? String(profile.kickbaseId) : null;
  const myMd = myId ? data?.recap?.byManagerId?.[myId] : null;
  const myTr = myId ? data?.transfers?.byManagerId?.[myId] : null;
  const myRec = myId ? data?.recommendations?.byManagerId?.[myId] : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left mb-6 rounded-2xl overflow-hidden border border-purple-500/35 bg-gradient-to-br from-[#191026] via-[#120d1a] to-[#0b0b0f] hover:border-purple-400/60 transition-all active:scale-[0.99] cursor-pointer group p-4 sm:p-5 shadow-[0_0_30px_rgba(168,85,247,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-400/40">
              <CalendarRange size={10} />
              Weekly
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-300 border border-white/10">
              Admin-Vorschau
            </span>
            {data?.editionLabel && (
              <span className="text-[10px] font-semibold text-[#8b92a5] tabular-nums">
                {data.editionLabel}
              </span>
            )}
          </div>
          <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight leading-snug group-hover:text-purple-200 transition-colors">
            {data?.editorial?.headline || 'Dein wöchentlicher Ligasystem-Report'}
          </h3>
          <p className="text-xs text-gray-300/85 mt-1 line-clamp-2 leading-relaxed">
            {data?.editorial?.intro || 'Spieltags-Rückblick, 7-Tage-Transferbilanz und personalisierte Empfehlungen für die kommenden Spieltage.'}
          </p>
        </div>

        <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-400/30 flex items-center justify-center text-purple-300 shrink-0 group-hover:translate-x-0.5 transition-transform">
          <ChevronRight size={18} />
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3 border-t border-white/10">
          <div className="rounded-xl bg-black/35 px-2.5 py-2 border border-white/[0.06]">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5] truncate">
              {myMd ? `Mein ST ${data.matchday}` : `Sieger ST ${data.matchday}`}
            </div>
            <div className="text-xs sm:text-sm font-bold text-white tabular-nums mt-0.5 truncate">
              {myMd
                ? `${formatPts(myMd.matchdayPoints)} Pkt`
                : `${data.recap?.overallWinner?.name || '–'} (${formatPts(data.recap?.overallWinner?.points)})`}
            </div>
          </div>

          <div className="rounded-xl bg-black/35 px-2.5 py-2 border border-white/[0.06]">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5] truncate">
              {myTr ? 'Meine Bilanz (7T)' : 'Transfers (7T)'}
            </div>
            <div
              className={`text-xs sm:text-sm font-bold tabular-nums mt-0.5 truncate ${
                myTr
                  ? myTr.realizedProfit >= 0
                    ? 'text-emerald-400'
                    : 'text-[#ff5c3e]'
                  : 'text-purple-300'
              }`}
            >
              {myTr
                ? `${myTr.realizedCount > 0 ? formatMoneySigned(myTr.realizedProfit) : `${myTr.totalCount} Deals`}`
                : `${data.transfers?.overall?.totalCount || 0} Deals`}
            </div>
          </div>

          <div className="rounded-xl bg-black/35 px-2.5 py-2 border border-white/[0.06]">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5] truncate">
              Ausblick ST {data.nextMatchday}
            </div>
            <div className="text-xs sm:text-sm font-bold text-emerald-400 tabular-nums mt-0.5 truncate">
              {myRec?.alerts?.length > 0
                ? `${myRec.alerts.length} Kader-Hinweis${myRec.alerts.length > 1 ? 'e' : ''}`
                : `${data.fixtureRadar?.greenSchedule?.[0]?.team || 'Top-Spielplan'}`}
            </div>
          </div>
        </div>
      )}
    </button>
  );
};

const SectionTitle = ({ icon, eyebrow, title, accent = '#a855f7' }) => (
  <div className="mb-3.5">
    <div
      className="text-[10px] font-bold uppercase tracking-widest mb-0.5 flex items-center gap-1.5"
      style={{ color: accent }}
    >
      {icon}
      <span>{eyebrow}</span>
    </div>
    <h2 className="text-base sm:text-lg font-black uppercase tracking-wider text-white">
      {title}
    </h2>
  </div>
);

const PlayerMiniRow = ({ player, teamLogo, badge, badgeTone = 'emerald', onClick }) => {
  const rising = (player.predictedChange || 0) >= 0;
  const badgeClasses = {
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    red: 'bg-red-500/15 text-red-300 border-red-500/35',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
  };

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`card-surface rounded-xl p-3 flex items-center gap-3 transition-all ${
        onClick ? 'hover:border-purple-400/40 cursor-pointer active:scale-[0.99]' : ''
      }`}
    >
      {/* Team-Logo / Spielerbild */}
      <div className="relative w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
        {player.imageUrl ? (
          <img src={player.imageUrl} alt={player.fullName} className="w-full h-full object-cover object-top" />
        ) : teamLogo ? (
          <img src={teamLogo} alt={player.team} className="w-6 h-6 object-contain" />
        ) : (
          <span className="text-xs font-bold text-[#8b92a5]">{(player.name || '?').slice(0, 2)}</span>
        )}
      </div>

      {/* Mitte: Name + Position + Badges + Spielplan */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {player.position && (
            <span className="text-[9px] font-black" style={{ color: POS_COLORS[player.position] || '#8b92a5' }}>
              {player.position}
            </span>
          )}
          <span className="text-xs sm:text-[13px] font-bold text-white truncate">
            {player.fullName || player.name}
          </span>
          {player.team && (
            <span className="text-[10px] text-[#8b92a5] truncate">· {player.team}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {badge && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeClasses[badgeTone] || badgeClasses.emerald}`}>
              {badge}
            </span>
          )}
          {player.startElfProbability != null && (
            <StartProbBadge prob={player.startElfProbability} variant="compact" />
          )}
          {Array.isArray(player.nextFixtures) && player.nextFixtures.length > 0 && (
            <span className="text-[9px] text-[#8b92a5] tabular-nums">
              {player.nextFixtures.join(' · ')}
            </span>
          )}
        </div>
      </div>

      {/* Rechts: MW + Prognose */}
      <div className="text-right shrink-0">
        <div className="text-xs font-bold text-white tabular-nums">
          {formatMoney(player.marketValue)}
        </div>
        {player.predictedChange !== 0 && (
          <div className={`text-[10px] font-bold tabular-nums ${rising ? 'text-emerald-400' : 'text-[#ff5c3e]'}`}>
            {formatMoneySigned(player.predictedChange)} /1T
          </div>
        )}
        {player.avgPoints != null && (
          <div className="text-[9px] text-[#8b92a5] tabular-nums">
            Ø {player.avgPoints} Pkt
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Vollstaendige Weekly-Summary-Ansicht im Newsfeed (aktuell Admin-only).
 */
const WeeklySummaryView = () => {
  const { isAdmin, profile } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [transferScope, setTransferScope] = useState('mine'); // 'mine' | 'league' | 'all'
  const [showAllBalances, setShowAllBalances] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadWeeklySummary().then((res) => {
      if (!cancelled) {
        setData(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Standard-Manager: eigener verknuepfter Kickbase-Account, sonst erster Manager
  const effectiveManagerId = useMemo(() => {
    if (selectedManagerId) return selectedManagerId;
    const ownId = profile?.kickbaseId ? String(profile.kickbaseId) : null;
    if (ownId && data?.recap?.byManagerId?.[ownId]) return ownId;
    return data?.managers?.[0]?.id || '';
  }, [selectedManagerId, profile?.kickbaseId, data]);

  const activeManager = useMemo(
    () => (data?.managers || []).find((m) => m.id === effectiveManagerId) || null,
    [data, effectiveManagerId],
  );

  const openInAdvisor = (playerId) => {
    if (!isAdmin || !playerId) return;
    navigate(`/admin/advisor?playerId=${encodeURIComponent(String(playerId))}`, {
      state: { openPlayerId: String(playerId), returnOnClose: true },
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-44 rounded-2xl card-surface animate-pulse" />
        <div className="h-60 rounded-2xl card-surface animate-pulse" />
        <div className="h-60 rounded-2xl card-surface animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card-surface rounded-2xl p-6 text-center text-sm text-[#8b92a5]">
        Noch keine Weekly Summary vorhanden. Führe im Backend{' '}
        <code className="text-purple-300">node scripts/generate-weekly.js</code> aus.
      </div>
    );
  }

  const mdRecap = data.recap?.byManagerId?.[effectiveManagerId] || null;
  const myTransfers = data.transfers?.byManagerId?.[effectiveManagerId] || null;
  const myRecs = data.recommendations?.byManagerId?.[effectiveManagerId] || null;
  const activeLeagueKey = activeManager?.leagueKey || 'LIGA1';
  const activeLeagueTransfers = data.transfers?.byLeague?.[activeLeagueKey] || null;
  const teamLogos = data.teamLogos || {};

  const visibleTransferEvents =
    transferScope === 'mine'
      ? myTransfers?.events || []
      : transferScope === 'league'
        ? activeLeagueTransfers?.highlights || []
        : data.transfers?.recentGlobal || [];

  const leagueBalances = (data.transfers?.managerBalances || [])
    .filter((b) => showAllBalances || b.leagueKey === activeLeagueKey)
    .sort((a, b) => b.realizedProfit - a.realizedProfit);

  return (
    <div className="space-y-8 pb-6">
      {/* 1. Hero / Editorial Kopf + Admin-Manager-Switcher */}
      <section className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-[#191026] via-[#120d1a] to-[#0a0a0d] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-400/40">
              <Sparkles size={11} />
              Admin-Vorschau
            </span>
            <span className="text-[11px] font-semibold text-[#8b92a5] tabular-nums">
              {data.editionLabel}
            </span>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.05] text-[#8b92a5] border border-white/10">
            {data.hasAiCommentary ? 'KI-Redaktion' : 'Auto-Analyse'}
          </span>
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug mb-2">
          {data.editorial?.headline}
        </h2>
        <p className="text-sm text-gray-300 leading-relaxed">
          {data.editorial?.intro}
        </p>

        {/* Admin-Perspektive umschalten */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-purple-200 font-semibold">
            <UserCheck size={14} className="text-purple-400 shrink-0" />
            <span>Ansicht testen als Manager:</span>
          </div>
          <select
            value={effectiveManagerId}
            onChange={(e) => setSelectedManagerId(e.target.value)}
            aria-label="Manager-Perspektive wählen"
            className="bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-purple-400"
          >
            {['LIGA1', 'LIGA2', 'LIGA3'].map((lgKey) => {
              const members = (data.managers || []).filter((m) => m.leagueKey === lgKey);
              if (members.length === 0) return null;
              return (
                <optgroup key={lgKey} label={members[0].leagueName}>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (#{m.rank}){profile?.kickbaseId === m.id ? ' · Du' : ''}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        {/* 3 Persoenliche Schnell-KPIs */}
        {mdRecap && (
          <div className="grid grid-cols-3 gap-2.5 mt-4">
            <div className="rounded-xl bg-black/45 border border-white/10 p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5]">
                Spieltag {data.matchday}
              </div>
              <div className="text-base sm:text-lg font-extrabold text-white tabular-nums mt-0.5">
                {formatPts(mdRecap.matchdayPoints)}
              </div>
              <div
                className={`text-[10px] font-semibold tabular-nums mt-0.5 ${
                  mdRecap.diffToLeagueAvg >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'
                }`}
              >
                {mdRecap.diffToLeagueAvg >= 0 ? '+' : ''}
                {formatPts(mdRecap.diffToLeagueAvg)} vs. Ø · #{mdRecap.matchdayRankInLeague}
              </div>
            </div>

            <div className="rounded-xl bg-black/45 border border-white/10 p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5]">
                Trade-Bilanz (7T)
              </div>
              <div
                className={`text-base sm:text-lg font-extrabold tabular-nums mt-0.5 ${
                  (myTransfers?.realizedProfit || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'
                }`}
              >
                {myTransfers?.realizedCount > 0
                  ? formatMoneySigned(myTransfers.realizedProfit)
                  : '0 €'}
              </div>
              <div className="text-[10px] text-[#8b92a5] tabular-nums mt-0.5">
                {myTransfers?.buyCount || 0} K / {myTransfers?.sellCount || 0} V
              </div>
            </div>

            <div className="rounded-xl bg-black/45 border border-white/10 p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5]">
                Kader-Check
              </div>
              <div
                className={`text-base sm:text-lg font-extrabold tabular-nums mt-0.5 ${
                  (myRecs?.injuredCount || 0) > 0 ? 'text-[#ff5c3e]' : 'text-emerald-400'
                }`}
              >
                {myRecs?.alerts?.length || 0} Hinweis{(myRecs?.alerts?.length || 0) === 1 ? '' : 'e'}
              </div>
              <div className="text-[10px] text-[#8b92a5] tabular-nums mt-0.5">
                {myRecs?.injuredCount || 0} verletzt · {myRecs?.affordablePicks?.length || 0} Picks
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* SEKTION 1: SPIELTAGS-ZUSAMMENFASSUNG                                  */}
      {/* ===================================================================== */}
      <section>
        <SectionTitle
          icon={<Flame size={12} />}
          eyebrow={`Rückblick · Spieltag ${data.matchday}`}
          title="Spieltags-Zusammenfassung"
          accent="#ff5c3e"
        />

        {/* Persoenliche Spieltagskarte */}
        {mdRecap && (
          <div className="card-surface rounded-2xl p-4 mb-4 border-l-2" style={{ borderLeftColor: mdRecap.leagueColor || '#ff5c3e' }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b92a5]">
                  {mdRecap.leagueName} · {mdRecap.name}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-lg font-extrabold text-white tabular-nums">
                    Platz {mdRecap.rank}
                  </span>
                  {mdRecap.rankDelta !== 0 && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                        mdRecap.rankDelta > 0
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-[#ff5c3e]'
                      }`}
                    >
                      {mdRecap.rankDelta > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {Math.abs(mdRecap.rankDelta)}
                    </span>
                  )}
                  <span className="text-xs text-[#8b92a5] tabular-nums">
                    ({formatPts(mdRecap.totalPoints)} Pkt gesamt)
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-[#8b92a5]">Gesamt-ST-Rang</div>
                <div className="text-sm font-bold text-white tabular-nums">
                  #{mdRecap.overallMatchdayRank} / {mdRecap.totalParticipants}
                </div>
              </div>
            </div>

            {/* Abstaende */}
            <div className="flex flex-wrap gap-2 text-[11px] text-gray-300 mb-3">
              {mdRecap.gapToAbove != null && (
                <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 tabular-nums">
                  Auf #{mdRecap.rank - 1} ({mdRecap.aboveName}): <strong className="text-white">-{formatPts(mdRecap.gapToAbove)} Pkt</strong>
                </span>
              )}
              {mdRecap.gapToBelow != null && (
                <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 tabular-nums">
                  Vorsprung auf #{mdRecap.rank + 1} ({mdRecap.belowName}): <strong className="text-emerald-400">+{formatPts(mdRecap.gapToBelow)} Pkt</strong>
                </span>
              )}
            </div>

            {/* Top-Starter & Flops */}
            {(mdRecap.topPlayers?.length > 0 || mdRecap.flopPlayers?.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-white/10">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
                    Deine Top-Scorer (ST {data.matchday})
                  </div>
                  <div className="space-y-1">
                    {mdRecap.topPlayers.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-200 truncate">
                          {p.name} <span className="text-[#8b92a5] text-[10px]">({p.team})</span>
                        </span>
                        <span className="font-bold text-emerald-400 tabular-nums shrink-0 ml-2">
                          {p.points} Pkt
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {mdRecap.flopPlayers?.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#ff5c3e] mb-1.5">
                      Schwächste Starter
                    </div>
                    <div className="space-y-1">
                      {mdRecap.flopPlayers.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-300 truncate">
                            {p.name} <span className="text-[#8b92a5] text-[10px]">({p.team})</span>
                          </span>
                          <span className="font-bold text-[#ff5c3e] tabular-nums shrink-0 ml-2">
                            {p.points} Pkt
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3 Ligen im Ueberblick */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {(data.recap?.leagues || []).map((lg) => {
            const take = (data.editorial?.leagueTakes || []).find((t) => t.leagueKey === lg.key);
            const isOwnLeague = lg.key === activeLeagueKey;
            return (
              <div
                key={lg.key}
                className={`card-surface rounded-2xl p-3.5 flex flex-col justify-between ${
                  isOwnLeague ? 'border-white/25' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className="text-xs font-black uppercase tracking-wider"
                      style={{ color: lg.color }}
                    >
                      {lg.name}
                    </span>
                    <span className="text-[10px] text-[#8b92a5] tabular-nums">
                      Ø {formatPts(lg.avgPoints)} Pkt
                    </span>
                  </div>

                  {take?.text && (
                    <p className="text-xs text-gray-300 leading-relaxed mb-3">
                      {take.text}
                    </p>
                  )}
                </div>

                <div className="space-y-1 pt-2.5 border-t border-white/10">
                  {(lg.top3Matchday || []).map((u, idx) => (
                    <div key={u.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-200 truncate">
                        <span className="text-[#8b92a5] mr-1.5 tabular-nums">{idx + 1}.</span>
                        {u.name}
                      </span>
                      <span className="font-bold text-white tabular-nums shrink-0 ml-2">
                        {formatPts(u.points)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bundesliga MVP + Optimale Elf Banner */}
        {data.recap?.mvpPlayer && (
          <div className="card-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2">
              <Trophy size={15} className="text-amber-400 shrink-0" />
              <span className="text-gray-300">
                Spieltags-MVP:{' '}
                <strong className="text-white">
                  {data.recap.mvpPlayer.name} ({data.recap.mvpPlayer.team})
                </strong>{' '}
                mit <strong className="text-amber-400 tabular-nums">{data.recap.mvpPlayer.points} Pkt</strong>
              </span>
            </div>
            {data.recap.optimalTeamPoints && (
              <span className="text-[11px] text-[#8b92a5] tabular-nums">
                Optimale Elf: {formatPts(data.recap.optimalTeamPoints)} Pkt
              </span>
            )}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* SEKTION 2: TRANSFERUEBERSICHT & BILANZ (7 TAGE)                       */}
      {/* ===================================================================== */}
      <section>
        <SectionTitle
          icon={<ArrowLeftRight size={12} />}
          eyebrow={`Transfermarkt · Letzte ${data.transfers?.windowDays || 7} Tage`}
          title="Transferübersicht & Bilanz"
          accent="#10b981"
        />

        {data.editorial?.transferTake && (
          <p className="text-sm text-gray-300 leading-relaxed mb-4">
            {data.editorial.transferTake}
          </p>
        )}

        {/* Eigene Wochen-Bilanz + Liga-Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <div className="card-surface rounded-xl p-3">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5]">
              Ausgaben ({activeManager?.name})
            </div>
            <div className="text-sm sm:text-base font-bold text-[#ff5c3e] tabular-nums mt-0.5">
              -{formatMoney(myTransfers?.spent || 0)}
            </div>
            <div className="text-[10px] text-[#8b92a5] tabular-nums">
              {myTransfers?.buyCount || 0} Käufe
              {myTransfers?.avgOverpayPct != null ? ` · Ø +${myTransfers.avgOverpayPct}%` : ''}
            </div>
          </div>

          <div className="card-surface rounded-xl p-3">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5]">
              Einnahmen
            </div>
            <div className="text-sm sm:text-base font-bold text-emerald-400 tabular-nums mt-0.5">
              +{formatMoney(myTransfers?.received || 0)}
            </div>
            <div className="text-[10px] text-[#8b92a5] tabular-nums">
              {myTransfers?.sellCount || 0} Verkäufe
            </div>
          </div>

          <div className="card-surface rounded-xl p-3">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5]">
              Netto-Cashflow
            </div>
            <div
              className={`text-sm sm:text-base font-bold tabular-nums mt-0.5 ${
                (myTransfers?.netBalance || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'
              }`}
            >
              {formatMoneySigned(myTransfers?.netBalance || 0)}
            </div>
            <div className="text-[10px] text-[#8b92a5]">Einnahmen − Ausgaben</div>
          </div>

          <div className="card-surface rounded-xl p-3">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5]">
              Realisierter Gewinn
            </div>
            <div
              className={`text-sm sm:text-base font-bold tabular-nums mt-0.5 ${
                (myTransfers?.realizedProfit || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'
              }`}
            >
              {myTransfers?.realizedCount > 0 ? formatMoneySigned(myTransfers.realizedProfit) : '–'}
            </div>
            <div className="text-[10px] text-[#8b92a5] tabular-nums">
              {myTransfers?.realizedCount || 0} abgeschlossene Flips
            </div>
          </div>
        </div>

        {/* Manager-Bilanz-Tabelle */}
        <div className="card-surface rounded-2xl overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-200">
              Wochen-Bilanz ({showAllBalances ? 'Alle 3 Ligen' : activeManager?.leagueName || 'Liga 1'})
            </span>
            <button
              type="button"
              onClick={() => setShowAllBalances((v) => !v)}
              className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              {showAllBalances ? 'Nur meine Liga' : 'Alle 26 Manager'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#8b92a5]">Manager</th>
                  <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#8b92a5] text-center">K/V</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#8b92a5] text-right">Netto</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#8b92a5] text-right">Realisiert</th>
                </tr>
              </thead>
              <tbody>
                {leagueBalances.map((row) => {
                  const isSelected = row.managerId === effectiveManagerId;
                  return (
                    <tr
                      key={row.managerId}
                      className={`border-b border-white/[0.05] last:border-b-0 ${
                        isSelected ? 'bg-purple-500/10' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="px-3 py-2 font-semibold text-white whitespace-nowrap">
                        {row.managerName}
                        {showAllBalances && (
                          <span className="ml-1.5 text-[10px] text-[#8b92a5] font-normal">
                            ({row.leagueName})
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center text-[#8b92a5] tabular-nums whitespace-nowrap">
                        {row.buyCount}/{row.sellCount}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap ${
                          row.netBalance > 0
                            ? 'text-emerald-400'
                            : row.netBalance < 0
                              ? 'text-[#ff5c3e]'
                              : 'text-[#8b92a5]'
                        }`}
                      >
                        {row.buyCount + row.sellCount > 0 ? formatMoneySigned(row.netBalance) : '–'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap ${
                          row.realizedCount === 0
                            ? 'text-[#626978]'
                            : row.realizedProfit >= 0
                              ? 'text-emerald-400'
                              : 'text-[#ff5c3e]'
                        }`}
                      >
                        {row.realizedCount > 0 ? formatMoneySigned(row.realizedProfit) : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Einzel-Transfers der Woche mit Scope-Filter */}
        <div className="card-surface rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-200">
              Transfer-Ticker der Woche
            </span>
            <div className="flex items-center gap-1">
              {[
                { id: 'mine', label: 'Meine' },
                { id: 'league', label: activeManager?.leagueName || 'Liga' },
                { id: 'all', label: 'Alle' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTransferScope(tab.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                    transferScope === tab.id
                      ? 'bg-emerald-500 text-black'
                      : 'bg-white/[0.05] text-[#8b92a5] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {visibleTransferEvents.length === 0 ? (
            <div className="p-5 text-center text-xs text-[#8b92a5]">
              Keine Transfers in diesem Zeitraum.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05] max-h-80 overflow-y-auto">
              {visibleTransferEvents.map((ev) => {
                const isBuy = ev.type === 'buy';
                return (
                  <div key={ev.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span
                        className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                          isBuy
                            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {isBuy ? 'Kauf' : 'Verkauf'}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">
                          {ev.playerName}
                          {transferScope !== 'mine' && (
                            <span className="font-normal text-[#8b92a5]"> · {ev.managerName}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#8b92a5] flex items-center gap-1.5 flex-wrap tabular-nums">
                          <span>{formatShortDate(ev.date)}</span>
                          {transferScope === 'all' && <span>· {ev.leagueName}</span>}
                          {isBuy && ev.overpayPct != null && (
                            <span className={ev.overpayPct > 15 ? 'text-[#ff5c3e]' : 'text-gray-300'}>
                              · {ev.overpayPct >= 0 ? '+' : ''}{ev.overpayPct}% vs MW
                            </span>
                          )}
                          {!isBuy && ev.realizedProfit != null && (
                            <span className={ev.realizedProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-[#ff5c3e] font-semibold'}>
                              · Flip {formatMoneySigned(ev.realizedProfit)}
                              {ev.heldDays != null ? ` (${ev.heldDays}T)` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="font-bold text-white tabular-nums shrink-0">
                      {formatMoney(ev.price)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SEKTION 3: AUSBLICK & EMPFEHLUNGEN (NAECHSTE 3 SPIELTAGE)             */}
      {/* ===================================================================== */}
      <section>
        <SectionTitle
          icon={<Compass size={12} />}
          eyebrow={`Ausblick · ST ${(data.fixtureRadar?.upcomingMatchdays || []).map((m) => m.number).join(', ')}`}
          title="Spielplan-Radar & Empfehlungen"
          accent="#a855f7"
        />

        {data.editorial?.outlookTake && (
          <p className="text-sm text-gray-300 leading-relaxed mb-4">
            {data.editorial.outlookTake}
          </p>
        )}

        {/* Gruener Spielplan (Top 5) */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2.5">
            <TrendingUp size={13} />
            <span>Grüner Spielplan – interessante Teams für die nächsten {data.fixtureRadar?.upcomingMatchdays?.length || 3} Spieltage</span>
          </div>
          <div className="space-y-2.5">
            {(data.fixtureRadar?.greenSchedule || []).map((team) => (
              <div key={team.team} className="card-surface rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-2">
                    {teamLogos[team.team] && (
                      <img src={teamLogos[team.team]} alt={team.team} className="w-5 h-5 object-contain" />
                    )}
                    <span className="text-sm font-bold text-white">{team.team}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 tabular-nums">
                      {team.homeGames}× Heim · Diff {team.avgDifficulty}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(team.fixtures || []).map((f) => (
                      <span
                        key={f.matchday}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border tabular-nums ${difficultyPillClass(f.difficulty)}`}
                      >
                        {f.isHome ? 'H' : 'A'} {f.opponentShort}
                      </span>
                    ))}
                  </div>
                </div>

                {team.keyPlayers?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/[0.06]">
                    {team.keyPlayers.map((kp) => (
                      <button
                        key={kp.playerId}
                        type="button"
                        onClick={() => openInAdvisor(kp.playerId)}
                        className="inline-flex items-center gap-1.5 text-[11px] bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 rounded-lg px-2 py-1 text-gray-200 transition-colors cursor-pointer"
                      >
                        <span className="font-bold text-white">{kp.name}</span>
                        <span className="text-[#8b92a5] tabular-nums">Ø {kp.avgPoints ?? '–'}</span>
                        {kp.predictedChange > 0 && (
                          <span className="text-emerald-400 font-semibold tabular-nums">
                            {formatMoneySigned(kp.predictedChange)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Knackiges Programm (Vorsicht) */}
        {data.fixtureRadar?.toughSchedule?.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#ff5c3e] mb-2">
              <TrendingDown size={13} />
              <span>Knackiges Programm – kurzfristig vorsichtig sein</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.fixtureRadar.toughSchedule.map((team) => (
                <div key={team.team} className="card-surface rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {teamLogos[team.team] && (
                      <img src={teamLogos[team.team]} alt={team.team} className="w-4 h-4 object-contain shrink-0" />
                    )}
                    <span className="text-xs font-bold text-white truncate">{team.team}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(team.fixtures || []).map((f) => (
                      <span
                        key={f.matchday}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border tabular-nums ${difficultyPillClass(f.difficulty)}`}
                      >
                        {f.isHome ? 'H' : 'A'} {f.opponentShort}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Persoenlicher Kader-Check: Warnungen */}
        {myRecs && (
          <div className="mb-6">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                <AlertTriangle size={13} />
                <span>Kader-Hinweise für {activeManager?.name}</span>
              </div>
              {myRecs.availableBudget != null && (
                <span className="text-[11px] text-[#8b92a5] tabular-nums">
                  Verfügbar: <strong className="text-white">{formatMoney(myRecs.availableBudget)}</strong>
                </span>
              )}
            </div>

            {myRecs.alerts?.length > 0 ? (
              <div className="space-y-2">
                {myRecs.alerts.map((p) => (
                  <PlayerMiniRow
                    key={p.playerId}
                    player={p}
                    teamLogo={teamLogos[p.team]}
                    badge={p.sellReasonLabels?.[0] || p.statusLabel}
                    badgeTone={p.status !== 0 ? 'red' : 'amber'}
                    onClick={() => openInAdvisor(p.playerId)}
                  />
                ))}
              </div>
            ) : (
              <div className="card-surface rounded-xl p-3.5 text-xs text-emerald-300 flex items-center gap-2">
                <ShieldCheck size={15} className="shrink-0" />
                <span>Keine akuten Verletzungs- oder Verkaufssignale im aktuellen Kader.</span>
              </div>
            )}
          </div>
        )}

        {/* Markt-Empfehlungen fuer das eigene Budget */}
        {myRecs?.affordablePicks?.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-400">
                <Sparkles size={13} />
                <span>Markt-Empfehlungen ({activeManager?.leagueName})</span>
              </div>
              {data.recommendations?.advisorGeneratedAt && (
                <span className="text-[10px] text-[#8b92a5] tabular-nums">
                  Advisor-Stand {formatArticleDate(data.recommendations.advisorGeneratedAt.slice(0, 10))}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {myRecs.affordablePicks.map((p) => (
                <PlayerMiniRow
                  key={p.playerId}
                  player={p}
                  teamLogo={teamLogos[p.team]}
                  badge={p.playRecommended ? 'Startelf + Markt' : 'Trading-Chance'}
                  badgeTone="emerald"
                  onClick={() => openInAdvisor(p.playerId)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Wochen-Watchlist: Trend + Gruener Spielplan */}
        {data.recommendations?.watchlist?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-300 mb-2.5">
              <TrendingUp size={13} />
              <span>Wochen-Watchlist (Aufwärtstrend + Grüner Spielplan)</span>
            </div>
            <div className="space-y-2">
              {data.recommendations.watchlist.slice(0, 6).map((p) => (
                <PlayerMiniRow
                  key={p.playerId}
                  player={p}
                  teamLogo={teamLogos[p.team]}
                  badge={p.predictedChange7d ? `7T ${formatMoneySigned(p.predictedChange7d)}` : p.scheduleLabel}
                  badgeTone="purple"
                  onClick={() => openInAdvisor(p.playerId)}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default WeeklySummaryView;
