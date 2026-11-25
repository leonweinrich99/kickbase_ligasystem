// Gemeinsame Kategorie-Metadaten fuer FeedPage.jsx & FeedArticlePage.jsx
// (eigene .js-Datei fuer sauberes react-refresh).

export const FEED_CATEGORIES = [
  {
    id: 'all',
    label: 'Alle',
    shortLabel: 'Alle',
    accent: '#ff5c3e',
  },
  {
    id: 'spieltag',
    label: 'Spieltagsberichte',
    shortLabel: 'Spieltage',
    accent: '#ff5c3e',
    badgeClass: 'bg-[#ff5c3e]/15 text-[#ff5c3e] border-[#ff5c3e]/35',
    pillActiveClass: 'bg-[#ff5c3e] text-white border-[#ff5c3e]',
    borderAccent: 'border-l-[#ff5c3e]',
    calloutClass: 'bg-[#ff5c3e]/10 border-[#ff5c3e]/30',
  },
  {
    id: 'pokal',
    label: 'Pokal',
    shortLabel: 'Pokal',
    accent: '#f59e0b',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-400/35',
    pillActiveClass: 'bg-amber-500 text-black border-amber-400',
    borderAccent: 'border-l-amber-400',
    calloutClass: 'bg-amber-500/10 border-amber-400/30',
  },
  {
    id: 'trading',
    label: 'The Trading Journal',
    shortLabel: 'Trading Journal',
    accent: '#10b981',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-400/35',
    pillActiveClass: 'bg-emerald-500 text-black border-emerald-400',
    borderAccent: 'border-l-emerald-400',
    calloutClass: 'bg-emerald-500/10 border-emerald-400/30',
    isWsj: true,
  },
  {
    id: 'weekly',
    label: 'Weekly',
    shortLabel: 'Weekly',
    accent: '#a855f7',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-400/35',
    pillActiveClass: 'bg-purple-500 text-white border-purple-400',
    borderAccent: 'border-l-purple-400',
    calloutClass: 'bg-purple-500/10 border-purple-400/30',
    adminOnly: true,
  },
];

export const getCategoryMeta = (categoryId) =>
  FEED_CATEGORIES.find((c) => c.id === categoryId) || FEED_CATEGORIES[1];

export const formatArticleDate = (isoDate) => {
  if (!isoDate) return '';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
};

// Sortiert Artikel absteigend nach ISO-Datum (neueste zuerst), bei gleichem
// Datum kommen "featured"-Artikel zuerst und die bestehende Reihenfolge bleibt stabil.
export const sortArticlesByDateDesc = (articles) => {
  if (!Array.isArray(articles)) return [];
  return articles
    .map((article, idx) => ({ article, idx }))
    .sort((a, b) => {
      const da = String(a.article?.date || '');
      const db = String(b.article?.date || '');
      if (da !== db) return db.localeCompare(da);
      if (Boolean(a.article?.featured) !== Boolean(b.article?.featured)) {
        return a.article?.featured ? -1 : 1;
      }
      return a.idx - b.idx;
    })
    .map((entry) => entry.article);
};
