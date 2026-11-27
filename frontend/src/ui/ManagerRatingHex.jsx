import React, { useId } from 'react';
import { PRISM_CARD_PATH, SHIELD_PATH, TIER_THEME } from './FifaManagerCard';
import { isOctagonUI } from './shapeTheme';

/**
 * Kompaktes Manager-Rating-Mini-Badge im offiziellen Metallic-Prism-Look
 * (Oktagon-Sammelkarten-Silhouette in Bronze/Silber/Gold + Elite-Glow,
 * schaltet ueber `shapeTheme.js` auf die klassische FIFA-Schildform zurueck).
 *
 * Einheitlich genutzt auf:
 * - Account-Seite (`ManagerRatingBadge`, size={42})
 * - Liga-Tabelle (`Dashboard`, mittig ueberlagernd am Avatar, size={28}, backdrop)
 * - Manager-Detailseite (`UserDetail`, klickbares Eyebrow am Avatar, size={50}, backdrop)
 */
export default function ManagerRatingHex({
  rating,
  size = 28,
  backdrop = false,
  className = '',
  title,
}) {
  const uid = useId().replace(/[:]/g, '');

  if (!rating || rating.score == null) return null;

  const theme = TIER_THEME[rating.cardTier] || TIER_THEME.bronze;
  const isElite = rating.level === 'Elite';
  const label = title || `Manager Rating ${rating.score} (${rating.level || rating.cardTier})`;

  const width = Math.round(size * (isOctagonUI ? 0.68 : 0.63));
  const prismViewBox = backdrop ? '0 0 340 490' : '16 16 308 458';
  const shieldViewBox = backdrop ? '32 10 420 644' : '57 36 370 592';

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
      style={{
        width,
        height: size,
        filter: isElite ? 'drop-shadow(0 0 7px rgba(244, 197, 66, 0.6))' : undefined,
      }}
      title={label}
      aria-label={label}
    >
      <svg
        width={width}
        height={size}
        viewBox={isOctagonUI ? prismViewBox : shieldViewBox}
        className="w-full h-full block overflow-visible"
        style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
      >
        <defs>
          <linearGradient id={`mgr-badge-${uid}`} x1="0%" y1="0%" x2="65%" y2="100%">
            {theme.cardStops.map(([offset, color]) => (
              <stop key={offset} offset={`${offset}%`} stopColor={color} />
            ))}
          </linearGradient>
          {isOctagonUI && (
            <clipPath id={`mgr-badge-clip-${uid}`}>
              <path d={PRISM_CARD_PATH} />
            </clipPath>
          )}
        </defs>

        {isOctagonUI ? (
          <>
            {backdrop && (
              <path
                d={PRISM_CARD_PATH}
                fill="#000000"
                stroke="#000000"
                strokeWidth="36"
                strokeLinejoin="miter"
              />
            )}
            <g clipPath={`url(#mgr-badge-clip-${uid})`}>
              <path d={PRISM_CARD_PATH} fill={`url(#mgr-badge-${uid})`} />
              {/* Dezente Prism-Facetten passend zur grossen Karte */}
              <polygon points="24,24 196,24 118,255 24,185" fill="#ffffff" opacity="0.16" />
              <polygon points="196,24 316,24 316,225 118,255" fill="#000000" opacity="0.09" />
            </g>
            <path
              d={PRISM_CARD_PATH}
              fill="none"
              stroke={theme.border}
              strokeWidth="11"
              strokeLinejoin="miter"
            />
            <text
              x="170"
              y="252"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="168"
              fontWeight="900"
              letterSpacing="-5"
              fill={theme.text}
            >
              {rating.score}
            </text>
          </>
        ) : (
          <>
            {backdrop && (
              <path
                d={SHIELD_PATH}
                fill="#000000"
                stroke="#000000"
                strokeWidth="40"
                strokeLinejoin="round"
              />
            )}
            <path d={SHIELD_PATH} fill={`url(#mgr-badge-${uid})`} />
            <path
              d={SHIELD_PATH}
              fill="none"
              stroke={theme.border}
              strokeWidth="8"
              strokeLinejoin="round"
            />
            <text
              x="242"
              y="332"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="185"
              fontWeight="900"
              fill={theme.text}
            >
              {rating.score}
            </text>
          </>
        )}
      </svg>
    </span>
  );
}
