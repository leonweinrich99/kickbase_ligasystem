import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db, isFirebaseConfigured } from './firebase';
import { APP_SECTIONS, getBerlinDateKey } from './appAnalytics';
import { formatRelativeTime, loadAllArticleStats } from './articleEngagement';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Flame,
  MessageCircle,
  Users,
} from './ui/icons';

function formatShortDay(dateKey) {
  if (!dateKey || dateKey.length < 10) return dateKey;
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}.`;
}

function getLastNDaysKeys(n) {
  const keys = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 86400000);
    keys.push(getBerlinDateKey(d));
  }
  return keys;
}

const CustomChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="bg-[#121318] border border-white/15 rounded-xl px-3 py-2 text-xs shadow-2xl">
      <div className="font-bold text-white mb-1">{row?.fullDate || label}</div>
      <div className="text-emerald-400 font-semibold tabular-nums">
        {row?.dau ?? 0} aktive Manager
      </div>
      <div className="text-[#8b92a5] tabular-nums">
        {row?.pageViews ?? 0} Seitenaufrufe
      </div>
    </div>
  );
};

const AdminAnalyticsCard = ({ users = [] }) => {
  const [rangeDays, setRangeDays] = useState(7);
  const [dailyDocs, setDailyDocs] = useState([]);
  const [articleStatsMap, setArticleStatsMap] = useState({});
  const [feedArticles, setFeedArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rulesHint, setRulesHint] = useState(false);

  // Aufklappbare Leserliste pro Artikel
  const [expandedSlug, setExpandedSlug] = useState(null);
  const [readersBySlug, setReadersBySlug] = useState({});
  const [loadingSlug, setLoadingSlug] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      setLoading(true);
      const [dailyRes, statsMap, feedRes] = await Promise.all([
        (async () => {
          if (!isFirebaseConfigured || !db) return { docs: [], denied: false };
          try {
            const q = query(collection(db, 'analytics_daily'), orderBy('date', 'desc'), limit(14));
            const snap = await getDocs(q);
            return { docs: snap.docs.map((d) => ({ id: d.id, ...d.data() })), denied: false };
          } catch {
            return { docs: [], denied: true };
          }
        })(),
        loadAllArticleStats(),
        fetch('/feed-articles.json', { cache: 'no-cache' })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => (Array.isArray(j?.articles) ? j.articles : []))
          .catch(() => []),
      ]);

      if (!cancelled) {
        setDailyDocs(dailyRes.docs);
        setRulesHint(dailyRes.denied);
        setArticleStatsMap(statsMap);
        setFeedArticles(feedRes);
        setLoading(false);
      }
    };

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const approvedUsers = useMemo(
    () => users.filter((u) => u.status === 'approved'),
    [users]
  );

  const dailyByDate = useMemo(() => {
    const map = new Map();
    dailyDocs.forEach((d) => map.set(d.date || d.id, d));
    return map;
  }, [dailyDocs]);

  const todayKey = useMemo(() => getBerlinDateKey(), []);
  const rangeKeys = useMemo(() => getLastNDaysKeys(rangeDays), [rangeDays]);
  const last7Keys = useMemo(() => getLastNDaysKeys(7), []);

  // KPIs
  const kpis = useMemo(() => {
    const todayDoc = dailyByDate.get(todayKey);
    const dauToday = Array.isArray(todayDoc?.activeUids) ? todayDoc.activeUids.length : 0;

    const wauSet = new Set();
    let totalViewsRange = 0;
    last7Keys.forEach((k) => {
      const d = dailyByDate.get(k);
      if (Array.isArray(d?.activeUids)) {
        d.activeUids.forEach((id) => wauSet.add(id));
      }
    });
    rangeKeys.forEach((k) => {
      const d = dailyByDate.get(k);
      totalViewsRange += Number(d?.totalPageViews || 0);
    });

    const usersWithPlatform = approvedUsers.filter((u) => Boolean(u.platform));
    const pwaUsers = usersWithPlatform.filter((u) => String(u.platform).includes('PWA'));
    const pwaPct = usersWithPlatform.length > 0
      ? Math.round((pwaUsers.length / usersWithPlatform.length) * 100)
      : null;

    let totalComments = 0;
    let totalReactions = 0;
    Object.values(articleStatsMap).forEach((st) => {
      totalComments += st.commentsCount || 0;
      totalReactions += st.reactionsCount || 0;
    });

    return {
      dauToday,
      wau: wauSet.size,
      totalViewsRange,
      pwaCount: pwaUsers.length,
      trackedUsers: usersWithPlatform.length,
      pwaPct,
      totalComments,
      totalReactions,
    };
  }, [dailyByDate, todayKey, last7Keys, rangeKeys, approvedUsers, articleStatsMap]);

  // Chart-Daten fuer 7 / 14 Tage
  const chartData = useMemo(
    () =>
      rangeKeys.map((k) => {
        const d = dailyByDate.get(k);
        return {
          day: formatShortDay(k),
          fullDate: formatShortDay(k),
          dau: Array.isArray(d?.activeUids) ? d.activeUids.length : 0,
          pageViews: Number(d?.totalPageViews || 0),
        };
      }),
    [rangeKeys, dailyByDate]
  );

  // Bereichsnutzung ueber den ausgewaehlten Zeitraum
  const sectionRows = useMemo(() => {
    const totals = {};
    rangeKeys.forEach((k) => {
      const secs = dailyByDate.get(k)?.sections || {};
      Object.entries(secs).forEach(([secId, val]) => {
        totals[secId] = (totals[secId] || 0) + Number(val || 0);
      });
    });

    const sumAll = Object.values(totals).reduce((a, b) => a + b, 0);
    return APP_SECTIONS
      .map((s) => ({
        ...s,
        views: totals[s.id] || 0,
        pct: sumAll > 0 ? Math.round(((totals[s.id] || 0) / sumAll) * 100) : 0,
      }))
      .filter((s) => s.views > 0)
      .sort((a, b) => b.views - a.views);
  }, [rangeKeys, dailyByDate]);

  // Plattform-Verteilung aus User-Profilen
  const platformBreakdown = useMemo(() => {
    const counts = {};
    approvedUsers.forEach((u) => {
      if (!u.platform) return;
      counts[u.platform] = (counts[u.platform] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [approvedUsers]);

  // Artikel-Performance (Top-Artikel inkl. neuester Artikel)
  const articleRows = useMemo(() => {
    return feedArticles
      .map((a) => {
        const st = articleStatsMap[a.slug] || {
          viewsCount: 0,
          readThroughCount: 0,
          commentsCount: 0,
          reactionsCount: 0,
        };
        const readRate = st.viewsCount > 0
          ? Math.min(100, Math.round((st.readThroughCount / st.viewsCount) * 100))
          : 0;
        return {
          slug: a.slug,
          title: a.title,
          date: a.date,
          category: a.category,
          ...st,
          readRate,
        };
      })
      .sort((a, b) => {
        const scoreA = a.viewsCount * 10 + a.commentsCount * 5 + a.reactionsCount * 2;
        const scoreB = b.viewsCount * 10 + b.commentsCount * 5 + b.reactionsCount * 2;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return String(b.date || '').localeCompare(String(a.date || ''));
      })
      .slice(0, 12);
  }, [feedArticles, articleStatsMap]);

  // Aktivste & inaktive Manager
  const sortedByActivity = useMemo(() => {
    const toMs = (ts) => {
      if (!ts) return 0;
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      const t = new Date(ts).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    return [...approvedUsers].sort((a, b) => toMs(b.lastActiveAt) - toMs(a.lastActiveAt));
  }, [approvedUsers]);

  const toggleArticleReaders = async (slug) => {
    if (expandedSlug === slug) {
      setExpandedSlug(null);
      return;
    }
    setExpandedSlug(slug);
    if (readersBySlug[slug]) return;

    setLoadingSlug(slug);
    try {
      const q = query(collection(db, 'articles', slug, 'views'), orderBy('lastSeenAt', 'desc'));
      const snap = await getDocs(q);
      setReadersBySlug((prev) => ({
        ...prev,
        [slug]: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      }));
    } catch {
      setReadersBySlug((prev) => ({ ...prev, [slug]: [] }));
    } finally {
      setLoadingSlug(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl card-surface animate-pulse" />
          ))}
        </div>
        <div className="h-56 rounded-2xl card-surface animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {rulesHint && (
        <div className="card-surface rounded-2xl px-4 py-3 text-xs text-amber-300 border border-amber-500/30">
          Hinweis: Für Live-Analytics und Artikel-Statistiken müssen die aktualisierten{' '}
          <code className="text-white">firestore.rules</code> einmalig in Firebase veröffentlicht werden.
        </div>
      )}

      {/* 1. KPI-Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="card-surface rounded-2xl p-3.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#8b92a5]">
            <span>Heute aktiv</span>
            <Activity size={13} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white tabular-nums mt-1">
            {kpis.dauToday}
            <span className="text-xs font-semibold text-[#8b92a5]"> / {approvedUsers.length}</span>
          </div>
          <div className="text-[10px] text-[#8b92a5] mt-0.5">Eindeutige Manager (DAU)</div>
        </div>

        <div className="card-surface rounded-2xl p-3.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#8b92a5]">
            <span>7 Tage aktiv</span>
            <Users size={13} className="text-sky-400" />
          </div>
          <div className="text-2xl font-black text-white tabular-nums mt-1">
            {kpis.wau}
            <span className="text-xs font-semibold text-[#8b92a5]"> / {approvedUsers.length}</span>
          </div>
          <div className="text-[10px] text-[#8b92a5] mt-0.5 tabular-nums">
            {kpis.totalViewsRange} Aufrufe ({rangeDays}T)
          </div>
        </div>

        <div className="card-surface rounded-2xl p-3.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#8b92a5]">
            <span>PWA-Quote</span>
            <Flame size={13} className="text-[#ff5c3e]" />
          </div>
          <div className="text-2xl font-black text-white tabular-nums mt-1">
            {kpis.pwaPct != null ? `${kpis.pwaPct} %` : '–'}
          </div>
          <div className="text-[10px] text-[#8b92a5] mt-0.5 tabular-nums">
            {kpis.pwaCount} von {kpis.trackedUsers} erfassten Nutzern
          </div>
        </div>

        <div className="card-surface rounded-2xl p-3.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#8b92a5]">
            <span>Interaktionen</span>
            <MessageCircle size={13} className="text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white tabular-nums mt-1">
            {kpis.totalComments + kpis.totalReactions}
          </div>
          <div className="text-[10px] text-[#8b92a5] mt-0.5 tabular-nums">
            {kpis.totalComments} Komm. · {kpis.totalReactions} Reakt.
          </div>
        </div>
      </div>

      {/* 2. Aktivitaets-Chart (7 / 14 Tage) */}
      <div className="card-surface rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-1.5">
              <BarChart3 size={14} className="text-[#ff5c3e]" />
              <span>Aktive Manager pro Tag</span>
            </h3>
            <p className="text-[11px] text-[#8b92a5] mt-0.5">
              Eindeutige eingeloggte Nutzer je Kalendertag (MEZ)
            </p>
          </div>
          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg p-0.5">
            {[7, 14].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRangeDays(d)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors ${
                  rangeDays === d ? 'bg-[#ff5c3e] text-white' : 'text-[#8b92a5] hover:text-white'
                }`}
              >
                {d}T
              </button>
            ))}
          </div>
        </div>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="day"
                tick={{ fill: '#8b92a5', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#8b92a5', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="dau" fill="#ff5c3e" radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Genutzte Bereiche + Plattformen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-surface rounded-2xl p-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-white mb-3">
            Beliebteste Bereiche ({rangeDays} Tage)
          </h3>
          {sectionRows.length === 0 ? (
            <p className="text-xs text-[#8b92a5]">Noch keine Seitenaufrufe protokolliert.</p>
          ) : (
            <div className="space-y-2.5">
              {sectionRows.map((s) => (
                <div key={s.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-gray-200">{s.label}</span>
                    <span className="text-[11px] text-[#8b92a5] tabular-nums">
                      <strong className="text-white">{s.views}</strong> ({s.pct} %)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(4, s.pct)}%`, backgroundColor: s.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-surface rounded-2xl p-4 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-white mb-3">
              Plattformen & Aktivitäts-Check
            </h3>
            {platformBreakdown.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {platformBreakdown.map(([plat, cnt]) => (
                  <span
                    key={plat}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full border tabular-nums ${
                      plat.includes('PWA')
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-white/[0.05] text-gray-300 border-white/10'
                    }`}
                  >
                    {plat}: {cnt}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#8b92a5] mb-4">
                Plattformdaten füllen sich automatisch beim nächsten Öffnen der App.
              </p>
            )}

            <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b92a5] mb-2">
              Zuletzt aktive Manager
            </div>
            <div className="divide-y divide-white/[0.05] max-h-52 overflow-y-auto">
              {sortedByActivity.slice(0, 12).map((u) => {
                const isToday = u.lastActiveDay === todayKey;
                return (
                  <div key={u.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isToday ? 'bg-emerald-400' : u.lastActiveAt ? 'bg-amber-400/70' : 'bg-zinc-600'
                        }`}
                      />
                      <span className="font-semibold text-gray-100 truncate">
                        {u.kickbaseName || u.displayName || u.email}
                      </span>
                      {u.platform && (
                        <span className="text-[9px] text-[#8b92a5] shrink-0 hidden sm:inline">
                          {u.platform}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#8b92a5] tabular-nums shrink-0">
                      {u.lastActiveAt ? formatRelativeTime(u.lastActiveAt) : 'noch nicht erfasst'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Artikel-Performance mit aufklappbarer Admin-Leserliste */}
      <div className="card-surface rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-white">
              Artikel-Performance & Leser
            </h3>
            <p className="text-[11px] text-[#8b92a5] mt-0.5">
              Tippe auf einen Artikel, um zu sehen, wer ihn gelesen hat
            </p>
          </div>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {articleRows.map((a) => {
            const isOpen = expandedSlug === a.slug;
            const readers = readersBySlug[a.slug] || [];
            return (
              <div key={a.slug}>
                <button
                  type="button"
                  onClick={() => toggleArticleReaders(a.slug)}
                  className="w-full px-4 py-3 text-left hover:bg-white/[0.03] transition-colors flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-[13px] font-bold text-white truncate">
                      {a.title}
                    </div>
                    <div className="text-[10px] text-[#8b92a5] mt-0.5 flex items-center gap-2 flex-wrap tabular-nums">
                      <span>{a.date}</span>
                      {a.readThroughCount > 0 && (
                        <span className="text-emerald-400">
                          {a.readThroughCount} durchgelesen ({a.readRate} %)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-xs tabular-nums">
                    <span className="inline-flex items-center gap-1 text-gray-200 font-bold" title="Eindeutige Leser">
                      <Eye size={12} className="text-sky-400" />
                      {a.viewsCount}
                    </span>
                    <span className="inline-flex items-center gap-1 text-gray-300 font-semibold" title="Kommentare">
                      <MessageCircle size={12} className="text-purple-400" />
                      {a.commentsCount}
                    </span>
                    <span className="inline-flex items-center gap-1 text-gray-300 font-semibold" title="Reaktionen">
                      <span>🔥</span>
                      {a.reactionsCount}
                    </span>
                    {isOpen ? (
                      <ChevronUp size={14} className="text-[#8b92a5]" />
                    ) : (
                      <ChevronDown size={14} className="text-[#8b92a5]" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-3.5 pt-1 bg-black/30 border-t border-white/[0.04]">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                        Leserliste ({readers.length})
                      </span>
                      <Link
                        to={`/feed/${a.slug}`}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:underline"
                      >
                        Artikel öffnen
                        <ArrowUpRight size={11} />
                      </Link>
                    </div>
                    {loadingSlug === a.slug ? (
                      <div className="text-xs text-[#8b92a5] py-1">Lade Leser...</div>
                    ) : readers.length === 0 ? (
                      <div className="text-xs text-[#8b92a5] py-1">Noch keine Leser protokolliert.</div>
                    ) : (
                      <div className="divide-y divide-white/[0.05] max-h-44 overflow-y-auto">
                        {readers.map((rd) => (
                          <div key={rd.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-gray-200 truncate">
                                {rd.kickbaseName || rd.displayName || 'Unbekannt'}
                              </span>
                              {rd.readThrough && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  <Check size={9} />
                                  Durchgelesen
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-[#8b92a5] tabular-nums shrink-0">
                              {rd.viewCount > 1 ? `${rd.viewCount}× · ` : ''}
                              {formatRelativeTime(rd.lastSeenAt || rd.firstSeenAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminAnalyticsCard;
