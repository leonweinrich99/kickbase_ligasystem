import React from 'react';
import StartProbBadge from './StartProbBadge';

const POSITION_COLORS = { TW: '#eab308', ABW: '#3b82f6', MF: '#22c55e', ST: '#ef4444' };
const IMAGE_BASE = 'https://kickbase.b-cdn.net/';

const isDummyImage = (url) =>
  Boolean(url && (url.includes('dummy') || url.includes('placeholder') || url.includes('default') || url.includes('silhouet')));

const formatCompactMoney = (val) => {
  if (val === null || val === undefined) return '–';
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  return `${Math.round(val / 1000)}k €`;
};

const StarIcon = ({ filled }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? '#eab308' : 'none'} stroke={filled ? '#eab308' : '#626978'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

// Gemeinsame Spielerkarte des Trading Advisors - genutzt in Advisor.jsx
// (Markt, Kader, Datenbank, Favoriten) sowie im Newsfeed fuer den
// "Hot Shots"-Sneak-Peek (HotShotsSection.jsx).
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
  const isClickable = Boolean(onClick);
  const resolvedImageUrl = entry.imageUrl || (entry.imagePath ? `${IMAGE_BASE}${entry.imagePath}` : null);

  const borderColor = showSellBadge
    ? 'rgba(239,68,68,0.4)'
    : showStartelfBadge
      ? 'rgba(34,197,94,0.55)'
      : showKaderBadge
        ? 'rgba(16,185,129,0.4)'
        : showTradeBadge
          ? 'rgba(34,211,238,0.38)'
          : undefined;

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`relative overflow-hidden w-full h-[72px] flex items-center p-3 mb-2 card-surface rounded-xl shadow-sm text-left transition-all ${isClickable ? 'hover:border-cyan-500/50 hover:bg-[#1c1c1c] active:scale-[0.99] cursor-pointer' : 'cursor-default'}`}
      style={{ borderColor }}
    >
      {/* Background Hero Image + Team Logo Watermark (LEFT ALIGNED) */}
      <div className="absolute top-0 left-0 bottom-0 z-0 pointer-events-none w-1/2 flex justify-start overflow-hidden rounded-l-xl">
        {teamLogo && (
          <img
            src={teamLogo}
            alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="absolute top-1/2 -translate-y-1/2 left-4 w-16 h-16 sm:w-20 sm:h-20 object-contain opacity-[0.12] mix-blend-screen"
          />
        )}
        {resolvedImageUrl && !isDummyImage(resolvedImageUrl) && (
          <img
            src={resolvedImageUrl}
            alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="h-[150%] w-auto object-cover object-top pointer-events-none"
            style={{
              transform: 'translateY(-10%) translateX(-5%)',
              // Fade von links nach rechts (90deg)
              WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0) 95%)',
              maskImage: 'linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0) 95%)',
            }}
          />
        )}
      </div>

      {/* Startelf-Wahrscheinlichkeit als kompakter Kreis direkt auf dem Spielerbild */}
      {(entry.startElfProbability ?? entry.prob) != null && (
        <div
          className={`absolute bottom-1.5 z-10 rounded-full bg-black/85 p-[1.5px] shadow-md pointer-events-none ${
            onToggleFavorite ? 'left-[54px] sm:left-[62px]' : 'left-[52px] sm:left-[60px]'
          }`}
        >
          <StartProbBadge prob={entry.startElfProbability ?? entry.prob} variant="icon" size={15} />
        </div>
      )}

      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(entry.playerId); }}
          aria-label={isFavorite ? 'Favorit entfernen' : 'Als Favorit speichern'}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 z-10 opacity-75 hover:opacity-100 transition-opacity"
        >
          <StarIcon filled={isFavorite} />
        </button>
      )}

      {/* Left Text Content - margin keeps it clear from the face and startelf circle */}
      <div className="flex-1 min-w-0 relative z-10 drop-shadow-md ml-[76px] sm:ml-[92px]">
        <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
          {entry.position && (
            <span className="text-[9px] font-black shrink-0" style={{ color: POSITION_COLORS[entry.position] || '#8b92a5' }}>
              {entry.position}
            </span>
          )}
          <div className="text-[13px] sm:text-[14px] font-bold text-white truncate">
            {entry.firstName ? `${entry.firstName} ${entry.name}` : entry.name}
          </div>
        </div>

        {/* Kompakte, pillenfreie Meta-Zeile: Empfehlung/Status + xP */}
        <div className="text-[10px] sm:text-[11px] text-[#8b92a5] mt-0.5 flex items-center gap-1.5 flex-nowrap min-w-0 overflow-hidden leading-tight">
          {(() => {
            let statusNode = null;
            if (showSellBadge) {
              statusNode = <span className="font-bold text-red-400 truncate">Verkaufen</span>;
            } else if (isSellContext && entry.inBestEleven) {
              statusNode = <span className="font-bold text-emerald-400 truncate">Startelf</span>;
            } else if (showStartelfBadge) {
              statusNode = (
                <span className="font-bold text-green-400 truncate">
                  Startelf{squadEval?.xpDelta > 0 ? ` +${squadEval.xpDelta}` : ''}
                </span>
              );
            } else if (showKaderBadge) {
              statusNode = <span className="font-bold text-emerald-400 truncate">{squadEval?.badgeLabel ? squadEval.badgeLabel.replace(/^✓\s*/, '') : 'Kader'}</span>;
            } else if (showTradeBadge) {
              statusNode = <span className="font-bold text-cyan-400 truncate">Trading</span>;
            } else if (entry.statusLabel && !isFit) {
              statusNode = <span className="font-bold text-orange-400 truncate">{entry.statusLabel}</span>;
            }

            const hasXp = typeof entry.xpSeason === 'number';
            return (
              <>
                {statusNode}
                {statusNode && hasXp && <span className="text-[#4b5563] shrink-0">·</span>}
                {hasXp && (
                  <span className="font-semibold text-gray-300 tabular-nums shrink-0">
                    {entry.xpSeason} xP
                  </span>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Right Numbers Content */}
      <div className="text-right ml-2 shrink-0 flex flex-col justify-center items-end relative z-10">
        <div className="text-[13px] sm:text-[14px] font-bold text-gray-100 leading-none mb-1">
          {formatCompactMoney(entry.marketValue)}
        </div>
        <div className={`text-[11px] sm:text-[12px] font-black leading-none ${rising ? 'text-green-400' : 'text-red-400'}`}>
          {rising ? '▲' : '▼'} {formatCompactMoney(entry.predictedChange)}
        </div>
        {typeof entry.hoursToExpiry === 'number' && entry.onMarket ? (
          <div className="text-[8px] sm:text-[9px] text-[#8b92a5] mt-1.5 font-bold tracking-wide">
            Ablauf: <span className="text-white">{entry.hoursToExpiry < 24 ? `${entry.hoursToExpiry}h` : `${Math.round(entry.hoursToExpiry / 24)}d`}</span>
          </div>
        ) : ownerName ? (
          <div className="text-[8px] sm:text-[9px] text-[#8b92a5] mt-1.5 font-bold tracking-wide">
            Besitzer: <span className="text-white truncate max-w-[80px] inline-block align-bottom">{ownerName}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AdvisorPlayerCard;
