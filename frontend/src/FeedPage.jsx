import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Newspaper, Trophy, TrendingUp, Flame, Clock, BarChart3, ChevronRight, CalendarRange, Megaphone, Eye, MessageCircle } from './ui/icons';
import TabPageHeader from './ui/TabPageHeader';
import { getCategoryMeta, formatArticleDate, sortArticlesByDateDesc } from './feedMeta';
import { useAuth } from './AuthContext';
import { loadAllArticleStats } from './articleEngagement';
import newsLogo from './assets/news_logo.png';
import AdBanner from './ui/AdBanner';
import HotShotsSection from './ui/HotShotsSection';

const getArticlePath = (article) => article?.href || `/feed/${article?.slug}`;

const CategoryIcon = ({ id, size = 13 }) => {
  if (id === 'spieltag') return <Flame size={size} />;
  if (id === 'pokal') return <Trophy size={size} />;
  if (id === 'trading') return <TrendingUp size={size} />;
  if (id === 'allgemein') return <Megaphone size={size} />;
  if (id === 'weekly') return <CalendarRange size={size} />;
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

// Auto-scrollender UND nativ per Touch/Maus swipebarer Markt-Ticker:
// laeuft ruhig wie ein TV-Börsenticker durch, pausiert sofort beim Swipen/
// Ziehen/Scrollen und setzt nach kurzer Ruhephase exakt an der neuen Position
// nahtlos fort.
const SwipeableMarketTicker = ({ items }) => {
  const scrollerRef = useRef(null);
  const pausedRef = useRef(false);
  const visibleRef = useRef(true);
  const halfWidthRef = useRef(0);
  const resumeTimerRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startScrollLeft: 0 });
  const subPixelCarryRef = useRef(0);

  const pauseNow = () => {
    pausedRef.current = true;
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  };

  const scheduleResume = (delayMs = 2200) => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      subPixelCarryRef.current = 0;
      pausedRef.current = false;
    }, delayMs);
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !items || items.length === 0) return undefined;

    const measure = () => {
      halfWidthRef.current = el.scrollWidth / 2;
    };
    measure();

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }

    let io = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          visibleRef.current = Boolean(entries[0]?.isIntersecting);
        },
        { threshold: 0.01 },
      );
      io.observe(el);
    }

    let rafId = 0;
    let lastTs = performance.now();
    const SPEED_PX_PER_SEC = 28;

    const tick = (now) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;

      const halfWidth = halfWidthRef.current;
      if (halfWidth > 0 && visibleRef.current && !pausedRef.current) {
        subPixelCarryRef.current += SPEED_PX_PER_SEC * dt;
        const wholePx = Math.floor(subPixelCarryRef.current);
        if (wholePx >= 1) {
          const next = el.scrollLeft + wholePx;
          el.scrollLeft = next >= halfWidth ? next - halfWidth : next;
          subPixelCarryRef.current -= wholePx;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      io?.disconnect();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [items]);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const halfWidth = halfWidthRef.current || el.scrollWidth / 2;
    if (halfWidth > 0 && el.scrollLeft >= halfWidth) {
      el.scrollLeft -= halfWidth;
    }
  };

  const handlePointerDown = (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = scrollerRef.current;
    if (!el) return;
    pauseNow();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
    };
    el.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.active) return;
    const el = scrollerRef.current;
    if (!el) return;
    const dx = e.clientX - dragRef.current.startX;
    let next = dragRef.current.startScrollLeft - dx;
    const halfWidth = el.scrollWidth / 2;
    if (halfWidth > 0) {
      if (next < 0) {
        next += halfWidth;
        dragRef.current.startScrollLeft += halfWidth;
      } else if (next >= halfWidth) {
        next -= halfWidth;
        dragRef.current.startScrollLeft -= halfWidth;
      }
    }
    el.scrollLeft = next;
  };

  const endMouseDrag = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    scheduleResume(2000);
  };

  return (
    <div
      ref={scrollerRef}
      onScroll={handleScroll}
      onTouchStart={pauseNow}
      onTouchEnd={() => scheduleResume(2400)}
      onTouchCancel={() => scheduleResume(2400)}
      onMouseEnter={pauseNow}
      onMouseLeave={() => {
        dragRef.current.active = false;
        scheduleResume(1000);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endMouseDrag}
      onPointerCancel={endMouseDrag}
      onWheel={() => {
        pauseNow();
        scheduleResume(2200);
      }}
      className="flex-1 overflow-x-auto no-scrollbar select-none cursor-grab active:cursor-grabbing touch-pan-x"
      aria-label="Markt-Ticker (wischbar)"
    >
      <div className="flex w-max py-2 pl-4">
        <TickerTrackItems items={items} keyPrefix="a" />
        <TickerTrackItems items={items} keyPrefix="b" />
      </div>
    </div>
  );
};

// Owner-Wunsch 24.11.2026: "oben drei Hauptartikel zum Swipen, dann ein
// extra Bereich fuer Spieltagsberichte/Pokal/Trading zum Durchscrollen -
// wie bei anderen News-Anbietern". HeroCarousel ersetzt die bisherige
// EINE Titelstory auf dem "Alle"-Tab durch einen horizontalen Scroll-Snap-
// Swiper mit bis zu 3 Artikeln (die als "featured" markierten - je einer
// pro Kategorie) + Punkte-Indikator darunter, wie man es aus Apple
// News/App-Store-Karussells kennt.
const HeroCarousel = ({ articles, activeCat, articleStats = {} }) => {
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || el.children.length === 0) return;
    let closest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < el.children.length; i += 1) {
      const diff = Math.abs(el.children[i].offsetLeft - el.scrollLeft);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }
    setActiveIndex(closest);
  };

  const goTo = (i) => {
    const el = scrollRef.current;
    const child = el?.children?.[i];
    if (!el || !child) return;
    el.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
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
                    className={`oct-pill absolute top-3 left-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border backdrop-blur-md bg-black/65 ${meta.badgeClass}`}
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

                <div className="flex items-center gap-2 mt-3 text-[11px] text-[#8b92a5] flex-wrap">
                  <span className="tabular-nums">{formatArticleDate(article.date)}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock size={11} />
                    {article.readTimeMin} Min.
                  </span>
                  {articleStats[article.slug]?.viewsCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 tabular-nums text-gray-300">
                        <Eye size={11} />
                        {articleStats[article.slug].viewsCount}
                      </span>
                    </>
                  )}
                  {articleStats[article.slug]?.commentsCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 tabular-nums text-gray-300">
                        <MessageCircle size={11} />
                        {articleStats[article.slug].commentsCount}
                      </span>
                    </>
                  )}
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
              className={`oct-sm oct-bd-none h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/25'}`}
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
const CategoryShelf = ({ title, categoryId, articles, activeCat, accentColor, onSeeAll, articleStats = {} }) => {
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
              to={getArticlePath(article)}
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
                {articleStats[article.slug]?.viewsCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 tabular-nums ml-auto text-gray-300">
                    <Eye size={9} />
                    {articleStats[article.slug].viewsCount}
                  </span>
                )}
                {articleStats[article.slug]?.commentsCount > 0 && (
                  <span className={`inline-flex items-center gap-0.5 tabular-nums text-gray-300 ${articleStats[article.slug]?.viewsCount > 0 ? '' : 'ml-auto'}`}>
                    <MessageCircle size={9} />
                    {articleStats[article.slug].commentsCount}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

const FeedPage = () => {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawCat = searchParams.get('cat') || 'all';
  const activeCat = rawCat === 'weekly' && !isAdmin ? 'all' : rawCat;

  const [feedData, setFeedData] = useState(null);
  const [weeklyEditions, setWeeklyEditions] = useState([]);
  const [articleStats, setArticleStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadAllArticleStats().then((map) => {
      if (!cancelled) setArticleStats(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetch('/weekly-summary.json', { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && Array.isArray(json?.editions)) {
          setWeeklyEditions(
            json.editions.map((ed) => ({
              slug: ed.slug,
              href: `/feed/weekly/${ed.slug}`,
              category: 'weekly',
              date: ed.date,
              title: ed.title,
              subtitle: ed.subtitle,
              readTimeMin: ed.readTimeMin || 2,
              image: ed.image || '/feed-images/weekly-cover.svg',
            })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const baseArticles = useMemo(() => sortArticlesByDateDesc(feedData?.articles || []), [feedData]);
  const weeklyArticles = useMemo(
    () => (isAdmin ? sortArticlesByDateDesc(weeklyEditions) : []),
    [isAdmin, weeklyEditions],
  );
  const articles = useMemo(
    () => sortArticlesByDateDesc([...baseArticles, ...weeklyArticles]),
    [baseArticles, weeklyArticles],
  );
  const ticker = useMemo(() => feedData?.ticker || [], [feedData]);

  const filtered = useMemo(() => {
    if (activeCat === 'all') return articles;
    return articles.filter((a) => a.category === activeCat);
  }, [articles, activeCat]);

  const leadArticle = useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered[0];
  }, [filtered]);

  const restArticles = useMemo(() => {
    if (!leadArticle) return [];
    return filtered.filter((a) => a.slug !== leadArticle.slug);
  }, [filtered, leadArticle]);

  // "Alle"-Tab: immer die 5 neuesten Artikel oben im Swipe-Karussell,
  // darunter je Kategorie ein durchscrollbares Regal mit den uebrigen Artikeln.
  const heroArticles = useMemo(
    () => baseArticles.slice(0, 5),
    [baseArticles],
  );

  const heroSlugs = useMemo(() => new Set(heroArticles.map((a) => a.slug)), [heroArticles]);

  const shelves = useMemo(() => {
    const byCategory = (catId) => baseArticles.filter((a) => a.category === catId && !heroSlugs.has(a.slug));
    const list = [
      { id: 'spieltag', title: 'Spieltagsberichte', articles: byCategory('spieltag'), accentColor: '#ff5c3e' },
      { id: 'pokal', title: 'Pokal', articles: byCategory('pokal'), accentColor: '#f59e0b' },
      { id: 'trading', title: 'The Trading Journal', articles: byCategory('trading'), accentColor: '#10b981' },
      { id: 'allgemein', title: 'Allgemein', articles: byCategory('allgemein'), accentColor: '#38bdf8' },
    ];
    if (isAdmin && weeklyArticles.length > 0) {
      list.push({ id: 'weekly', title: 'Weekly', articles: weeklyArticles, accentColor: '#a855f7' });
    }
    return list;
  }, [baseArticles, heroSlugs, isAdmin, weeklyArticles]);

  const setCategory = (catId) => {
    if (catId === 'all') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ cat: catId }, { replace: true });
    }
  };

  const isTradingView = activeCat === 'trading';
  const isAllgemeinView = activeCat === 'allgemein';
  const isWeeklyView = activeCat === 'weekly' && isAdmin;

  return (
    <div className="min-h-screen bg-[#000000] text-white px-4 sm:px-6 pt-5 pb-12 max-w-3xl mx-auto">
      {/* Ebene-1 Header - einheitlicher, overflow-sicherer TabPageHeader */}
      <TabPageHeader
        bordered={false}
        className="mb-4"
        logo={<img src={newsLogo} alt="News Logo" className="w-full h-full object-contain" />}
        eyebrow={
          isWeeklyView
            ? 'ADMIN-VORSCHAU · WOCHENBERICHT'
            : isTradingView
              ? 'MARKET DESK & ANALYSEN'
              : isAllgemeinView
                ? 'LIGASYSTEM · UPDATES & SPECIALS'
                : 'REDAKTION & ANALYSEN'
        }
        accentColor={
          isWeeklyView
            ? '#a855f7'
            : isTradingView
              ? '#10b981'
              : isAllgemeinView
                ? '#38bdf8'
                : activeCat === 'pokal'
                  ? '#f59e0b'
                  : '#ff5c3e'
        }
        title={
          isWeeklyView
            ? 'WEEKLY SUMMARY'
            : isTradingView
              ? 'THE TRADING JOURNAL'
              : isAllgemeinView
                ? 'ALLGEMEIN'
                : activeCat === 'pokal'
                  ? 'POKAL-CHRONIK'
                  : activeCat === 'spieltag'
                    ? 'SPIELTAGSBERICHTE'
                    : 'NEWSFEED'
        }
        right={feedData?.updatedAt ? (
          <div className="text-right shrink-0 pb-0.5">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-[#8b92a5]">Ausgabe</div>
            <div className="text-xs font-semibold text-gray-300 tabular-nums whitespace-nowrap">
              {formatArticleDate(feedData.updatedAt.slice(0, 10))}
            </div>
          </div>
        ) : null}
      />

      {/* Wenn ueber "Alle ansehen" in eine Einzelkategorie gesprungen wurde, kompakte Rueckkehr */}
      {activeCat !== 'all' && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className="oct-pill inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-white/[0.05] border-white/15 text-gray-200 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer"
          >
            ← Alle News
          </button>
        </div>
      )}

      {/* Dauerhaft durchlaufender News-Sender-Marktticker (inkl. kompletter 26er-Trader-Rangliste) */}
      {ticker.length > 0 && (
        <div className="oct-md oct-bd-green mb-5 rounded-2xl border border-emerald-500/20 bg-[#07110d] overflow-hidden">
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
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full hex-beacon bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full hex-beacon h-2 w-2 bg-emerald-400" />
              </span>
              <BarChart3 size={11} />
              <span className="hidden sm:inline">Markt-Ticker</span>
            </div>

            {/* Sanfte Ein-/Ausblend-Kanten */}
            <div className="pointer-events-none absolute inset-y-0 left-[46px] sm:left-[126px] w-6 bg-gradient-to-r from-[#07110d] to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#07110d] to-transparent z-10" />

            {/* Nahtlos endlos durchlaufende UND per Touch/Maus wischbare Ticker-Spur */}
            <SwipeableMarketTicker items={ticker} />
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
          <HeroCarousel articles={heroArticles} activeCat={activeCat} articleStats={articleStats} />

          {/* Werbe-Easter-Egg als native "Anzeige" zwischen Karussell und
              Regalen (Owner-Wunsch 24.11.2026). */}
          <div className="mb-7">
            <AdBanner />
          </div>

          {shelves.map((shelf) => (
            <CategoryShelf
              key={shelf.id}
              title={shelf.title}
              categoryId={shelf.id}
              articles={shelf.articles}
              activeCat={activeCat}
              accentColor={shelf.accentColor}
              articleStats={articleStats}
              onSeeAll={() => setCategory(shelf.id)}
            />
          ))}

          <HotShotsSection />
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
                to={getArticlePath(leadArticle)}
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
                    to={getArticlePath(article)}
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

          {isTradingView && <HotShotsSection />}
        </div>
      )}
    </div>
  );
};

export default FeedPage;
