import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Flame, Trophy, TrendingUp, Newspaper, ArrowUpRight, Quote } from 'lucide-react';
import { getCategoryMeta, formatArticleDate, sortArticlesByDateDesc } from './feedMeta';
import AdBanner from './ui/AdBanner';

const CategoryIcon = ({ id, size = 12 }) => {
  if (id === 'spieltag') return <Flame size={size} />;
  if (id === 'pokal') return <Trophy size={size} />;
  if (id === 'trading') return <TrendingUp size={size} />;
  return <Newspaper size={size} />;
};

const FeedArticlePage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromCategory = location.state?.fromCategory || null;

  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/feed-articles.json', { cache: 'no-cache' })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setArticles(sortArticlesByDateDesc(json.articles || []));
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

  const article = useMemo(
    () => articles.find((a) => a.slug === slug) || null,
    [articles, slug],
  );

  const relatedArticles = useMemo(() => {
    if (!article) return [];
    const others = articles.filter((a) => a.slug !== article.slug);
    const sameCat = others.filter((a) => a.category === article.category);
    const diffCat = others.filter((a) => a.category !== article.category);
    return [...sameCat.slice(0, 2), ...diffCat.slice(0, 2)].slice(0, 3);
  }, [articles, article]);

  const handleBack = () => {
    if (fromCategory && fromCategory !== 'all') {
      navigate(`/feed?cat=${fromCategory}`);
    } else {
      navigate('/feed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] text-white px-4 pt-6 max-w-3xl mx-auto">
        <div className="h-10 w-32 rounded-full card-surface animate-pulse mb-6" />
        <div className="h-44 rounded-2xl card-surface animate-pulse mb-4" />
        <div className="h-64 rounded-2xl card-surface animate-pulse" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-[#000000] text-white px-4 pt-10 max-w-3xl mx-auto text-center">
        <p className="text-gray-400 mb-4">Dieser Artikel wurde nicht gefunden.</p>
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

  const meta = getCategoryMeta(article.category);
  const isWsj = Boolean(meta.isWsj);

  return (
    <div className="min-h-screen bg-[#000000] text-white pb-14">
      {/* Sticky Zurueck-Leiste unterhalb der iOS Safe-Area */}
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
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${meta.badgeClass}`}>
              <CategoryIcon id={article.category} size={10} />
              {meta.shortLabel}
            </span>
            <span className="text-[11px] text-[#8b92a5] flex items-center gap-1 tabular-nums">
              <Clock size={11} />
              {article.readTimeMin} Min.
            </span>
          </div>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
        {/* WSJ-Masthead bei Trading News */}
        {isWsj && (
          <div className="mb-5 border-y border-emerald-500/25 py-2.5 text-center">
            <div className="font-serif text-sm sm:text-base font-bold tracking-[0.14em] text-[#f3efe6]">
              THE TRADING JOURNAL
            </div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-400/85 mt-0.5">
              {article.edition} · {formatArticleDate(article.date)}
            </div>
          </div>
        )}

        {/* Artikel-Kopf */}
        <header className="mb-6">
          {!isWsj && (
            <div
              className="text-[11px] font-bold uppercase tracking-widest mb-2"
              style={{ color: meta.accent }}
            >
              {article.kicker}
            </div>
          )}

          <h1
            className={`text-2xl sm:text-3xl font-bold leading-tight mb-3 ${
              isWsj ? 'font-serif text-[#f5f1e8] tracking-normal' : 'text-white tracking-tight'
            }`}
          >
            {article.title}
          </h1>

          <p className="text-[15px] sm:text-base text-gray-300 leading-relaxed mb-4">
            {article.subtitle}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8b92a5] pb-4 border-b border-white/10">
            <span className="font-semibold text-gray-200">{article.author}</span>
            <span>·</span>
            <span className="tabular-nums">{formatArticleDate(article.date)}</span>
            <span>·</span>
            <span>{article.edition}</span>
          </div>
        </header>

        {/* Artikel-Titelbild */}
        {article.image && (
          <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden border border-white/10 mb-6 bg-[#0e0e10]">
            <img
              src={article.image}
              alt={article.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Kennzahlen-Leiste */}
        {Array.isArray(article.heroStats) && article.heroStats.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5 mb-7">
            {article.heroStats.map((st) => (
              <div
                key={st.label}
                className="card-surface rounded-2xl px-3 py-3 text-center"
              >
                <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-[#8b92a5] truncate">
                  {st.label}
                </div>
                <div
                  className="text-base sm:text-xl font-bold tabular-nums mt-1 truncate"
                  style={{ color: meta.accent }}
                >
                  {st.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Artikel-Sektionen (inkl. nativem Werbe-Easter-Egg zwischen den Abschnitten) */}
        <div className="space-y-7">
          {(article.sections || []).map((sec, idx, arr) => {
            const showAdAfter = arr.length >= 2 && idx === Math.floor((arr.length - 1) / 2);
            return (
              <React.Fragment key={idx}>
                <section className="space-y-3.5">
              {sec.heading && (
                <h2
                  className={`text-lg sm:text-xl font-bold leading-snug ${
                    isWsj ? 'font-serif text-[#f3efe6] border-b border-white/10 pb-1.5' : 'text-white'
                  }`}
                >
                  {sec.heading}
                </h2>
              )}

              {(sec.paragraphs || []).map((p, pIdx) => (
                <p
                  key={pIdx}
                  className="text-[15px] sm:text-[16px] text-gray-200/95 leading-[1.74]"
                >
                  {p}
                </p>
              ))}

              {/* Visuelle Karten-Galerie / Manager-Vergleich */}
              {sec.gallery && Array.isArray(sec.gallery.items) && sec.gallery.items.length > 0 && (
                <div className="card-surface rounded-2xl p-4 sm:p-5 my-4">
                  {sec.gallery.caption && (
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-200 mb-3">
                      {sec.gallery.caption}
                    </div>
                  )}
                  <div
                    className={`grid gap-3 sm:gap-4 ${
                      sec.gallery.items.length === 2
                        ? 'grid-cols-2'
                        : sec.gallery.items.length === 3
                          ? 'grid-cols-2 sm:grid-cols-3'
                          : 'grid-cols-2 sm:grid-cols-4'
                    }`}
                  >
                    {sec.gallery.items.map((item, gIdx) => (
                      <figure
                        key={gIdx}
                        className="flex flex-col items-center text-center bg-black/30 border border-white/[0.06] rounded-xl p-2.5 sm:p-3"
                      >
                        <img
                          src={item.src}
                          alt={item.alt || item.label || ''}
                          loading="lazy"
                          className="w-full max-w-[190px] h-auto object-contain select-none"
                        />
                        {item.label && (
                          <figcaption className="mt-2">
                            <div className="text-xs font-bold text-white leading-tight">{item.label}</div>
                            {item.sublabel && (
                              <div className="text-[11px] text-[#8b92a5] leading-snug mt-0.5">{item.sublabel}</div>
                            )}
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                </div>
              )}

              {/* Zitat / Pull-Quote */}
              {sec.quote && (
                <blockquote
                  className="my-4 rounded-r-2xl bg-white/[0.03] border-l-2 px-4 py-3.5"
                  style={{ borderLeftColor: meta.accent }}
                >
                  <div className="flex items-start gap-2.5">
                    <Quote size={16} className="shrink-0 mt-1 opacity-60" style={{ color: meta.accent }} />
                    <div>
                      <p className={`text-sm sm:text-[15px] italic text-gray-100 leading-relaxed ${isWsj ? 'font-serif' : ''}`}>
                        „{sec.quote.text}“
                      </p>
                      {sec.quote.attribution && (
                        <footer className="text-[11px] font-semibold text-[#8b92a5] mt-1.5">
                          — {sec.quote.attribution}
                        </footer>
                      )}
                    </div>
                  </div>
                </blockquote>
              )}

              {/* Eingebettete Daten-Tabelle */}
              {sec.table && (
                <div className="card-surface rounded-2xl overflow-hidden my-4">
                  {sec.table.caption && (
                    <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-200">
                        {sec.table.caption}
                      </span>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-[13px]">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.02]">
                          {sec.table.columns.map((col, cIdx) => (
                            <th
                              key={col}
                              className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#8b92a5] whitespace-nowrap ${
                                cIdx >= sec.table.columns.length - 1 ? 'text-right' : ''
                              }`}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sec.table.rows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className="border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.03]"
                          >
                            {row.map((cell, cIdx) => {
                              const cellStr = String(cell);
                              const isPositive = /^\+\d/.test(cellStr);
                              const isNegative = /^-\d/.test(cellStr);
                              const isLast = cIdx === row.length - 1;
                              return (
                                <td
                                  key={cIdx}
                                  className={`px-3 py-2.5 whitespace-nowrap tabular-nums ${
                                    isLast ? 'text-right font-semibold' : ''
                                  } ${
                                    cIdx === 0
                                      ? 'font-semibold text-white'
                                      : isPositive
                                        ? 'text-emerald-400 font-semibold'
                                        : isNegative
                                          ? 'text-[#ff5c3e] font-semibold'
                                          : 'text-gray-200'
                                  }`}
                                >
                                  {cell}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Fakten-Box / Callout */}
              {sec.callout && (
                <div className={`rounded-2xl border p-4 sm:p-5 ${meta.calloutClass}`}>
                  <div
                    className="text-xs font-bold uppercase tracking-wider mb-2.5"
                    style={{ color: meta.accent }}
                  >
                    {sec.callout.title}
                  </div>
                  <ul className="space-y-2">
                    {(sec.callout.items || []).map((item, iIdx) => (
                      <li key={iIdx} className="flex items-start gap-2 text-sm text-gray-200 leading-relaxed">
                        <span
                          className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: meta.accent }}
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
                </section>
                {showAdAfter && (
                  <div className="my-2">
                    <AdBanner key={`ad-${article.slug}`} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Tags */}
        {Array.isArray(article.tags) && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-8 pt-5 border-t border-white/10">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-medium text-[#8b92a5] bg-white/[0.04] border border-white/10 rounded-full px-2.5 py-0.5"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Weitere Artikel */}
        {relatedArticles.length > 0 && (
          <div className="mt-9 pt-6 border-t border-white/10">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#8b92a5] mb-3">
              Weiterlesen im Newsfeed
            </h3>
            <div className="space-y-2.5">
              {relatedArticles.map((rel) => {
                const relMeta = getCategoryMeta(rel.category);
                return (
                  <Link
                    key={rel.slug}
                    to={`/feed/${rel.slug}`}
                    state={{ fromCategory }}
                    className="block card-surface rounded-2xl p-3.5 hover:border-white/20 transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: relMeta.accent }}
                      >
                        {rel.kicker}
                      </span>
                      <ArrowUpRight size={13} className="text-[#8b92a5]" />
                    </div>
                    <div className={`text-sm font-bold text-white leading-snug ${relMeta.isWsj ? 'font-serif' : ''}`}>
                      {rel.title}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </article>
    </div>
  );
};

export default FeedArticlePage;
