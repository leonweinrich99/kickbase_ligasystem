import React, { useId } from 'react';
import { TIER_THEME } from './FifaManagerCard';
import { isOctagonUI } from './shapeTheme';

// Gleiche hohe, scharfe Hexagon-Proportionen wie HexFrame & StartProbBadge
const HEX_POINTS = '12,0.8 20.6,6.3 20.6,17.7 12,23.2 3.4,17.7 3.4,6.3';
const HEX_RIGHT_SHADE = '12,0.8 20.6,6.3 20.6,17.7 12,23.2';

/**
 * Kompaktes Manager-Rating-Hexagon im offiziellen Bronze/Silber/Gold-Tier-Look
 * der FIFA-Manager-Karte (und Elite-Glow).
 *
 * - In der Liga-Tabelle als eigenstaendiges kleines Hexagon (z.B. size={28})
 * - Auf der Manager-Profilseite als Eyebrow am Profilbild-Hexagon mit
 *   schwarzem Backdrop-Ausschnitt (`backdrop={true}`, z.B. size={44})
 * - Schaltet ueber `shapeTheme.js` automatisch auf Kreisform zurueck.
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
  const viewBox = backdrop ? '-2.2 -2.2 28.4 28.4' : '0 0 24 24';
  const label = title || `Manager Rating ${rating.score} (${rating.level || rating.cardTier})`;

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        filter: isElite ? 'drop-shadow(0 0 6px rgba(244, 197, 66, 0.55))' : undefined,
      }}
      title={label}
      aria-label={label}
    >
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        className="w-full h-full block overflow-visible"
        style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
      >
        <defs>
          <linearGradient id={`mgr-hex-${uid}`} x1="0%" y1="0%" x2="70%" y2="100%">
            {theme.cardStops.map(([offset, color]) => (
              <stop key={offset} offset={`${offset}%`} stopColor={color} />
            ))}
          </linearGradient>
        </defs>

        {isOctagonUI ? (
          <>
            {backdrop && (
              <polygon
                points={HEX_POINTS}
                fill="#000000"
                stroke="#000000"
                strokeWidth="4.4"
                strokeLinejoin="miter"
              />
            )}
            <polygon
              points={HEX_POINTS}
              fill={`url(#mgr-hex-${uid})`}
              stroke={theme.border}
              strokeWidth="1.25"
              strokeLinejoin="miter"
            />
            {/* Dezenter 2-Ton-Facetten-Split passend zur App-Icon-Familie */}
            <polygon points={HEX_RIGHT_SHADE} fill="#000000" opacity="0.1" />
          </>
        ) : (
          <>
            {backdrop && <circle cx="12" cy="12" r="12.6" fill="#000000" />}
            <circle
              cx="12"
              cy="12"
              r="10.8"
              fill={`url(#mgr-hex-${uid})`}
              stroke={theme.border}
              strokeWidth="1.4"
            />
          </>
        )}

        <text
          x="12"
          y="12.5"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="9.8"
          fontWeight="900"
          letterSpacing="-0.35"
          fill={theme.text}
        >
          {rating.score}
        </text>
      </svg>
    </span>
  );
}
