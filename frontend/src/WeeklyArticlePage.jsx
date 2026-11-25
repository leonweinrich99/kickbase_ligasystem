import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarRange,
  Clock,
  Flame,
  ArrowLeftRight,
  Compass,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  UserCheck,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { formatArticleDate } from './feedMeta';
import StartProbBadge from './ui/StartProbBadge';

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

const tierPillClass = (tier) => {
  if (tier === 'easy') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (tier === 'hard') return 'bg-red-500/15 text-red-300 border-red-500/30';
  return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
};

const FormDots = ({ form = [] }) => {
  if (!Array.isArray(form) || form.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {form.map((res, idx) => (
        <span
          key={idx}
          className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-black ${
            res === 'S'
              ? 'bg-emerald-500/20 text-emerald-300'
              : res === 'U'
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-red-500/20 text-red-300'
          }`}
        >
          {res}
        </span>
      ))}
    </span>
  );
};

const CompactPlayerRow = ({ player, teamLogo, badge, badgeTone = 'emerald', onClick }) => {
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
      className={`card-surface rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-all ${
        onClick ? 'hover:border-purple-400/40 cursor-pointer active:scale-[0.99]' : ''
      }`}
    >
      <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
        {player.imageUrl ? (
          <img src={player.imageUrl} alt={player.fullName} className="w-full h-full object-cover object-top" />
        ) : teamLogo ? (
          <img src={teamLogo} alt={player.team} className="w-5 h-5 object-contain" />
        ) : (
          <span className="text-[11px] font-bold text-[#8b92a5]">{(player.name || '?').slice(0, 2)}</span>
        )}
      </div>

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
            <span className="text-[10px] text-[#8b92a5] truncate">
              · {player.team}{player.teamRank ? ` (#${player.teamRank})` : ''}
            </span>
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
          {player.nextOpponent && (
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border tabular-nums ${tierPillClass(player.nextOpponent.tier)}`}
            >
              {player.nextOpponent.isHome ? 'H' : 'A'} {player.nextOpponent.short}
              {player.nextOpponent.rank ? ` (#${player.nextOpponent.rank})` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-xs font-bold text-white tabular-nums">{formatMoney(player.marketValue)}</div>
        {player.predictedChange !== 0 && (
          <div className={`text-[10px] font-bold tabular-nums ${rising ? 'text-emerald-400' : 'text-[#ff5c3e]'}`}>
            {formatMoneySigned(player.predictedChange)}
          </div>
        )}
      </div>
    </div>
  );
};

const WeeklyArticlePage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromCategory = location.state?.fromCategory || null;
  const { isAdmin, profile } = useAuth();

  const [editions, setEditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [showAllDeals, setShowAllDeals] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/weekly-summary.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) {
          setEditions(Array.isArray(json?.editions) ? json.editions : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const edition = useMemo(
    () => editions.find((e) => e.slug === slug) || null,
    [editions, slug],
  );

  const otherEditions = useMemo(
    () => editions.filter((e) => e.slug !== slug).slice(0, 3),
    [editions, slug],
  );

  const effectiveManagerId = useMemo(() => {
    if (!edition) return '';
    if (selectedManagerId && edition.byManagerId?.[selectedManagerId]) return selectedManagerId;
    const ownId = profile?.kickbaseId ? String(profile.kickbaseId) : null;
    if (ownId && edition.byManagerId?.[ownId]) return ownId;
    return edition.managers?.[0]?.id || '';
  }, [edition, selectedManagerId, profile]);

  const handleBack = () => {
    if (fromCategory && fromCategory !== 'all') {
      navigate(`/feed?cat=${fromCategory}`);
    } else {
      navigate('/feed');
    }
  };

  const openInAdvisor = (playerId) => {
    if (!isAdmin || !playerId) return;
    navigate(`/admin/advisor?playerId=${encodeURIComponent(String(playerId))}`, {
      state: { openPlayerId: String(playerId), returnOnClose: true },
    });
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#000000] text-white px-4 pt-12 max-w-3xl mx-auto text-center">
        <p className="text-gray-400 mb-4 text-sm">Dieser Weekly-Artikel befindet sich aktuell noch in der Admin-Vorschau.</p>
        <button
          type="button"
          onClick={() => navigate('/feed')}
          className="px-4 py-2 rounded-full bg-white/10 text-sm font-semibold text-white hover:bg-white/20 cursor-pointer"
        >
          Zurück zum Newsfeed
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] text-white px-4 pt-6 max-w-3xl mx-auto">
        <div className="h-10 w-32 rounded-full card-surface animate-pulse mb-6" />
        <div className="h-44 rounded-2xl card-surface animate-pulse mb-4" />
        <div className="h-64 rounded-2xl card-surface animate-pulse" />
      </div>
    );
  }

  if (!edition) {
    return (
      <div className="min-h-screen bg-[#000000] text-white px-4 pt-10 max-w-3xl mx-auto text-center">
        <p className="text-gray-400 mb-4">Diese Weekly-Ausgabe wurde nicht gefunden.</p>
        <button
          type="button"
          onClick={() => navigate('/feed')}
          className="px-4 py-2 rounded-full bg-white/10 text-sm font-semibold text-white hover:bg-white/20 cursor-pointer"
        >
          Zurück zum Newsfeed
        </button>
      </div>
    );
  }

  const mgr = edition.byManagerId?.[effectiveManagerId] || null;
  const md = mgr?.matchday || null;
  const tr = mgr?.transfers || null;
  const out = mgr?.outlook || null;
  const teamLogos = edition.teamLogos || {};
  const visibleDeals = showAllDeals ? (tr?.events || []) : (tr?.events || []).slice(0, 5);
  const nextMds = (edition.formRadar?.upcomingMatchdays || []).map((m) => m.number);

  return (
    <div className="min-h-screen bg-[#000000] text-white pb-14">
      {/* Sticky Zurueck-Leiste (identisch zu FeedArticlePage) */}
      <div className="sticky sticky-safe-top z-30 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-white active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Newsfeed</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-purple-500/15 text-purple-300 border-purple-400/35">
              <CalendarRange size={10} />
              Weekly
            </span>
            <span className="text-[11px] text-[#8b92a5] flex items-center gap-1 tabular-nums">
              <Clock size={11} />
              {edition.readTimeMin} Min.
            </span>
          </div>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
        {/* Artikel-Kopf */}
        <header className="mb-5">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-purple-400">
              {edition.kicker}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-400/30">
              Admin-Vorschau
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-white mb-2.5">
            {edition.title}
          </h1>

          <p className="text-sm sm:text-[15px] text-gray-300 leading-relaxed mb-4">
            {edition.subtitle}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-white/10">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#8b92a5]">
              <span className="font-semibold text-gray-200">{mgr?.managerName || edition.author}</span>
              <span>·</span>
              <span className="tabular-nums">{formatArticleDate(edition.date)}</span>
              <span>·</span>
              <span>{edition.hasAiCommentary ? 'KI-Redaktion' : 'Auto-Analyse'}</span>
            </div>

            {/* Kompakter Admin-Perspektiven-Umschalter */}
            <div className="flex items-center gap-1.5">
              <UserCheck size={13} className="text-purple-400 shrink-0" />
              <select
                value={effectiveManagerId}
                onChange={(e) => {
                  setSelectedManagerId(e.target.value);
                  setShowAllDeals(false);
                }}
                aria-label="Ansicht als Manager testen"
                className="bg-white/[0.05] border border-white/15 rounded-lg px-2 py-1 text-[11px] font-semibold text-white focus:outline-none focus:border-purple-400"
              >
                {['LIGA1', 'LIGA2', 'LIGA3'].map((lgKey) => {
                  const members = (edition.managers || []).filter((m) => m.leagueKey === lgKey);
                  if (members.length === 0) return null;
                  return (
                    <optgroup key={lgKey} label={members[0].leagueName}>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}{profile?.kickbaseId === m.id ? ' (Du)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          </div>
        </header>

        {/* Titelbild */}
        {edition.image && (
          <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden border border-white/10 mb-5 bg-[#0e0e10]">
            <img src={edition.image} alt={edition.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* 3 persoenliche Kennzahlen */}
        {mgr && (
          <div className="grid grid-cols-3 gap-2.5 mb-7">
            <div className="card-surface rounded-2xl px-3 py-3 text-center">
              <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-[#8b92a5] truncate">
                Spieltag {edition.matchday}
              </div>
              <div className="text-base sm:text-xl font-bold tabular-nums mt-0.5 text-white">
                {formatPts(md?.points)}
              </div>
              <div className={`text-[10px] font-semibold tabular-nums ${(md?.diffToAvg || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'}`}>
                {(md?.diffToAvg || 0) >= 0 ? '+' : ''}{formatPts(md?.diffToAvg)} vs. Ø
              </div>
            </div>

            <div className="card-surface rounded-2xl px-3 py-3 text-center">
              <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-[#8b92a5] truncate">
                Flips (Fr–Fr)
              </div>
              <div className={`text-base sm:text-xl font-bold tabular-nums mt-0.5 ${(tr?.realizedProfit || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'}`}>
                {tr?.realizedCount > 0 ? formatMoneySigned(tr.realizedProfit) : '0 €'}
              </div>
              <div className="text-[10px] text-[#8b92a5] tabular-nums">
                {tr?.buyCount || 0} K / {tr?.sellCount || 0} V
              </div>
            </div>

            <div className="card-surface rounded-2xl px-3 py-3 text-center">
              <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-[#8b92a5] truncate">
                Kader-Check
              </div>
              <div className={`text-base sm:text-xl font-bold tabular-nums mt-0.5 ${(out?.injuredCount || 0) > 0 ? 'text-[#ff5c3e]' : 'text-emerald-400'}`}>
                {out?.squadAlerts?.length || 0} Hinweis{(out?.squadAlerts?.length || 0) === 1 ? '' : 'e'}
              </div>
              <div className="text-[10px] text-[#8b92a5] tabular-nums">
                {out?.injuredCount || 0} verletzt
              </div>
            </div>
          </div>
        )}

        {mgr && (
          <div className="space-y-7">
            {/* ============================================================= */}
            {/* 1. DEIN SPIELTAG (nur dieser Manager, nur dieser Spieltag)    */}
            {/* ============================================================= */}
            <section className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Flame size={16} className="text-[#ff5c3e] shrink-0" />
                <span>Dein Spieltag {edition.matchday}</span>
                <span className="text-[11px] font-semibold text-[#8b92a5] tabular-nums ml-auto">
                  #{md?.matchdayRank} von {md?.leagueSize} ({mgr.leagueName})
                </span>
              </h2>

              {md?.note && (
                <p className="text-sm sm:text-[15px] text-gray-200/95 leading-relaxed">
                  {md.note}
                </p>
              )}

              {(md?.topPlayers?.length > 0 || md?.flopPlayers?.length > 0) && (
                <div className="card-surface rounded-2xl p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
                      Top-Scorer (Startelf)
                    </div>
                    <div className="space-y-1">
                      {md.topPlayers.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-200 truncate">
                            {p.name} {p.team && <span className="text-[#8b92a5] text-[10px]">({p.team})</span>}
                          </span>
                          <span className="font-bold text-emerald-400 tabular-nums ml-2 shrink-0">
                            {p.points} Pkt
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {md.flopPlayers?.length > 0 && (
                    <div className="sm:border-l sm:border-white/10 sm:pl-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#ff5c3e] mb-1.5">
                        Schwächste Startelf-Spieler
                      </div>
                      <div className="space-y-1">
                        {md.flopPlayers.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <span className="text-gray-300 truncate">
                              {p.name} {p.team && <span className="text-[#8b92a5] text-[10px]">({p.team})</span>}
                            </span>
                            <span className="font-bold text-[#ff5c3e] tabular-nums ml-2 shrink-0">
                              {p.points} Pkt
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ============================================================= */}
            {/* 2. DEINE TRANSFERS & BILANZ (7 TAGE, NUR DIESER MANAGER)      */}
            {/* ============================================================= */}
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <ArrowLeftRight size={16} className="text-emerald-400 shrink-0" />
                  <span>Deine Transfers</span>
                </h2>
                <span className="text-[11px] font-semibold text-[#8b92a5] tabular-nums">
                  {tr?.windowLabel || edition.transferWindow?.label || 'Fr 20:30 – Fr 20:30'}
                  {tr?.avgOverpayPct != null ? ` · Ø +${tr.avgOverpayPct}%` : ''}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="card-surface rounded-xl px-3 py-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-[#8b92a5] font-semibold">Ausgaben</div>
                  <div className="text-sm font-bold text-[#ff5c3e] tabular-nums mt-0.5">
                    -{formatMoney(tr?.spent || 0)}
                  </div>
                  <div className="text-[10px] text-[#8b92a5] tabular-nums">{tr?.buyCount || 0} Käufe</div>
                </div>

                <div className="card-surface rounded-xl px-3 py-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-[#8b92a5] font-semibold">Einnahmen</div>
                  <div className="text-sm font-bold text-emerald-400 tabular-nums mt-0.5">
                    +{formatMoney(tr?.received || 0)}
                  </div>
                  <div className="text-[10px] text-[#8b92a5] tabular-nums">{tr?.sellCount || 0} Verkäufe</div>
                </div>

                <div className="card-surface rounded-xl px-3 py-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-[#8b92a5] font-semibold">Netto</div>
                  <div className={`text-sm font-bold tabular-nums mt-0.5 ${(tr?.netBalance || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'}`}>
                    {formatMoneySigned(tr?.netBalance || 0)}
                  </div>
                  <div className="text-[10px] text-[#8b92a5]">Cashflow</div>
                </div>

                <div className="card-surface rounded-xl px-3 py-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-[#8b92a5] font-semibold">Realisiert</div>
                  <div className={`text-sm font-bold tabular-nums mt-0.5 ${(tr?.realizedProfit || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'}`}>
                    {tr?.realizedCount > 0 ? formatMoneySigned(tr.realizedProfit) : '–'}
                  </div>
                  <div className="text-[10px] text-[#8b92a5] tabular-nums">
                    {tr?.bestFlip ? `Top: ${tr.bestFlip.playerName}` : `${tr?.realizedCount || 0} Flips`}
                  </div>
                </div>
              </div>

              {visibleDeals.length > 0 ? (
                <div className="card-surface rounded-2xl overflow-hidden">
                  <div className="divide-y divide-white/[0.05]">
                    {visibleDeals.map((ev) => {
                      const isBuy = ev.type === 'buy';
                      return (
                        <div key={ev.id} className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 flex items-center gap-2">
                            <span
                              className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                isBuy
                                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {isBuy ? 'K' : 'V'}
                            </span>
                            <span className="font-semibold text-white truncate">{ev.playerName}</span>
                            <span className="text-[10px] text-[#8b92a5] tabular-nums shrink-0">{formatShortDate(ev.date)}</span>
                            {isBuy && ev.overpayPct != null && (
                              <span className={`text-[10px] tabular-nums shrink-0 ${ev.overpayPct > 15 ? 'text-[#ff5c3e]' : 'text-[#8b92a5]'}`}>
                                ({ev.overpayPct >= 0 ? '+' : ''}{ev.overpayPct}%)
                              </span>
                            )}
                            {!isBuy && ev.realizedProfit != null && (
                              <span className={`text-[10px] font-semibold tabular-nums shrink-0 ${ev.realizedProfit >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'}`}>
                                {formatMoneySigned(ev.realizedProfit)}
                              </span>
                            )}
                          </div>
                          <span className="font-bold text-gray-200 tabular-nums shrink-0">
                            {formatMoney(ev.price)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {(tr?.events?.length || 0) > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDeals((v) => !v)}
                      className="w-full py-2 border-t border-white/10 text-[11px] font-bold text-[#8b92a5] hover:text-white flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {showAllDeals ? (
                        <>
                          <span>Weniger anzeigen</span>
                          <ChevronUp size={13} />
                        </>
                      ) : (
                        <>
                          <span>Alle {tr.events.length} Deals anzeigen</span>
                          <ChevronDown size={13} />
                        </>
                      )}
                    </button>
                  )}
                </div>
              ) : (
                <div className="card-surface rounded-xl px-3.5 py-2.5 text-xs text-[#8b92a5]">
                  Keine eigenen Transfers im Zeitraum {tr?.windowLabel || 'Fr 20:30 – Fr 20:30'}.
                </div>
              )}
            </section>

            {/* ============================================================= */}
            {/* 3. FORM-AUSBLICK & EMPFEHLUNGEN (TABELLE + 5-SPIELE-FORM)     */}
            {/* ============================================================= */}
            <section className="space-y-4">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Compass size={16} className="text-purple-400 shrink-0" />
                <span>Ausblick & Empfehlungen (ST {nextMds.join('–')})</span>
              </h2>

              {out?.note && (
                <p className="text-sm sm:text-[15px] text-gray-200/95 leading-relaxed">
                  {out.note}
                </p>
              )}

              {/* Kader-Hinweise (Verletzt / Verkauf) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    Dein Kader-Check
                  </span>
                  {out?.availableBudget != null && (
                    <span className="text-[11px] text-[#8b92a5] tabular-nums">
                      Budget: <strong className="text-white">{formatMoney(out.availableBudget)}</strong>
                    </span>
                  )}
                </div>

                {out?.squadAlerts?.length > 0 ? (
                  <div className="space-y-1.5">
                    {out.squadAlerts.map((p) => (
                      <CompactPlayerRow
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
                  <div className="card-surface rounded-xl px-3.5 py-2.5 text-xs text-emerald-300 flex items-center gap-2">
                    <ShieldCheck size={14} className="shrink-0" />
                    <span>Alle Kaderspieler fit und ohne akutes Verkaufssignal.</span>
                  </div>
                )}
              </div>

              {/* Bezahlbare Markt-Empfehlungen aus der eigenen Liga */}
              {out?.marketPicks?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 mb-2">
                    <Sparkles size={12} />
                    Interessant auf deinem Markt ({mgr.leagueName})
                  </div>
                  <div className="space-y-1.5">
                    {out.marketPicks.map((p) => (
                      <CompactPlayerRow
                        key={p.playerId}
                        player={p}
                        teamLogo={teamLogos[p.team]}
                        badge={p.playRecommended ? 'Startelf + Trend' : 'Trading-Trend'}
                        badgeTone="emerald"
                        onClick={() => openInAdvisor(p.playerId)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Form- & Tabellen-Check (begruendet ueber echte Bundesliga-Tabelle + 5-Spiele-Form) */}
              {edition.formRadar?.hotTeams?.length > 0 && (
                <div className="card-surface rounded-2xl p-4 space-y-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-300 mb-1">
                      Form & Tabellen-Trend (nächste {nextMds.length} Spieltage)
                    </div>
                    {edition.formSummary && (
                      <p className="text-xs text-gray-300 leading-relaxed">
                        {edition.formSummary}
                      </p>
                    )}
                  </div>

                  {/* Top 3 Form-Teams */}
                  <div className="space-y-2.5 pt-1">
                    {edition.formRadar.hotTeams.map((t) => (
                      <div key={t.team} className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                          <div className="flex items-center gap-2">
                            {teamLogos[t.team] && (
                              <img src={teamLogos[t.team]} alt={t.team} className="w-4 h-4 object-contain" />
                            )}
                            <span className="text-xs font-bold text-white">{t.team}</span>
                            {t.rank != null && (
                              <span className="text-[10px] font-semibold text-emerald-300 tabular-nums">
                                Platz {t.rank} · {t.points} Pkt
                              </span>
                            )}
                          </div>
                          <FormDots form={t.form} />
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                          {(t.fixtures || []).map((f) => (
                            <span
                              key={f.matchday}
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border tabular-nums ${tierPillClass(f.tier)}`}
                            >
                              {f.isHome ? 'H' : 'A'} {f.opponentShort}
                              {f.opponentRank ? ` (#${f.opponentRank})` : ''}
                            </span>
                          ))}
                        </div>

                        {t.reason && (
                          <p className="text-[11px] text-[#a1a8b8] leading-snug">{t.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Vorsicht-Teams kompakt */}
                  {edition.formRadar.toughTeams?.length > 0 && (
                    <div className="pt-2 border-t border-white/10">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#ff5c3e] mb-1.5">
                        Schwache Form / schweres Programm
                      </div>
                      <div className="space-y-1.5">
                        {edition.formRadar.toughTeams.slice(0, 2).map((t) => (
                          <div key={t.team} className="text-[11px] text-gray-300 flex items-start justify-between gap-2">
                            <span>
                              <strong className="text-white">{t.team}</strong>
                              {t.rank != null ? ` (#${t.rank})` : ''}: {t.toughReason}
                            </span>
                            <FormDots form={t.form} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Weitere Weekly-Ausgaben */}
        {otherEditions.length > 0 && (
          <div className="mt-9 pt-6 border-t border-white/10">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#8b92a5] mb-3">
              Ältere Weekly-Ausgaben
            </h3>
            <div className="space-y-2">
              {otherEditions.map((rel) => (
                <Link
                  key={rel.slug}
                  to={`/feed/weekly/${rel.slug}`}
                  state={{ fromCategory }}
                  className="block card-surface rounded-2xl p-3.5 hover:border-white/20 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                      {rel.edition}
                    </span>
                    <ArrowUpRight size={13} className="text-[#8b92a5]" />
                  </div>
                  <div className="text-sm font-bold text-white leading-snug">{rel.title}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
};

export default WeeklyArticlePage;
