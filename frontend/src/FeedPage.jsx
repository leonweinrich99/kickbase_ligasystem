import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Newspaper, Trophy, TrendingUp, Flame, Clock, ArrowUpRight, BarChart3 } from 'lucide-react';
import PageHeader from './ui/PageHeader';
import { FEED_CATEGORIES, getCategoryMeta, formatArticleDate } from './feedMeta';

const CategoryIcon = ({ id, size = 13 }) => {
  if (id === 'spieltag') return <Flame size={size} />;
  if (id === 'pokal') return <Trophy size={size} />;
  if (id === 'trading') return <TrendingUp size={size} />;
  return <Newspaper size={size} />;
};

const FeedPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCat = searchParams.get('cat') || 'all';

  const [feedData, setFeedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/feed-articles.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('Feed konnte nicht geladen werden.');
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setFeedData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const articles = useMemo(() => feedData?.articles || [], [feedData]);
  const ticker = useMemo(() => feedData?.ticker || [], [feedData]);

  const counts = useMemo(() => {
    const map = { all: articles.length, spieltag: 0, pokal: 0, trading: 0 };
    articles.forEach((a) => {
      if (map[a.category] != null) map[a.category] += 1;
    });
    return map;
  }, [articles]);

  const filtered = useMemo(() => {
    if (activeCat === 'all') return articles;
    return articles.filter((a) => a.category === activeCat);
  }, [articles, activeCat]);

  const leadArticle = useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered.find((a) => a.featured) || filtered[0];
  }, [filtered]);

  const restArticles = useMemo(() => {
    if (!leadArticle) return [];
    return filtered.filter((a) => a.slug !== leadArticle.slug);
  }, [filtered, leadArticle]);

  const setCategory = (catId) => {
    if (catId === 'all') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ cat: catId }, { replace: true });
    }
  };

  const activeCategoryMeta = getCategoryMeta(activeCat);
  const isTradingView = activeCat === 'trading';

  return (
    <div className="min-h-screen bg-[#000000] text-white px-4 sm:px-6 pt-5 pb-12 max-w-3xl mx-auto">
      {/* Ebene-1 Header */}
      <div className="flex items-end justify-between gap-3 mb-4">
        <PageHeader
          eyebrow={isTradingView ? 'THE KICKBASE STREET JOURNAL' : 'REDAKTION & ANALYSEN'}
          accentColor={isTradingView ? '#10b981' : activeCat === 'pokal' ? '#f59e0b' : '#ff5c3e'}
          title={isTradingView ? 'TRADING NEWS' : activeCat === 'pokal' ? 'POKAL-CHRONIK' : activeCat === 'spieltag' ? 'SPIELTAGSBERICHTE' : 'NEWSFEED'}
        />
        {feedData?.updatedAt && (
          <div className="text-right shrink-0 pb-0.5">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-[#8b92a5]">Ausgabe</div>
            <div className="text-xs font-semibold text-gray-300 tabular-nums">
              {formatArticleDate(feedData.updatedAt.slice(0, 10))}
            </div>
          </div>
        )}
      </div>

      {/* Kategorie-Filter-Leiste */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 mb-4">
        {FEED_CATEGORIES.map((cat) => {
          const isActive = activeCat === cat.id;
          const activeClass =
            cat.id === 'all'
              ? 'bg-white text-black border-white'
              : cat.pillActiveClass;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer active:scale-95 ${
                isActive
                  ? activeClass
                  : 'bg-white/[0.04] border-white/10 text-gray-300 hover:bg-white/[0.09] hover:text-white'
              }`}
            >
              <CategoryIcon id={cat.id} size={13} />
              <span>{cat.label}</span>
              <span
                className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full leading-none ${
                  isActive ? 'bg-black/20' : 'bg-white/10 text-[#8b92a5]'
                }`}
              >
                {counts[cat.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Wall Street Journal Masthead + Market Ticker (bei Trading News & Alle) */}
      {(isTradingView || activeCat === 'all') && ticker.length > 0 && (
        <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-[#07110d] overflow-hidden">
          {isTradingView && (
            <div className="px-4 pt-3.5 pb-2.5 border-b border-emerald-500/15 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-emerald-400/80 mb-1">
                FINANCE · TRANSFERMARKT · MAKRO-ANALYSE
              </div>
              <div className="font-serif text-lg sm:text-xl font-bold tracking-wide text-[#f3efe6]">
                THE KICKBASE STREET JOURNAL
              </div>
            </div>
          )}
          <div className="flex items-center gap-4 overflow-x-auto no-scrollbar px-3.5 py-2.5">
            <div className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 pr-2 border-r border-white/10">
              <BarChart3 size={12} />
              <span>Markt-Ticker</span>
            </div>
            {ticker.map((item) => (
              <div key={item.label} className="shrink-0 flex items-center gap-1.5 text-[11px] whitespace-nowrap">
                <span className="text-[#8b92a5] font-medium uppercase tracking-wider text-[10px]">{item.label}</span>
                <span className={`font-bold tabular-nums ${item.positive ? 'text-emerald-400' : 'text-[#ff5c3e]'}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-64 rounded-2xl card-surface animate-pulse" />
          <div className="h-36 rounded-2xl card-surface animate-pulse" />
          <div className="h-36 rounded-2xl card-surface animate-pulse" />
        </div>
      )}

      {error && (
        <div className="card-surface rounded-2xl p-5 text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && leadArticle && (
        <div className="space-y-4">
          {/* Titelstory / Lead Article Card */}
          {(() => {
            const meta = getCategoryMeta(leadArticle.category);
            const isWsj = Boolean(meta.isWsj);
            return (
              <Link
                to={`/feed/${leadArticle.slug}`}
                state={{ fromCategory: activeCat }}
                className={`block rounded-2xl overflow-hidden transition-all active:scale-[0.99] border group ${
                  isWsj
                    ? 'bg-gradient-to-b from-[#0b1611] via-[#0a0f0d] to-[#08090a] border-emerald-500/25 hover:border-emerald-400/50'
                    : leadArticle.category === 'pokal'
                      ? 'bg-gradient-to-b from-[#1a1409] via-[#12100b] to-[#0b0b0c] border-amber-500/25 hover:border-amber-400/50'
                      : 'bg-gradient-to-b from-[#1b110f] via-[#121010] to-[#0b0b0c] border-[#ff5c3e]/25 hover:border-[#ff5c3e]/50'
                }`}
              >
                <div className="p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${meta.badgeClass}`}>
                      <CategoryIcon id={leadArticle.category} size={11} />
                      {leadArticle.kicker}
                    </span>
                    <span className="text-[11px] text-[#8b92a5] font-medium flex items-center gap-1 shrink-0">
                      <Clock size={11} />
                      {leadArticle.readTimeMin} Min.
                    </span>
                  </div>

                  {isWsj && (
                    <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-400/75 font-semibold mb-1.5">
                      The Kickbase Street Journal · Titelstory
                    </div>
                  )}

                  <h2
                    className={`text-xl sm:text-2xl font-bold leading-snug mb-2.5 group-hover:text-white transition-colors ${
                      isWsj ? 'font-serif text-[#f5f1e8] tracking-normal' : 'text-white tracking-tight'
                    }`}
                  >
                    {leadArticle.title}
                  </h2>

                  <p className="text-sm text-gray-300/90 leading-relaxed mb-4">
                    {leadArticle.subtitle}
                  </p>

                  {/* Hero KPI Ribbon */}
                  {Array.isArray(leadArticle.heroStats) && leadArticle.heroStats.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {leadArticle.heroStats.map((st) => (
                        <div
                          key={st.label}
                          className="rounded-xl bg-black/50 border border-white/10 px-2.5 py-2"
                        >
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8b92a5] truncate">
                            {st.label}
                          </div>
                          <div
                            className="text-sm sm:text-base font-bold tabular-nums mt-0.5 truncate"
                            style={{ color: meta.accent }}
                          >
                            {st.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                    <div className="text-[#8b92a5] font-medium">
                      {leadArticle.author} · {formatArticleDate(leadArticle.date)}
                    </div>
                    <span
                      className="inline-flex items-center gap-1 font-semibold group-hover:translate-x-0.5 transition-transform"
                      style={{ color: meta.accent }}
                    >
                      Artikel lesen
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })()}

          {/* Abschnitts-Trenner */}
          {restArticles.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#8b92a5]">
                {activeCat === 'all'
                  ? 'Weitere Artikel & Analysen'
                  : `Weitere ${activeCategoryMeta.label}`}
              </h3>
              <span className="text-[11px] text-[#8b92a5] tabular-nums">
                {restArticles.length} {restArticles.length === 1 ? 'Beitrag' : 'Beiträge'}
              </span>
            </div>
          )}

          {/* Weitere Einzelartikel als vollwertige Editorial-Karten */}
          <div className="space-y-3">
            {restArticles.map((article) => {
              const meta = getCategoryMeta(article.category);
              const isWsj = Boolean(meta.isWsj);
              return (
                <Link
                  key={article.slug}
                  to={`/feed/${article.slug}`}
                  state={{ fromCategory: activeCat }}
                  className={`block card-surface rounded-2xl p-4 sm:p-5 border-l-2 ${meta.borderAccent} hover:border-white/20 transition-all active:scale-[0.99] group`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${meta.badgeClass}`}>
                        <CategoryIcon id={article.category} size={10} />
                        {meta.shortLabel}
                      </span>
                      <span className="text-[10px] font-medium text-[#8b92a5] truncate">
                        {article.edition}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#8b92a5] flex items-center gap-1 shrink-0 tabular-nums">
                      <Clock size={10} />
                      {article.readTimeMin} Min.
                    </span>
                  </div>

                  <h3
                    className={`text-base sm:text-lg font-bold leading-snug mb-1.5 group-hover:text-white transition-colors ${
                      isWsj ? 'font-serif text-[#f3efe6]' : 'text-gray-100'
                    }`}
                  >
                    {article.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-[#a1a8b8] leading-relaxed line-clamp-2 mb-3">
                    {article.subtitle}
                  </p>

                  {/* Kompakte KPI-Pills */}
                  {Array.isArray(article.heroStats) && article.heroStats.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {article.heroStats.map((st) => (
                        <span
                          key={st.label}
                          className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/10"
                        >
                          <span className="text-[#8b92a5]">{st.label}:</span>
                          <span className="font-bold tabular-nums text-white">{st.value}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-[#8b92a5] pt-2 border-t border-white/[0.06]">
                    <span>{formatArticleDate(article.date)} · {article.author}</span>
                    <span
                      className="inline-flex items-center gap-0.5 font-semibold"
                      style={{ color: meta.accent }}
                    >
                      Lesen
                      <ArrowUpRight size={13} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedPage;
