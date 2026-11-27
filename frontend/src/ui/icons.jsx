import React from 'react';
import {
  Activity as LucideActivity,
  AlertTriangle as LucideAlertTriangle,
  Archive as LucideArchive,
  AtSign as LucideAtSign,
  ArrowLeft as LucideArrowLeft,
  ArrowLeftRight as LucideArrowLeftRight,
  ArrowRight as LucideArrowRight,
  ArrowUpRight as LucideArrowUpRight,
  Award as LucideAward,
  BarChart3 as LucideBarChart3,
  Bell as LucideBell,
  BookOpen as LucideBookOpen,
  Calendar as LucideCalendar,
  CalendarRange as LucideCalendarRange,
  Camera as LucideCamera,
  Check as LucideCheck,
  CheckCircle2 as LucideCheckCircle2,
  ChevronDown as LucideChevronDown,
  ChevronLeft as LucideChevronLeft,
  ChevronRight as LucideChevronRight,
  ChevronUp as LucideChevronUp,
  CircleDollarSign as LucideCircleDollarSign,
  Clock as LucideClock,
  Compass as LucideCompass,
  ExternalLink as LucideExternalLink,
  Eye as LucideEye,
  Flame as LucideFlame,
  Heart as LucideHeart,
  HelpCircle as LucideHelpCircle,
  Info as LucideInfo,
  Layers as LucideLayers,
  Link2 as LucideLink2,
  MapPin as LucideMapPin,
  Megaphone as LucideMegaphone,
  MessageCircle as LucideMessageCircle,
  Minus as LucideMinus,
  MoreVertical as LucideMoreVertical,
  Newspaper as LucideNewspaper,
  Pause as LucidePause,
  Pencil as LucidePencil,
  Play as LucidePlay,
  Plus as LucidePlus,
  PlusSquare as LucidePlusSquare,
  Quote as LucideQuote,
  Radio as LucideRadio,
  RefreshCw as LucideRefreshCw,
  Repeat as LucideRepeat,
  RotateCcw as LucideRotateCcw,
  Search as LucideSearch,
  SearchX as LucideSearchX,
  Send as LucideSend,
  Share as LucideShare,
  Shield as LucideShield,
  ShieldCheck as LucideShieldCheck,
  Shuffle as LucideShuffle,
  SlidersHorizontal as LucideSlidersHorizontal,
  Sparkles as LucideSparkles,
  Star as LucideStar,
  Target as LucideTarget,
  Trash2 as LucideTrash2,
  TrendingDown as LucideTrendingDown,
  TrendingUp as LucideTrendingUp,
  Trophy as LucideTrophy,
  UserCheck as LucideUserCheck,
  Users as LucideUsers,
  Wallet as LucideWallet,
  X as LucideX,
  XCircle as LucideXCircle,
  Zap as LucideZap,
} from 'lucide-react';

/**
 * Zentrale UI-Icon-Bibliothek für das Kickbase Ligasystem ("Kickbase Faceted Duotone").
 *
 * EINFACHES ZURÜCKSWITCHEN & UPDATEN:
 * 1. Komplett auf Standard-Lucide zurückschalten:
 *    - Entweder hier `DEFAULT_ICON_THEME` auf `'lucide'` ändern,
 *    - oder per Environment-Variable `VITE_ICON_THEME=lucide` (ohne Code-Änderung!).
 * 2. Nur einzelne Icons auf Lucide zurücksetzen:
 *    - Icon-Namen in `LUCIDE_OVERRIDES` eintragen, z.B. `new Set(['Clock', 'Search'])`.
 * 3. Einzelnes Custom-Icon anpassen:
 *    - Einfach das SVG-Element im entsprechenden Eintrag unten bearbeiten —
 *      die Änderung gilt automatisch app-weit an allen Stellen.
 */
const DEFAULT_ICON_THEME = 'custom'; // 'custom' | 'lucide'

export const ICON_THEME =
  import.meta.env?.VITE_ICON_THEME === 'lucide'
    ? 'lucide'
    : import.meta.env?.VITE_ICON_THEME === 'custom'
      ? 'custom'
      : DEFAULT_ICON_THEME;

export const LUCIDE_OVERRIDES = new Set([]);

function createKickbaseIcon(name, renderPaths, FallbackIcon) {
  const IconComponent = React.forwardRef(function KickbaseIcon(
    { size = 24, color, fill, stroke, strokeWidth, className = '', style, ...rest },
    ref
  ) {
    const useLucide = ICON_THEME === 'lucide' || LUCIDE_OVERRIDES.has(name);
    if (useLucide && FallbackIcon) {
      return (
        <FallbackIcon
          ref={ref}
          size={size}
          color={color}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          className={className}
          style={style}
          {...rest}
        />
      );
    }

    // Kompatibel zu Lucide-Aufrufen wie <Star fill="#ff5c3e" /> oder <Trophy color="#eab308" />:
    // Da unsere Faceted-Duotone-SVGs `currentColor` verwenden, setzen wir eine explizite
    // Farb-Prop direkt als CSS `color` am <svg>.
    const resolvedColor =
      color ||
      (fill && fill !== 'none' && fill !== 'currentColor' ? fill : undefined) ||
      (stroke && stroke !== 'none' && stroke !== 'currentColor' ? stroke : undefined);

    const mergedStyle = resolvedColor ? { color: resolvedColor, ...style } : style;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={mergedStyle}
        aria-hidden={rest['aria-label'] ? undefined : 'true'}
        {...rest}
      >
        {renderPaths()}
      </svg>
    );
  });

  IconComponent.displayName = `Kickbase${name}`;
  return IconComponent;
}

// ============================================================================
// 1. NAVIGATION & PFEILE
// ============================================================================

export const ChevronRight = createKickbaseIcon('ChevronRight', () => (
  <>
    <polygon points="8.5,4.5 16.5,12 8.5,19.5 6.8,17.8 13,12 6.8,6.2" fill="currentColor" />
    <polygon points="8.5,4.5 11.2,4.5 18.7,12 16.5,12" fill="currentColor" opacity="0.35" />
  </>
), LucideChevronRight);

export const ChevronLeft = createKickbaseIcon('ChevronLeft', () => (
  <>
    <polygon points="15.5,4.5 7.5,12 15.5,19.5 17.2,17.8 11,12 17.2,6.2" fill="currentColor" />
    <polygon points="15.5,4.5 12.8,4.5 5.3,12 7.5,12" fill="currentColor" opacity="0.35" />
  </>
), LucideChevronLeft);

export const ChevronDown = createKickbaseIcon('ChevronDown', () => (
  <>
    <polygon points="4.5,8.5 12,16.5 19.5,8.5 17.8,6.8 12,13 6.2,6.8" fill="currentColor" />
    <polygon points="12,16.5 12,13 17.8,6.8 19.5,8.5" fill="currentColor" opacity="0.35" />
  </>
), LucideChevronDown);

export const ChevronUp = createKickbaseIcon('ChevronUp', () => (
  <>
    <polygon points="4.5,15.5 12,7.5 19.5,15.5 17.8,17.2 12,11 6.2,17.2" fill="currentColor" />
    <polygon points="12,7.5 12,11 17.8,17.2 19.5,15.5" fill="currentColor" opacity="0.35" />
  </>
), LucideChevronUp);

export const ArrowLeft = createKickbaseIcon('ArrowLeft', () => (
  <>
    <polygon points="10.5,5.5 3.5,12 10.5,18.5 12.2,16.8 8.2,13.2 20.5,13.2 20.5,10.8 8.2,10.8 12.2,7.2" fill="currentColor" />
    <polygon points="13,10.8 20.5,10.8 20.5,13.2 13,13.2" fill="currentColor" opacity="0.35" />
  </>
), LucideArrowLeft);

export const ArrowRight = createKickbaseIcon('ArrowRight', () => (
  <>
    <polygon points="13.5,5.5 20.5,12 13.5,18.5 11.8,16.8 15.8,13.2 3.5,13.2 3.5,10.8 15.8,10.8 11.8,7.2" fill="currentColor" />
    <polygon points="3.5,10.8 11,10.8 11,13.2 3.5,13.2" fill="currentColor" opacity="0.35" />
  </>
), LucideArrowRight);

export const ArrowUpRight = createKickbaseIcon('ArrowUpRight', () => (
  <>
    <polygon points="8,5.5 18.5,5.5 18.5,16 16,16 16,9.8 7.2,18.6 5.4,16.8 14.2,8 8,8" fill="currentColor" />
    <polygon points="10.5,15.3 7.2,18.6 5.4,16.8 8.7,13.5" fill="currentColor" opacity="0.38" />
  </>
), LucideArrowUpRight);

export const ArrowLeftRight = createKickbaseIcon('ArrowLeftRight', () => (
  <>
    <polygon points="15.5,3.5 20.5,8 15.5,12.5 14,11 16.5,9 4,9 4,7 16.5,7 14,5" fill="currentColor" />
    <polygon points="8.5,11.5 3.5,16 8.5,20.5 10,19 7.5,17 20,17 20,15 7.5,15 10,13" fill="currentColor" opacity="0.48" />
  </>
), LucideArrowLeftRight);

export const ExternalLink = createKickbaseIcon('ExternalLink', () => (
  <>
    <polygon points="4,7 7,4 11,4 11,6.5 7.5,6.5 6.5,7.5 6.5,17.5 16.5,17.5 17.5,16.5 17.5,13 20,13 20,17 17,20 4,20" fill="currentColor" opacity="0.4" />
    <polygon points="13,4 20,4 20,11 17.8,11 17.8,7.8 11.4,14.2 9.8,12.6 16.2,6.2 13,6.2" fill="currentColor" />
  </>
), LucideExternalLink);

export const Link2 = createKickbaseIcon('Link2', () => (
  <>
    <path d="M9.5 7H6L3 10v4l3 3h3.5v-2.4H6.8L5.4 13.2v-2.4L6.8 9.4h2.7V7Z" fill="currentColor" />
    <path d="M14.5 7H18l3 3v4l-3 3h-3.5v-2.4h2.7l1.4-1.4v-2.4l-1.4-1.4h-2.7V7Z" fill="currentColor" opacity="0.45" />
    <rect x="8.5" y="10.8" width="7" height="2.4" fill="currentColor" />
  </>
), LucideLink2);

export const Share = createKickbaseIcon('Share', () => (
  <>
    <polygon points="4,12 6.5,12 6.5,18.5 17.5,18.5 17.5,12 20,12 20,19 18,21 6,21 4,19" fill="currentColor" opacity="0.42" />
    <polygon points="12,2.5 17.2,7.7 15.5,9.4 13.2,7.1 13.2,15.5 10.8,15.5 10.8,7.1 8.5,9.4 6.8,7.7" fill="currentColor" />
  </>
), LucideShare);

export const MoreVertical = createKickbaseIcon('MoreVertical', () => (
  <>
    <polygon points="12,3.5 14.3,5.8 12,8.1 9.7,5.8" fill="currentColor" />
    <polygon points="12,9.7 14.3,12 12,14.3 9.7,12" fill="currentColor" opacity="0.65" />
    <polygon points="12,15.9 14.3,18.2 12,20.5 9.7,18.2" fill="currentColor" opacity="0.4" />
  </>
), LucideMoreVertical);

// ============================================================================
// 2. AKTIONEN & CONTROLS
// ============================================================================

export const X = createKickbaseIcon('X', () => (
  <>
    <polygon points="6.4,4.8 12,10.4 17.6,4.8 19.2,6.4 13.6,12 19.2,17.6 17.6,19.2 12,13.6 6.4,19.2 4.8,17.6 10.4,12 4.8,6.4" fill="currentColor" />
    <polygon points="12,10.4 17.6,4.8 19.2,6.4 13.6,12 19.2,17.6 17.6,19.2 12,13.6" fill="currentColor" opacity="0.35" />
  </>
), LucideX);

export const Check = createKickbaseIcon('Check', () => (
  <>
    <polygon points="3.5,12.5 5.3,10.7 9.5,14.9 18.7,5.7 20.5,7.5 9.5,18.5" fill="currentColor" />
    <polygon points="9.5,14.9 18.7,5.7 20.5,7.5 9.5,18.5" fill="currentColor" opacity="0.4" />
  </>
), LucideCheck);

export const Plus = createKickbaseIcon('Plus', () => (
  <>
    <polygon points="10.6,4.5 13.4,4.5 13.4,10.6 19.5,10.6 19.5,13.4 13.4,13.4 13.4,19.5 10.6,19.5 10.6,13.4 4.5,13.4 4.5,10.6 10.6,10.6" fill="currentColor" />
    <rect x="13.4" y="10.6" width="6.1" height="2.8" fill="currentColor" opacity="0.35" />
  </>
), LucidePlus);

export const Minus = createKickbaseIcon('Minus', () => (
  <>
    <polygon points="4.5,10.6 19.5,10.6 19.5,13.4 4.5,13.4" fill="currentColor" />
    <polygon points="12,10.6 19.5,10.6 19.5,13.4 12,13.4" fill="currentColor" opacity="0.4" />
  </>
), LucideMinus);

export const PlusSquare = createKickbaseIcon('PlusSquare', () => (
  <>
    <polygon points="6,3 18,3 21,6 21,18 18,21 6,21 3,18 3,6" fill="currentColor" opacity="0.22" />
    <polygon points="12,3 18,3 21,6 21,18 18,21 12,21" fill="currentColor" opacity="0.16" />
    <polygon points="10.8,7.5 13.2,7.5 13.2,10.8 16.5,10.8 16.5,13.2 13.2,13.2 13.2,16.5 10.8,16.5 10.8,13.2 7.5,13.2 7.5,10.8 10.8,10.8" fill="currentColor" />
  </>
), LucidePlusSquare);

export const RefreshCw = createKickbaseIcon('RefreshCw', () => (
  <>
    <path d="M19.5 4.5v5.8h-5.8l2-2A5.5 5.5 0 0 0 7.2 9.2L5.1 7.6A8 8 0 0 1 17.6 6.4l1.9-1.9Z" fill="currentColor" />
    <path d="M4.5 19.5v-5.8h5.8l-2 2a5.5 5.5 0 0 0 8.5-.9l2.1 1.6a8 8 0 0 1-12.5 1.2l-1.9 1.9Z" fill="currentColor" opacity="0.45" />
  </>
), LucideRefreshCw);

export const RotateCcw = createKickbaseIcon('RotateCcw', () => (
  <>
    <path d="M4 5v5.5h5.5L7.6 8.6a6 6 0 1 1-.6 6.8l-2 1.4A8.4 8.4 0 1 0 5.9 6.9L4 5Z" fill="currentColor" />
    <polygon points="4,5 9.5,10.5 4,10.5" fill="currentColor" opacity="0.4" />
  </>
), LucideRotateCcw);

export const Search = createKickbaseIcon('Search', () => (
  <>
    <polygon points="7.5,3.5 13.5,3.5 17.5,7.5 17.5,13.5 13.5,17.5 7.5,17.5 3.5,13.5 3.5,7.5" fill="currentColor" opacity="0.22" />
    <path d="M7.5 3.5h6l4 4v6l-4 4h-6l-4-4v-6l4-4Zm1 2.4-2.6 2.6v4l2.6 2.6h4l2.6-2.6v-4l-2.6-2.6h-4Z" fill="currentColor" />
    <polygon points="15.8,14 21,19.2 19.2,21 14,15.8" fill="currentColor" />
  </>
), LucideSearch);

export const SearchX = createKickbaseIcon('SearchX', () => (
  <>
    <polygon points="7.5,3.5 13.5,3.5 17.5,7.5 17.5,13.5 13.5,17.5 7.5,17.5 3.5,13.5 3.5,7.5" fill="currentColor" opacity="0.22" />
    <path d="M7.5 3.5h6l4 4v6l-4 4h-6l-4-4v-6l4-4Zm1 2.4-2.6 2.6v4l2.6 2.6h4l2.6-2.6v-4l-2.6-2.6h-4Z" fill="currentColor" />
    <polygon points="8.3,7.3 10.5,9.5 12.7,7.3 13.7,8.3 11.5,10.5 13.7,12.7 12.7,13.7 10.5,11.5 8.3,13.7 7.3,12.7 9.5,10.5 7.3,8.3" fill="currentColor" />
    <polygon points="15.8,14 21,19.2 19.2,21 14,15.8" fill="currentColor" />
  </>
), LucideSearchX);

export const SlidersHorizontal = createKickbaseIcon('SlidersHorizontal', () => (
  <>
    <rect x="3" y="5.8" width="18" height="2.2" fill="currentColor" opacity="0.35" />
    <rect x="3" y="10.9" width="18" height="2.2" fill="currentColor" opacity="0.35" />
    <rect x="3" y="16" width="18" height="2.2" fill="currentColor" opacity="0.35" />
    <polygon points="9,3.5 12.2,6.9 9,10.3 5.8,6.9" fill="currentColor" />
    <polygon points="15.5,8.6 18.7,12 15.5,15.4 12.3,12" fill="currentColor" />
    <polygon points="8.5,13.7 11.7,17.1 8.5,20.5 5.3,17.1" fill="currentColor" />
  </>
), LucideSlidersHorizontal);

export const Play = createKickbaseIcon('Play', () => (
  <>
    <polygon points="6,4 20,12 6,20" fill="currentColor" />
    <polygon points="6,12 20,12 6,20" fill="currentColor" opacity="0.45" />
  </>
), LucidePlay);

export const Pause = createKickbaseIcon('Pause', () => (
  <>
    <polygon points="5.5,4.5 10.5,4.5 10.5,19.5 5.5,19.5" fill="currentColor" />
    <polygon points="13.5,4.5 18.5,4.5 18.5,19.5 13.5,19.5" fill="currentColor" opacity="0.5" />
  </>
), LucidePause);

export const Send = createKickbaseIcon('Send', () => (
  <>
    <polygon points="3,10.8 21,3.5 10.2,13.8" fill="currentColor" />
    <polygon points="10.2,13.8 21,3.5 13.2,21" fill="currentColor" opacity="0.48" />
  </>
), LucideSend);

// ============================================================================
// 3. STATUS & HINWEISE
// ============================================================================

export const CheckCircle2 = createKickbaseIcon('CheckCircle2', () => (
  <>
    <polygon points="8,2.5 12,2.5 12,21.5 8,21.5 2.5,16 2.5,8" fill="currentColor" opacity="0.22" />
    <polygon points="12,2.5 16,2.5 21.5,8 21.5,16 16,21.5 12,21.5" fill="currentColor" opacity="0.38" />
    <polygon points="7.2,12.2 8.9,10.5 10.8,12.4 15.4,7.8 17.1,9.5 10.8,15.8" fill="currentColor" />
  </>
), LucideCheckCircle2);

export const XCircle = createKickbaseIcon('XCircle', () => (
  <>
    <polygon points="8,2.5 12,2.5 12,21.5 8,21.5 2.5,16 2.5,8" fill="currentColor" opacity="0.22" />
    <polygon points="12,2.5 16,2.5 21.5,8 21.5,16 16,21.5 12,21.5" fill="currentColor" opacity="0.38" />
    <polygon points="8.7,7.3 12,10.6 15.3,7.3 16.7,8.7 13.4,12 16.7,15.3 15.3,16.7 12,13.4 8.7,16.7 7.3,15.3 10.6,12 7.3,8.7" fill="currentColor" />
  </>
), LucideXCircle);

export const AlertTriangle = createKickbaseIcon('AlertTriangle', () => (
  <>
    <polygon points="12,2.5 2,20 12,20" fill="currentColor" opacity="0.26" />
    <polygon points="12,2.5 22,20 12,20" fill="currentColor" opacity="0.44" />
    <polygon points="10.8,8.5 13.2,8.5 12.8,14.2 11.2,14.2" fill="currentColor" />
    <polygon points="12,15.4 13.5,16.9 12,18.4 10.5,16.9" fill="currentColor" />
  </>
), LucideAlertTriangle);

export const Info = createKickbaseIcon('Info', () => (
  <>
    <polygon points="8,2.5 12,2.5 12,21.5 8,21.5 2.5,16 2.5,8" fill="currentColor" opacity="0.22" />
    <polygon points="12,2.5 16,2.5 21.5,8 21.5,16 16,21.5 12,21.5" fill="currentColor" opacity="0.38" />
    <polygon points="12,6.2 13.5,7.7 12,9.2 10.5,7.7" fill="currentColor" />
    <rect x="10.8" y="10.8" width="2.4" height="6.4" fill="currentColor" />
  </>
), LucideInfo);

export const HelpCircle = createKickbaseIcon('HelpCircle', () => (
  <>
    <polygon points="8,2.5 12,2.5 12,21.5 8,21.5 2.5,16 2.5,8" fill="currentColor" opacity="0.22" />
    <polygon points="12,2.5 16,2.5 21.5,8 21.5,16 16,21.5 12,21.5" fill="currentColor" opacity="0.38" />
    <path d="M9.2 9.4 10.7 7h2.8L15 8.8v1.7l-1.9 1.6v1.4h-2.2v-2.2l1.8-1.5v-.7l-.5-.5h-1l-.6.8H9.2Z" fill="currentColor" />
    <polygon points="12,15 13.4,16.4 12,17.8 10.6,16.4" fill="currentColor" />
  </>
), LucideHelpCircle);

export const Clock = createKickbaseIcon('Clock', () => (
  <>
    <polygon points="8,2.5 12,2.5 12,21.5 8,21.5 2.5,16 2.5,8" fill="currentColor" opacity="0.22" />
    <polygon points="12,2.5 16,2.5 21.5,8 21.5,16 16,21.5 12,21.5" fill="currentColor" opacity="0.38" />
    <polygon points="11,6.5 13,6.5 13,11.6 16.5,14.2 15.2,15.8 11,12.7" fill="currentColor" />
  </>
), LucideClock);

export const Bell = createKickbaseIcon('Bell', () => (
  <>
    <polygon points="12,3 8,5.5 6.5,13 4.5,16.5 12,16.5" fill="currentColor" />
    <polygon points="12,3 16,5.5 17.5,13 19.5,16.5 12,16.5" fill="currentColor" opacity="0.48" />
    <polygon points="9.5,18.2 14.5,18.2 12,21" fill="currentColor" />
  </>
), LucideBell);

// ============================================================================
// 4. SPORT, MARKT & DATEN
// ============================================================================

export const Trophy = createKickbaseIcon('Trophy', () => (
  <>
    <polygon points="6,3.5 12,3.5 12,15 8.2,13.4 6.5,9.5" fill="currentColor" />
    <polygon points="12,3.5 18,3.5 17.5,9.5 15.8,13.4 12,15" fill="currentColor" opacity="0.5" />
    <path d="M5.5 5H2.8v3.6L5.5 11V9L4.4 8V6.7h1.1V5Zm13 0h2.7v3.6L18.5 11V9l1.1-1V6.7h-1.1V5Z" fill="currentColor" opacity="0.65" />
    <polygon points="10.2,15 13.8,15 15,18 9,18" fill="currentColor" opacity="0.6" />
    <polygon points="7,18.6 17,18.6 18,21 6,21" fill="currentColor" />
  </>
), LucideTrophy);

export const Flame = createKickbaseIcon('Flame', () => (
  <>
    <polygon points="12.5,2 17,8 19,13.5 16,19.5 12,21.5 7.5,19 5.5,13 8,8.5 9.5,11 11.5,5.5" fill="currentColor" opacity="0.42" />
    <polygon points="12.2,9 15.2,13.8 14,18.2 12,19.8 9.8,17.8 9.2,14" fill="currentColor" />
  </>
), LucideFlame);

export const TrendingUp = createKickbaseIcon('TrendingUp', () => (
  <>
    <polygon points="3,18.5 9.5,12 13,15.5 20.5,8 20.5,12 18.2,12 18.2,10.3 13,15.5" fill="currentColor" opacity="0.35" />
    <polygon points="14.2,5.5 21.2,5.5 21.2,12.5 18.8,12.5 18.8,9.5 13,15.3 9.5,11.8 4.4,16.9 2.8,15.3 9.5,8.6 13,12.1 17.2,7.9 14.2,7.9" fill="currentColor" />
  </>
), LucideTrendingUp);

export const TrendingDown = createKickbaseIcon('TrendingDown', () => (
  <>
    <polygon points="14.2,18.5 21.2,18.5 21.2,11.5 18.8,11.5 18.8,14.5 13,8.7 9.5,12.2 4.4,7.1 2.8,8.7 9.5,15.4 13,11.9 17.2,16.1 14.2,16.1" fill="currentColor" />
    <polygon points="2.8,8.7 4.4,7.1 9.5,12.2 9.5,15.4" fill="currentColor" opacity="0.4" />
  </>
), LucideTrendingDown);

export const BarChart3 = createKickbaseIcon('BarChart3', () => (
  <>
    <polygon points="3.5,13 7.5,13 7.5,20 3.5,20" fill="currentColor" opacity="0.42" />
    <polygon points="10,8 14,8 14,20 10,20" fill="currentColor" opacity="0.68" />
    <polygon points="16.5,4 20.5,4 20.5,20 16.5,20" fill="currentColor" />
  </>
), LucideBarChart3);

export const Activity = createKickbaseIcon('Activity', () => (
  <>
    <polygon points="2,11 6.8,11 9.8,3.8 11.4,3.8 14.2,15.5 16.2,11 22,11 22,13.2 17.6,13.2 14.8,19.8 13.2,19.8 10.4,8.2 8.2,13.2 2,13.2" fill="currentColor" />
    <polygon points="2,11 6.8,11 8.2,13.2 2,13.2" fill="currentColor" opacity="0.38" />
  </>
), LucideActivity);

export const Star = createKickbaseIcon('Star', () => (
  <>
    <polygon points="12,2.5 12,17.2 6.2,20.5 7.5,14 2.8,9.4 9.3,8.5" fill="currentColor" />
    <polygon points="12,2.5 14.7,8.5 21.2,9.4 16.5,14 17.8,20.5 12,17.2" fill="currentColor" opacity="0.5" />
  </>
), LucideStar);

export const Sparkles = createKickbaseIcon('Sparkles', () => (
  <>
    <polygon points="10.5,3 10.5,18 8,13 3,10.5 8,8" fill="currentColor" />
    <polygon points="10.5,3 13,8 18,10.5 13,13 10.5,18" fill="currentColor" opacity="0.48" />
    <polygon points="18.5,13.5 19.7,16 22.2,17.2 19.7,18.4 18.5,20.9 17.3,18.4 14.8,17.2 17.3,16" fill="currentColor" opacity="0.8" />
  </>
), LucideSparkles);

export const Zap = createKickbaseIcon('Zap', () => (
  <>
    <polygon points="13.5,2.5 4.5,13.2 11.5,13.2" fill="currentColor" />
    <polygon points="11.5,13.2 10.5,21.5 19.5,10.8 12.5,10.8" fill="currentColor" opacity="0.52" />
    <polygon points="13.5,2.5 12.5,10.8 11.5,13.2" fill="currentColor" />
  </>
), LucideZap);

export const Target = createKickbaseIcon('Target', () => (
  <>
    <polygon points="8,2.5 16,2.5 21.5,8 21.5,16 16,21.5 8,21.5 2.5,16 2.5,8" fill="currentColor" opacity="0.2" />
    <path d="M9.2 6.2h5.6l3 3v5.6l-3 3H9.2l-3-3V9.2l3-3Zm.8 2-1.8 1.8v4l1.8 1.8h4l1.8-1.8v-4L14 8.2h-4Z" fill="currentColor" opacity="0.55" />
    <polygon points="12,9.2 14.8,12 12,14.8 9.2,12" fill="currentColor" />
  </>
), LucideTarget);

export const Wallet = createKickbaseIcon('Wallet', () => (
  <>
    <polygon points="3,6.5 6,4.5 18.5,4.5 20.5,6.5 20.5,18.5 18.5,20 5,20 3,18" fill="currentColor" opacity="0.34" />
    <polygon points="3,6.5 12,6.5 12,20 5,20 3,18" fill="currentColor" opacity="0.22" />
    <polygon points="14,10.2 21.5,10.2 21.5,15.4 14,15.4 12.5,12.8" fill="currentColor" />
  </>
), LucideWallet);

export const Award = createKickbaseIcon('Award', () => (
  <>
    <polygon points="12,2.5 17.5,5.5 17.5,12 12,15" fill="currentColor" opacity="0.52" />
    <polygon points="12,2.5 6.5,5.5 6.5,12 12,15" fill="currentColor" />
    <polygon points="8,14.8 11,16.2 9.5,21.5 6.5,19.5" fill="currentColor" opacity="0.45" />
    <polygon points="16,14.8 13,16.2 14.5,21.5 17.5,19.5" fill="currentColor" opacity="0.72" />
  </>
), LucideAward);

export const Radio = createKickbaseIcon('Radio', () => (
  <>
    <polygon points="12,9.2 14.8,12 12,14.8 9.2,12" fill="currentColor" />
    <polygon points="7.5,7.2 5.9,5.6 2.8,12 5.9,18.4 7.5,16.8 5.2,12" fill="currentColor" opacity="0.42" />
    <polygon points="16.5,7.2 18.1,5.6 21.2,12 18.1,18.4 16.5,16.8 18.8,12" fill="currentColor" opacity="0.42" />
    <polygon points="9.2,9 7.8,7.8 6.2,12 7.8,16.2 9.2,15 8,12" fill="currentColor" opacity="0.75" />
    <polygon points="14.8,9 16.2,7.8 17.8,12 16.2,16.2 14.8,15 16,12" fill="currentColor" opacity="0.75" />
  </>
), LucideRadio);

// ============================================================================
// 5. PERSONEN, KALENDER & ORTE
// ============================================================================

export const Users = createKickbaseIcon('Users', () => (
  <>
    <polygon points="9.5,4.2 12.8,6.2 12.8,9.8 9.5,11.6 6.2,9.8 6.2,6.2" fill="currentColor" />
    <polygon points="9.5,13 14.8,15 15.8,19.8 3.2,19.8 4.2,15" fill="currentColor" />
    <polygon points="16.2,6.2 18.8,7.7 18.8,10.5 16.2,12 14.2,10.5 14.2,7.7" fill="currentColor" opacity="0.45" />
    <polygon points="16.2,13.4 20.4,15 21,19.8 16.8,19.8 16,14.8" fill="currentColor" opacity="0.45" />
  </>
), LucideUsers);

export const UserCheck = createKickbaseIcon('UserCheck', () => (
  <>
    <polygon points="9.5,4.2 12.8,6.2 12.8,9.8 9.5,11.6 6.2,9.8 6.2,6.2" fill="currentColor" />
    <polygon points="9.5,13 14.8,15 15.8,19.8 3.2,19.8 4.2,15" fill="currentColor" opacity="0.5" />
    <polygon points="14.2,12.2 15.5,10.9 17,12.4 20.5,8.9 21.8,10.2 17,15" fill="currentColor" />
  </>
), LucideUserCheck);

export const Shield = createKickbaseIcon('Shield', () => (
  <>
    <polygon points="12,2.5 4,5.8 4,13 12,21.5" fill="currentColor" />
    <polygon points="12,2.5 20,5.8 20,13 12,21.5" fill="currentColor" opacity="0.48" />
  </>
), LucideShield);

export const ShieldCheck = createKickbaseIcon('ShieldCheck', () => (
  <>
    <polygon points="12,2.5 4,5.8 4,13 12,21.5" fill="currentColor" opacity="0.28" />
    <polygon points="12,2.5 20,5.8 20,13 12,21.5" fill="currentColor" opacity="0.45" />
    <polygon points="8.2,11.8 9.6,10.4 11.2,12 15,8.2 16.4,9.6 11.2,14.8" fill="currentColor" />
  </>
), LucideShieldCheck);

export const Calendar = createKickbaseIcon('Calendar', () => (
  <>
    <polygon points="3.5,5.5 20.5,5.5 20.5,9.8 3.5,9.8" fill="currentColor" />
    <rect x="6.5" y="2.8" width="2.4" height="4" fill="currentColor" />
    <rect x="15.1" y="2.8" width="2.4" height="4" fill="currentColor" />
    <polygon points="3.5,11 12,11 12,20.5 5.5,20.5 3.5,18.5" fill="currentColor" opacity="0.32" />
    <polygon points="12,11 20.5,11 20.5,18.5 18.5,20.5 12,20.5" fill="currentColor" opacity="0.48" />
  </>
), LucideCalendar);

export const CalendarRange = createKickbaseIcon('CalendarRange', () => (
  <>
    <polygon points="3.5,5.5 20.5,5.5 20.5,9.5 3.5,9.5" fill="currentColor" />
    <rect x="6.5" y="2.8" width="2.4" height="4" fill="currentColor" />
    <rect x="15.1" y="2.8" width="2.4" height="4" fill="currentColor" />
    <polygon points="3.5,10.8 20.5,10.8 20.5,18.5 18.5,20.5 5.5,20.5 3.5,18.5" fill="currentColor" opacity="0.28" />
    <rect x="6.5" y="13.2" width="11" height="2.4" fill="currentColor" />
    <rect x="6.5" y="16.8" width="6.5" height="2" fill="currentColor" opacity="0.65" />
  </>
), LucideCalendarRange);

export const MapPin = createKickbaseIcon('MapPin', () => (
  <>
    <polygon points="12,2.5 5,7 5,13 12,21.5" fill="currentColor" />
    <polygon points="12,2.5 19,7 19,13 12,21.5" fill="currentColor" opacity="0.5" />
    <polygon points="12,7.2 14.8,10 12,12.8 9.2,10" fill="#000000" opacity="0.65" />
  </>
), LucideMapPin);

export const Compass = createKickbaseIcon('Compass', () => (
  <>
    <polygon points="8,2.5 16,2.5 21.5,8 21.5,16 16,21.5 8,21.5 2.5,16 2.5,8" fill="currentColor" opacity="0.24" />
    <polygon points="16.5,7.5 13.6,13.6 10.4,10.4" fill="currentColor" />
    <polygon points="7.5,16.5 10.4,10.4 13.6,13.6" fill="currentColor" opacity="0.48" />
  </>
), LucideCompass);

// ============================================================================
// 6. REDAKTION, MEDIEN & WEITERE
// ============================================================================

export const Newspaper = createKickbaseIcon('Newspaper', () => (
  <>
    <polygon points="3.5,4.5 17,4.5 17,19.5 5.5,19.5 3.5,17.5" fill="currentColor" opacity="0.32" />
    <polygon points="17,7.5 20.5,7.5 20.5,18 19,19.5 17,19.5" fill="currentColor" opacity="0.55" />
    <rect x="6" y="7" width="8.5" height="3.2" fill="currentColor" />
    <rect x="6" y="12" width="4" height="4.5" fill="currentColor" />
    <rect x="11.2" y="12" width="3.5" height="1.7" fill="currentColor" opacity="0.75" />
    <rect x="11.2" y="14.8" width="3.5" height="1.7" fill="currentColor" opacity="0.75" />
  </>
), LucideNewspaper);

export const Megaphone = createKickbaseIcon('Megaphone', () => (
  <>
    <polygon points="3.5,9.5 10,9.5 10,14.5 3.5,14.5" fill="currentColor" opacity="0.48" />
    <polygon points="10,9.5 19.5,4.5 19.5,19.5 10,14.5" fill="currentColor" />
    <polygon points="10,12 19.5,12 19.5,19.5 10,14.5" fill="currentColor" opacity="0.45" />
    <polygon points="5.5,14.5 8.5,14.5 9.8,19.5 6.8,19.5" fill="currentColor" opacity="0.75" />
  </>
), LucideMegaphone);

export const Quote = createKickbaseIcon('Quote', () => (
  <>
    <polygon points="3.5,6 10.5,6 10.5,13.5 7,18 4.2,18 6.8,13.5 3.5,13.5" fill="currentColor" />
    <polygon points="13.5,6 20.5,6 20.5,13.5 17,18 14.2,18 16.8,13.5 13.5,13.5" fill="currentColor" opacity="0.5" />
  </>
), LucideQuote);

export const MessageCircle = createKickbaseIcon('MessageCircle', () => (
  <>
    <polygon points="5.5,4 12,4 12,18 7.5,18 3.5,20.5 4.5,16 3,14 3,6.5" fill="currentColor" opacity="0.32" />
    <polygon points="12,4 18.5,4 21,6.5 21,14 18.5,18 12,18" fill="currentColor" opacity="0.48" />
    <rect x="7" y="9" width="10" height="2" fill="currentColor" />
    <rect x="7" y="12.5" width="6.5" height="2" fill="currentColor" />
  </>
), LucideMessageCircle);

export const Camera = createKickbaseIcon('Camera', () => (
  <>
    <polygon points="8.5,4.5 15.5,4.5 17,7 20.5,7 21.5,8.5 21.5,18 20,19.5 4,19.5 2.5,18 2.5,8.5 3.5,7 7,7" fill="currentColor" opacity="0.34" />
    <polygon points="10.2,9.5 13.8,9.5 16,11.7 16,15.3 13.8,17.5 10.2,17.5 8,15.3 8,11.7" fill="currentColor" />
    <polygon points="12,11.3 14.2,13.5 12,15.7 9.8,13.5" fill="#000000" opacity="0.55" />
  </>
), LucideCamera);

export const Archive = createKickbaseIcon('Archive', () => (
  <>
    <polygon points="2.5,4 21.5,4 21.5,8.5 2.5,8.5" fill="currentColor" />
    <polygon points="4,9.8 12,9.8 12,20 6,20 4,18" fill="currentColor" opacity="0.32" />
    <polygon points="12,9.8 20,9.8 20,18 18,20 12,20" fill="currentColor" opacity="0.48" />
    <rect x="9" y="13" width="6" height="2.4" fill="currentColor" />
  </>
), LucideArchive);

export const BookOpen = createKickbaseIcon('BookOpen', () => (
  <>
    <polygon points="2.5,5 11.2,7.5 11.2,19.5 2.5,17" fill="currentColor" />
    <polygon points="21.5,5 12.8,7.5 12.8,19.5 21.5,17" fill="currentColor" opacity="0.48" />
  </>
), LucideBookOpen);

// ============================================================================
// 7. REGELKATALOG-ICONS (Rules.jsx)
// ============================================================================

export const RuleFairplayIcon = createKickbaseIcon('RuleFairplayIcon', () => (
  <>
    <polygon points="12,6.2 8.5,3.5 3.5,6.5 3.5,11.5 12,20.5" fill="currentColor" />
    <polygon points="12,6.2 15.5,3.5 20.5,6.5 20.5,11.5 12,20.5" fill="currentColor" opacity="0.5" />
  </>
), LucideHeart);

export const RuleLoansIcon = createKickbaseIcon('RuleLoansIcon', () => (
  <>
    <polygon points="16,3 21,7.5 16,12 14.5,10.5 16.5,8.6 5.5,8.6 5.5,12 3.2,12 3.2,6.4 16.5,6.4 14.5,4.5" fill="currentColor" />
    <polygon points="8,12 3,16.5 8,21 9.5,19.5 7.5,17.6 18.5,17.6 18.5,14 20.8,14 20.8,19.8 7.5,19.8 9.5,13.5" fill="currentColor" opacity="0.48" />
  </>
), LucideRepeat);

export const RuleBudgetIcon = createKickbaseIcon('RuleBudgetIcon', () => (
  <>
    <polygon points="8,2.5 12,2.5 12,21.5 8,21.5 2.5,16 2.5,8" fill="currentColor" opacity="0.22" />
    <polygon points="12,2.5 16,2.5 21.5,8 21.5,16 16,21.5 12,21.5" fill="currentColor" opacity="0.38" />
    <path d="M11 6h2v1.6h2.8v2h-5v1.6h4.2l1.4 1.4v2.6L15 16.6h-2V18h-2v-1.4H8.2v-2h5v-1.6H9l-1.4-1.4V9L9 7.6h2V6Z" fill="currentColor" />
  </>
), LucideCircleDollarSign);

export const RuleDrawIcon = createKickbaseIcon('RuleDrawIcon', () => (
  <>
    <polygon points="15,3.5 20.5,3.5 20.5,9 18.3,9 18.3,6.9 5.5,19.7 3.9,18.1 16.7,5.3 15,5.3" fill="currentColor" />
    <polygon points="5.5,4.3 10.2,9 8.6,10.6 3.9,5.9" fill="currentColor" opacity="0.5" />
    <polygon points="15,20.5 20.5,20.5 20.5,15 18.3,15 18.3,17.1 14.8,13.6 13.2,15.2 16.7,18.7 15,18.7" fill="currentColor" opacity="0.5" />
  </>
), LucideShuffle);

export const RuleArenaIcon = createKickbaseIcon('RuleArenaIcon', () => (
  <>
    <polygon points="12,3 21,7.8 12,12.5 3,7.8" fill="currentColor" />
    <polygon points="3,11.6 12,16.3 21,11.6 21,14 12,18.7 3,14" fill="currentColor" opacity="0.6" />
    <polygon points="3,15.8 12,20.5 21,15.8 21,18.2 12,22.5 3,18.2" fill="currentColor" opacity="0.34" />
  </>
), LucideLayers);

export const RuleEditIcon = createKickbaseIcon('RuleEditIcon', () => (
  <>
    <polygon points="15.8,3.2 20.8,8.2 9.4,19.6 4.4,14.6" fill="currentColor" />
    <polygon points="15.8,3.2 18.3,5.7 6.9,17.1 4.4,14.6" fill="currentColor" opacity="0.45" />
    <polygon points="4.4,14.6 9.4,19.6 3.2,20.8" fill="currentColor" opacity="0.7" />
  </>
), LucidePencil);

export const Pencil = RuleEditIcon;

export const Eye = createKickbaseIcon('Eye', () => (
  <>
    <polygon points="2,12 7,6 17,6 22,12 17,18 7,18" fill="currentColor" opacity="0.28" />
    <polygon points="12,6 17,6 22,12 17,18 12,18" fill="currentColor" opacity="0.18" />
    <polygon points="12,8.4 15.6,12 12,15.6 8.4,12" fill="currentColor" />
  </>
), LucideEye);

export const Trash2 = createKickbaseIcon('Trash2', () => (
  <>
    <polygon points="4,5.5 20,5.5 20,7.8 4,7.8" fill="currentColor" />
    <rect x="9" y="3" width="6" height="2.5" fill="currentColor" opacity="0.6" />
    <polygon points="6,9 12,9 12,20.5 7.5,20.5 6.5,19" fill="currentColor" opacity="0.34" />
    <polygon points="12,9 18,9 17.5,19 16.5,20.5 12,20.5" fill="currentColor" opacity="0.52" />
    <rect x="9.3" y="11.5" width="1.8" height="6.2" fill="currentColor" />
    <rect x="12.9" y="11.5" width="1.8" height="6.2" fill="currentColor" />
  </>
), LucideTrash2);

export const AtSign = createKickbaseIcon('AtSign', () => (
  <>
    <polygon points="8,3 16,3 21,8 21,15 17.5,17 14.5,17 14.5,14.8 17.2,14.8 18.6,13.6 18.6,8.9 15.1,5.4 8.9,5.4 5.4,8.9 5.4,15.1 8.9,18.6 15,18.6 15,21 8,21 3,16 3,8" fill="currentColor" opacity="0.45" />
    <polygon points="10,8.5 14,8.5 15.8,10.3 15.8,14 14,15.8 10,15.8 8.2,14 8.2,10.3" fill="currentColor" />
  </>
), LucideAtSign);
