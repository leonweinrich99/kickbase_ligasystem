import React from 'react';
import PlayerRowCard from './PlayerRowCard';

const formatCompactMoney = (val) => {
  if (val === null || val === undefined) return '–';
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  return `${Math.round(val / 1000)}k €`;
};

const StarIcon = ({ filled }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? '#eab308' : 'none'} stroke={filled ? '#eab308' : '#626978'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

// Trading-Advisor-Adapter auf Basis der einheitlichen PlayerRowCard:
// genutzt in Advisor.jsx (Markt, Kader, Datenbank, Favoriten) sowie im
// Newsfeed fuer den "Hot Shots"-Sneak-Peek (HotShotsSection.jsx).
const AdvisorPlayerCard = ({
  entry,
  teamLogo,
  ownerName,
  onClick,
  isFavorite,
  onToggleFavorite,
  showGenericBadges = false,
}) => {
  const rising = (entry.predictedChange || 0) >= 0;
  const isBuyContext = Boolean(entry.onMarket || showGenericBadges);
  const isSellContext = Boolean(entry.inSquad);
  const squadEval = entry.squadEval;
  const showSellBadge = isSellContext && entry.sellRecommended;
  const showStartelfBadge = !isSellContext && squadEval?.tier === 'startelf';
  const showKaderBadge = !isSellContext && (squadEval?.tier === 'kader' || (!squadEval && isBuyContext && entry.playRecommended));
  const showTradeBadge = !isSellContext && (squadEval?.tier === 'trading' || (!squadEval && isBuyContext && entry.tradeRecommended));
  const isFit = entry.status === null || entry.status === undefined || entry.status === 0;

  const accentBorder = showSellBadge
    ? 'rgba(239,68,68,0.4)'
    : showStartelfBadge
      ? 'rgba(34,197,94,0.55)'
      : showKaderBadge
        ? 'rgba(16,185,129,0.4)'
        : showTradeBadge
          ? 'rgba(34,211,238,0.38)'
          : undefined;

  let metaStatus = null;
  if (showSellBadge) {
    metaStatus = { label: 'Verkaufen', tone: 'red' };
  } else if (isSellContext && entry.inBestEleven) {
    metaStatus = { label: 'Startelf', tone: 'emerald' };
  } else if (showStartelfBadge) {
    metaStatus = {
      label: `Startelf${squadEval?.xpDelta > 0 ? ` +${squadEval.xpDelta}` : ''}`,
      tone: 'green',
    };
  } else if (showKaderBadge) {
    metaStatus = {
      label: squadEval?.badgeLabel ? squadEval.badgeLabel.replace(/^✓\s*/, '') : 'Kader',
      tone: 'emerald',
    };
  } else if (showTradeBadge) {
    metaStatus = { label: 'Trading', tone: 'cyan' };
  } else if (entry.statusLabel && !isFit) {
    metaStatus = { label: entry.statusLabel, tone: 'orange' };
  }

  const metaSecondary = typeof entry.xpSeason === 'number' ? `${entry.xpSeason} xP` : null;

  let subMetric = null;
  if (typeof entry.hoursToExpiry === 'number' && entry.onMarket) {
    subMetric = (
      <>
        Ablauf:{' '}
        <span className="text-white">
          {entry.hoursToExpiry < 24 ? `${entry.hoursToExpiry}h` : `${Math.round(entry.hoursToExpiry / 24)}d`}
        </span>
      </>
    );
  } else if (ownerName) {
    subMetric = (
      <>
        Besitzer:{' '}
        <span className="text-white truncate max-w-[80px] inline-block align-bottom">{ownerName}</span>
      </>
    );
  }

  const leadingAction = onToggleFavorite ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggleFavorite(entry.playerId); }}
      aria-label={isFavorite ? 'Favorit entfernen' : 'Als Favorit speichern'}
      className="p-1 rounded-full bg-black/60 opacity-85 hover:opacity-100 transition-opacity cursor-pointer"
    >
      <StarIcon filled={isFavorite} />
    </button>
  ) : null;

  return (
    <PlayerRowCard
      className="mb-2"
      player={{
        name: entry.name,
        firstName: entry.firstName,
        position: entry.position,
        imageUrl: entry.imageUrl,
        imagePath: entry.imagePath,
        teamLogo,
        startProb: entry.startElfProbability ?? entry.prob,
      }}
      accentBorder={accentBorder}
      leadingAction={leadingAction}
      metaStatus={metaStatus}
      metaSecondary={metaSecondary}
      primaryMetric={formatCompactMoney(entry.marketValue)}
      secondaryMetric={{
        text: `${rising ? '▲' : '▼'} ${formatCompactMoney(entry.predictedChange)}`,
        tone: rising ? 'green' : 'red',
      }}
      subMetric={subMetric}
      onClick={onClick}
    />
  );
};

export default AdvisorPlayerCard;
