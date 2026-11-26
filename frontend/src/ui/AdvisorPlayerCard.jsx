import React from 'react';
import PlayerRowCard from './PlayerRowCard';

const formatCompactMoney = (val) => {
  if (val === null || val === undefined) return '–';
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  return `${Math.round(val / 1000)}k €`;
};

// Trading-Advisor-Adapter auf Basis der einheitlichen PlayerRowCard:
// genutzt in Advisor.jsx (Markt, Kader, Datenbank) sowie im
// Newsfeed fuer den "Hot Shots"-Sneak-Peek (HotShotsSection.jsx).
const AdvisorPlayerCard = ({
  entry,
  teamLogo,
  ownerName,
  onClick,
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
