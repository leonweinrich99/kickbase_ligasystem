import React from 'react';
import StartProbBadge from './StartProbBadge';

const POSITION_COLORS = {
  TW: '#eab308',
  ABW: '#3b82f6',
  MF: '#22c55e',
  ST: '#ef4444',
};

const IMAGE_BASE = 'https://kickbase.b-cdn.net/';

const STATUS_TONE_CLASS = {
  red: 'text-red-400',
  green: 'text-green-400',
  emerald: 'text-emerald-400',
  cyan: 'text-cyan-400',
  orange: 'text-orange-400',
  amber: 'text-amber-400',
  muted: 'text-[#8b92a5]',
};

const METRIC_TONE_CLASS = {
  green: 'text-green-400',
  red: 'text-red-400',
  muted: 'text-[#626978]',
  white: 'text-white',
};

const isDummyImage = (url) =>
  Boolean(url && (url.includes('dummy') || url.includes('placeholder') || url.includes('default') || url.includes('silhouet')));

/**
 * Einheitliche, modulare Spielerkarte fuer alle Listen-Ansichten der App
 * (Newsfeed Hot Shots, Trading Advisor Markt/Kader/Datenbank/Favoriten,
 * Live "Mein Kader" Positionsliste).
 *
 * Feste Anatomie (verhindert Zeilenumbrueche & Pillen-Ueberlaeufe):
 * - Links: Fade-Portrait + Vereinswappen-Wasserzeichen + kleiner Startelf-Kreis
 *   links unten (`bottom-1 left-1.5`) + optionale Top-Left-Aktion (z.B. Favoriten-Stern).
 * - Mitte: Einzeiliger Name (`POS` + `Name truncate`) + pillenfreie Meta-Zeile
 *   (`Status · xP` bzw. `Status · Verein`).
 * - Rechts: Tabular-Nums Kennzahlen (Primärwert, farbige Tendenz/Prognose, optionaler Sub-Text).
 */
const PlayerRowCard = ({
  player,
  accentBorder,
  leadingAction = null,
  metaStatus = null,
  metaSecondary = null,
  primaryMetric = '–',
  secondaryMetric = null,
  subMetric = null,
  onClick,
  className = '',
}) => {
  const isClickable = Boolean(onClick);
  const posLabel = player?.position || null;
  const posColor = POSITION_COLORS[posLabel] || '#8b92a5';
  const displayName = player?.firstName
    ? `${player.firstName} ${player.name || ''}`.trim()
    : (player?.name || '–');
  const resolvedImageUrl = player?.imageUrl
    || (player?.imagePath ? `${IMAGE_BASE}${player.imagePath}` : null);
  const startProb = player?.startProb ?? null;

  return (
    <div
      data-layout-guard="player-card"
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`relative overflow-hidden w-full h-[72px] flex items-center p-3 card-surface rounded-xl shadow-sm text-left transition-all ${
        isClickable
          ? 'hover:border-cyan-500/50 hover:bg-[#1c1c1c] active:scale-[0.99] cursor-pointer'
          : 'cursor-default'
      } ${className}`}
      style={accentBorder ? { borderColor: accentBorder } : undefined}
    >
      {/* Links: Spieler-Portrait mit sanftem Fade + Vereinswappen-Wasserzeichen */}
      <div className="absolute top-0 left-0 bottom-0 z-0 pointer-events-none w-1/2 flex justify-start overflow-hidden rounded-l-xl">
        {player?.teamLogo && (
          <img
            src={player.teamLogo}
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
              WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0) 95%)',
              maskImage: 'linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0) 95%)',
            }}
          />
        )}
      </div>

      {/* Optionale Aktion oben links (z.B. Favoriten-Stern im Trading Advisor) */}
      {leadingAction && (
        <div className="absolute top-1.5 left-1.5 z-10">
          {leadingAction}
        </div>
      )}

      {/* Startelf-Wahrscheinlichkeit als kleiner Kreis links unten auf dem Spielerbild */}
      {startProb != null && (
        <div className="absolute bottom-1 left-1.5 z-10 rounded-full bg-black/85 p-[1.5px] shadow-md pointer-events-none">
          <StartProbBadge prob={startProb} variant="icon" size={15} />
        </div>
      )}

      {/* Mitte: Position + Name + pillenfreie Meta-Zeile */}
      <div
        data-layout-guard="player-card-center"
        className="flex-1 min-w-0 relative z-10 drop-shadow-md ml-[68px] sm:ml-[84px]"
      >
        <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
          {posLabel && (
            <span className="text-[9px] font-black shrink-0" style={{ color: posColor }}>
              {posLabel}
            </span>
          )}
          <div className="text-[13px] sm:text-[14px] font-bold text-white truncate">
            {displayName}
          </div>
        </div>

        {(metaStatus || metaSecondary) && (
          <div className="text-[10px] sm:text-[11px] text-[#8b92a5] mt-0.5 flex items-center gap-1.5 flex-nowrap min-w-0 overflow-hidden leading-tight">
            {metaStatus && (
              <span className={`font-bold truncate ${STATUS_TONE_CLASS[metaStatus.tone] || 'text-gray-300'}`}>
                {metaStatus.label}
              </span>
            )}
            {metaStatus && metaSecondary && (
              <span className="text-[#4b5563] shrink-0">·</span>
            )}
            {metaSecondary && (
              <span className="font-semibold text-gray-300 tabular-nums shrink-0 truncate">
                {metaSecondary}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Rechts: Primär- & Sekundär-Kennzahl */}
      <div
        data-layout-guard="player-card-right"
        className="text-right ml-2 shrink-0 flex flex-col justify-center items-end relative z-10"
      >
        <div className="text-[13px] sm:text-[14px] font-bold text-gray-100 leading-none mb-1 tabular-nums whitespace-nowrap">
          {primaryMetric}
        </div>
        {secondaryMetric && (
          <div className={`text-[11px] sm:text-[12px] font-black leading-none tabular-nums whitespace-nowrap ${METRIC_TONE_CLASS[secondaryMetric.tone] || 'text-gray-300'}`}>
            {secondaryMetric.text}
          </div>
        )}
        {subMetric && (
          <div className="text-[8px] sm:text-[9px] text-[#8b92a5] mt-1.5 font-bold tracking-wide whitespace-nowrap">
            {subMetric}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerRowCard;
