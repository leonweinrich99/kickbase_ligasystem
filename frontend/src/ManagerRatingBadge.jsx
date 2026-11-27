import { useId } from 'react';
import { Link } from 'react-router-dom';
import { SHIELD_PATH, TIER_THEME } from './ui/FifaManagerCard';
import { isOctagonUI } from './ui/shapeTheme';
import { useManagerRatings } from './useManagerRatings';

// Kleiner Badge-Button auf der Account-Seite: verkleinerte FIFA-Karten-Optik
// (Schild-/Wappen-Kontur in Bronze/Silber/Gold je Kartenstufe) mit der grossen
// Score-Zahl als "Manager Rating". Fuehrt als Link zur eigenen Vollbild-Route
// /account/manager-rating (siehe ManagerRatingPage.jsx), statt ein Modal zu
// oeffnen.
//
// nutzt exakt dieselbe SHIELD_PATH-Kontur und TIER_THEME-Farbwelt wie
// FifaManagerCard, nur skaliert auf eine kompakte Header-Groesse.
const BADGE_VIEWBOX = '57 36 370 592';

const ManagerRatingBadge = ({ kickbaseId }) => {
  const allRatings = useManagerRatings();
  const rating = kickbaseId && allRatings ? allRatings[kickbaseId] : null;
  const uid = useId().replace(/[:]/g, '');

  if (!rating) return null;

  const theme = TIER_THEME[rating.cardTier] || TIER_THEME.bronze;

  return (
    <Link
      to="/account/manager-rating"
      className="relative flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform"
      style={{ width: '26px', height: '42px' }}
    >
      <svg viewBox={BADGE_VIEWBOX} className="w-full h-full block" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
        <defs>
          <linearGradient id={`grad-badge-${uid}`} x1="0%" y1="0%" x2="65%" y2="100%">
            {theme.cardStops.map(([offset, color]) => (
              <stop key={offset} offset={`${offset}%`} stopColor={color} />
            ))}
          </linearGradient>
        </defs>
        <path d={SHIELD_PATH} fill={`url(#grad-badge-${uid})`} />
        <path d={SHIELD_PATH} fill="none" stroke={theme.border} strokeWidth="7" strokeLinejoin={isOctagonUI ? 'miter' : 'round'} />
        <text x="242" y="332" textAnchor="middle" dominantBaseline="central" fontSize="185" fontWeight="900" fill={theme.text}>
          {rating.score}
        </text>
      </svg>
    </Link>
  );
};

export default ManagerRatingBadge;
