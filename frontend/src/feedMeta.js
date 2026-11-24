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
    label: 'Trading News',
    shortLabel: 'Trading WSJ',
    accent: '#10b981',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-400/35',
    pillActiveClass: 'bg-emerald-500 text-black border-emerald-400',
    borderAccent: 'border-l-emerald-400',
    calloutClass: 'bg-emerald-500/10 border-emerald-400/30',
    isWsj: true,
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
