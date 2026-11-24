import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Newspaper, Trophy, TrendingUp, Flame, Clock, BarChart3, ChevronRight } from 'lucide-react';
import PageHeader from './ui/PageHeader';
import { FEED_CATEGORIES, getCategoryMeta, formatArticleDate } from './feedMeta';
import newsLogo from './assets/news_logo.svg';

const CategoryIcon = ({ id, size = 13 }) => {
  if (id === 'spieltag') return <Flame size={size} />;
  if (id === 'pokal') return <Trophy size={size} />;
  if (id === 'trading') return <TrendingUp size={size} />;
  return <Newspaper size={size} />;
};

const TickerTrackItems = ({ items, keyPrefix }) => (
  <div className="flex items-center shrink-0">
    {items.map((item, idx) => (
      <div
        key={`${keyPrefix}-${idx}`}
        className="shrink-0 flex items-center gap-2 pr-5 mr-5 border-r border-white/10 text-[11px] whitespace-nowrap"
      >
        {item.tag && (
          <span
            className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
              item.tag.startsWith('TRADER')
                ? 'bg-emerald-500/15 text-emerald-300'
                : item.positive
                  ? 'bg-white/10 text-gray-300'
                  : 'bg-[#ff5c3e]/15 text-[#ff5c3e]'
            }`}
          >
            {item.tag}
          </span>
        )}
        <span className="text-gray-300 font-medium">{item.label}</span>
        <span
          className={`font-bold tabular-nums ${
            item.positive ? 'text-emerald-400' : 'text-[#ff5c3e]'
          }`}
        >
          {item.value}
        </span>
      </div>
    ))}
  </div>
);

// Owner-Wunsch 24.11.2026: "oben drei Hauptartikel zum Swipen, dann ein
// extra Bereich fuer Spieltagsberichte/Pokal/Trading zum Durchscrollen -
// wie bei anderen News-Anbietern". HeroCarousel ersetzt die bisherige
// EINE Titelstory auf dem "Alle"-Tab durch einen horizontalen Scroll-Snap-
// Swiper mit bis zu 3 Artikeln (die als "featured" markierten - je einer
// pro Kategorie) + Punkte-Indikator darunter, wie man es aus Apple
// News/App-Store-Karussells kennt.
const HeroCarousel = ({ articles, activeCat }) => {
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const goTo = (i) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  if (articles.length === 0) return null;

  return (
    <div className="mb-7">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth gap-4"
      >
        {articles.map((article) => {
          const meta = getCategoryMeta(article.category);
          const isWsj = Boolean(meta.isWsj);
          return (
            <Link
              key={article.slug}
              to={`/feed/${article.slug}`}
              state={{ fromCategory: activeCat }}
              className="shrink-0 w-full snap-center block card-surface rounded-2xl overflow-hidden hover:border-white/20 transition-all active:scale-[0.99] group"
            >
              {article.image && (
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#0e0e10]">
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />
                  <span
                    className={`absolute top-3 left-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border backdrop-blur-md bg-black/65 ${meta.badgeClass}`}
                  >
                    <CategoryIcon id={article.category} size={11} />
                    {meta.shortLabel}
                  </span>
                  <h2
                    className={`absolute inset-x-0 bottom-0 p-4 sm:p-5 text-lg sm:text-2xl font-bold leading-snug drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] group-hover:text-white transition-colors ${
                      isWsj ? 'font-serif text-[#f5f1e8] tracking-normal' : 'text-white tracking-tight'
                    }`}
                  >
                    {article.title}
                  </h2>
                </div>
              )}

              <div className="p-4 sm:p-5 pt-3">
                <p className="text-sm text-gray-300/90 leading-relaxed line-clamp-3">
                  {article.subtitle}
                </p>

                <div className="flex items-center gap-2 mt-3 text-[11px] text-[#8b92a5]">
                  <span className="tabular-nums">{formatArticleDate(article.date)}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock size={11} />
                    {article.readTimeMin} Min.
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {articles.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {articles.map((a, i) => (
            <button
              key={a.slug}
              type="button"
              aria-label={`Zu Artikel ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/25'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Horizontal durchscrollbares "Regal" je Kategorie unterhalb des Karussells
// (Spieltagsberichte / Pokal / The Trading Journal) - gleiches Prinzip wie
// die Themen-Reihen bei Apple News oder die "Mehr aus"-Leisten anderer
// News-Apps.
const CategoryShelf = ({ title, categoryId, articles, activeCat, accentColor, onSeeAll }) => {
  if (articles.length === 0) return null;
  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-1.5">
          <CategoryIcon id={categoryId} size={14} />
          {title}
        </h3>
        <button
          type="button"
          onClick={onSeeAll}
          className="flex items-center gap-0.5 text-xs font-bold shrink-0"
          style={{ color: accentColor }}
        >
          Alle ansehen
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="flex overflow-x-auto no-scrollbar gap-3 -mx-4 sm:-mx-6 px-4 sm:px-6">
        {articles.map((article) => {
          const meta = getCategoryMeta(article.category);
          const isWsj = Boolean(meta.isWsj);
          return (
            <Link
              key={article.slug}
              to={`/feed/${article.slug}`}
              state={{ fromCategory: activeCat }}
              className="shrink-0 w-[200px] sm:w-[220px] flex flex-col card-surface rounded-2xl overflow-hidden hover:border-white/20 transition-all active:scale-[0.97] group"
            >
              {article.image && (
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#0e0e10]">
                  <img
                    src={article.image}
                    alt={article.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                  <h4
                    className={`absolute inset-x-0 bottom-0 p-3 text-sm font-bold leading-snug drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${
                      isWsj ? 'font-serif text-[#f3efe6]' : 'text-gray-100'
                    }`}
                  >
                    {article.title}
                  </h4>
                </div>
              )}
              <div className="px-3 py-2 flex items-center gap-1.5 text-[10px] text-[#8b92a5]">
                <span className="tabular-nums">{formatArticleDate(article.date)}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock size={9} />
                  {article.readTimeMin} Min.
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
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

  // "Alle"-Tab: bis zu 3 "featured" Artikel (idealerweise einer je Kategorie)
  // oben im Swipe-Karussell, darunter je Kategorie ein durchscrollbares
  // Regal mit den uebrigen Artikeln dieser Kategorie.
  const heroArticles = useMemo(() => {
    const featured = articles.filter((a) => a.featured);
    if (featured.length >= 3) return featured.slice(0, 3);
    const rest = articles.filter((a) => !a.featured);
    return [...featured, ...rest].slice(0, 3);
  }, [articles]);

  const heroSlugs = useMemo(() => new Set(heroArticles.map((a) => a.slug)), [heroArticles]);

  const shelves = useMemo(() => {
    const byCategory = (catId) => articles.filter((a) => a.category === catId && !heroSlugs.has(a.slug));
    return [
      { id: 'spieltag', title: 'Spieltagsberichte', articles: byCategory('spieltag'), accentColor: '#ff5c3e' },
      { id: 'pokal', title: 'Pokal', articles: byCategory('pokal'), accentColor: '#f59e0b' },
      { id: 'trading', title: 'The Trading Journal', articles: byCategory('trading'), accentColor: '#10b981' },
    ];
  }, [articles, heroSlugs]);

  const setCategory = (catId) => {
    if (catId === 'all') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ cat: catId }, { replace: true });
    }
  };

  const isTradingView = activeCat === 'trading';

  return (
    <div className="min-h-screen bg-[#000000] text-white px-4 sm:px-6 pt-5 pb-12 max-w-3xl mx-auto">
      {/* Ebene-1 Header - gleiches Icon-Box-Format wie Liga/Pokal/Account
          (Owner-Wunsch 24.11.2026: "Header bei allen Tabs einheitlich"). */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img src={newsLogo} alt="News Logo" className="w-full h-full object-contain" />
          </div>
          <PageHeader
            eyebrow={isTradingView ? 'MARKET DESK & ANALYSEN' : 'REDAKTION & ANALYSEN'}
            accentColor={isTradingView ? '#10b981' : activeCat === 'pokal' ? '#f59e0b' : '#ff5c3e'}
            title={
              isTradingView
                ? 'THE TRADING JOURNAL'
                : activeCat === 'pokal'
                  ? 'POKAL-CHRONIK'
                  : activeCat === 'spieltag'
                    ? 'SPIELTAGSBERICHTE'
                    : 'NEWSFEED'
            }
          />
        </div>
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

      {/* Dauerhaft durchlaufender News-Sender-Marktticker (inkl. kompletter 26er-Trader-Rangliste) */}
      {ticker.length > 0 && (
        <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-[#07110d] overflow-hidden">
          {isTradingView && (
            <div className="px-4 pt-3 pb-2 border-b border-emerald-500/15 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-emerald-400/80 mb-0.5">
                FINANCE · TRANSFERMARKT · MAKRO-ANALYSE
              </div>
              <div className="font-serif text-lg sm:text-xl font-bold tracking-wide text-[#f3efe6]">
                THE TRADING JOURNAL
              </div>
            </div>
          )}
          <div className="relative flex items-center h-9 feed-marquee-wrap overflow-hidden">
            {/* Festes Live-Ticker-Label links */}
            <div className="relative z-20 shrink-0 h-full flex items-center gap-1.5 pl-3 pr-3.5 bg-[#07110d] border-r border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <BarChart3 size={11} />
              <span className="hidden sm:inline">Markt-Ticker</span>
            </div>

            {/* Sanfte Ein-/Ausblend-Kanten */}
            <div className="pointer-events-none absolute inset-y-0 left-[46px] sm:left-[126px] w-6 bg-gradient-to-r from-[#07110d] to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#07110d] to-transparent z-10" />

            {/* Nahtlos endlos durchlaufende Ticker-Spur (2x dupliziert) */}
            <div className="flex-1 overflow-hidden">
              <div className="feed-marquee-track py-2 pl-4">
                <TickerTrackItems items={ticker} keyPrefix="a" />
                <TickerTrackItems items={ticker} keyPrefix="b" />
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-72 rounded-2xl card-surface animate-pulse" />
          <div className="h-56 rounded-2xl card-surface animate-pulse" />
          <div className="h-56 rounded-2xl card-surface animate-pulse" />
        </div>
      )}

      {error && (
        <div className="card-surface rounded-2xl p-5 text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && activeCat === 'all' && (
        <div>
          <HeroCarousel articles={heroArticles} activeCat={activeCat} />
          {shelves.map((shelf) => (
            <CategoryShelf
              key={shelf.id}
              title={shelf.title}
              categoryId={shelf.id}
              articles={shelf.articles}
              activeCat={activeCat}
              accentColor={shelf.accentColor}
              onSeeAll={() => setCategory(shelf.id)}
            />
          ))}
        </div>
      )}

      {!loading && !error && activeCat !== 'all' && leadArticle && (
        <div className="space-y-4">
          {/* Titelstory: Grosses Bild + klare Headline + kurzer Teaser (ohne Schnickschnack) */}
          {(() => {
            const meta = getCategoryMeta(leadArticle.category);
            const isWsj = Boolean(meta.isWsj);
            return (
              <Link
                to={`/feed/${leadArticle.slug}`}
                state={{ fromCategory: activeCat }}
                className="block card-surface rounded-2xl overflow-hidden hover:border-white/20 transition-all active:scale-[0.99] group"
              >
                {leadArticle.image && (
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#0e0e10]">
                    <img
                      src={leadArticle.image}
                      alt={leadArticle.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />
                    <span
                      className={`absolute top-3 left-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border backdrop-blur-md bg-black/65 ${meta.badgeClass}`}
                    >
                      <CategoryIcon id={leadArticle.category} size={11} />
                      {meta.shortLabel}
                    </span>
                    {/* Headline ueberdeckt leicht den unteren Bildrand statt
                        erst darunter zu stehen (Owner-Wunsch 24.11.2026). */}
                    <h2
                      className={`absolute inset-x-0 bottom-0 p-4 sm:p-5 text-lg sm:text-2xl font-bold leading-snug drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] group-hover:text-white transition-colors ${
                        isWsj ? 'font-serif text-[#f5f1e8] tracking-normal' : 'text-white tracking-tight'
                      }`}
                    >
                      {leadArticle.title}
                    </h2>
                  </div>
                )}

                <div className="p-4 sm:p-5 pt-3">
                  <p className="text-sm text-gray-300/90 leading-relaxed line-clamp-3">
                    {leadArticle.subtitle}
                  </p>

                  <div className="flex items-center gap-2 mt-3 text-[11px] text-[#8b92a5]">
                    <span className="tabular-nums">{formatArticleDate(leadArticle.date)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock size={11} />
                      {leadArticle.readTimeMin} Min.
                    </span>
                  </div>
                </div>
              </Link>
            );
          })()}

          {/* Weitere Artikel: cleanes Karten-Layout mit Bild, Headline & kurzem Text */}
          {restArticles.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {restArticles.map((article) => {
                const meta = getCategoryMeta(article.category);
                const isWsj = Boolean(meta.isWsj);
                return (
                  <Link
                    key={article.slug}
                    to={`/feed/${article.slug}`}
                    state={{ fromCategory: activeCat }}
                    className="flex flex-col card-surface rounded-2xl overflow-hidden hover:border-white/20 transition-all active:scale-[0.99] group"
                  >
                    {article.image && (
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#0e0e10]">
                        <img
                          src={article.image}
                          alt={article.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                        <span
                          className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border backdrop-blur-md bg-black/65 ${meta.badgeClass}`}
                        >
                          <CategoryIcon id={article.category} size={10} />
                          {meta.shortLabel}
                        </span>
                        {/* Headline ueberdeckt leicht den unteren Bildrand
                            statt erst darunter zu stehen (Owner-Wunsch
                            24.11.2026). */}
                        <h3
                          className={`absolute inset-x-0 bottom-0 p-4 text-base font-bold leading-snug drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] group-hover:text-white transition-colors ${
                            isWsj ? 'font-serif text-[#f3efe6]' : 'text-gray-100'
                          }`}
                        >
                          {article.title}
                        </h3>
                      </div>
                    )}

                    <div className="p-4 pt-3 flex-1 flex flex-col justify-between">
                      <p className="text-xs text-[#a1a8b8] leading-relaxed line-clamp-2">
                        {article.subtitle}
                      </p>

                      <div className="flex items-center gap-2 mt-3 text-[11px] text-[#8b92a5]">
                        <span className="tabular-nums">{formatArticleDate(article.date)}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock size={10} />
                          {article.readTimeMin} Min.
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FeedPage;
