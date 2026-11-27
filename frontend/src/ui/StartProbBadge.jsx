import React from 'react';
import { START_PROB_LEVELS, getStartProbMeta } from '../startProbMeta';
import { isOctagonUI } from './shapeTheme';

const HEX_BG_POINTS = '12,0.8 20.6,6.3 20.6,17.7 12,23.2 3.4,17.7 3.4,6.3';
const HEX_RIGHT_SHADE = '12,0.8 20.6,6.3 20.6,17.7 12,23.2';

const BadgeBase = ({ fill, stroke = 'rgba(255,255,255,0.22)', backdrop = false }) =>
  isOctagonUI ? (
    <>
      {backdrop && (
        <polygon
          points={HEX_BG_POINTS}
          fill="#000000"
          stroke="#000000"
          strokeWidth="4.2"
          strokeLinejoin="miter"
        />
      )}
      <polygon points={HEX_BG_POINTS} fill={fill} stroke={stroke} strokeWidth="1.2" strokeLinejoin="miter" />
      <polygon points={HEX_RIGHT_SHADE} fill="#000000" opacity="0.14" />
    </>
  ) : (
    <>
      {backdrop && <circle cx="12" cy="12" r="12.5" fill="#000000" />}
      <circle cx="12" cy="12" r="11" fill={fill} stroke={stroke} strokeWidth="1.5" />
    </>
  );

// Exakte 5-stufige Kickbase-Startelf-Icons (angelehnt an die Kickbase-Legende):
// 1 = Sicher (blauer Stern), 2 = Erwartet (gruener Haken), 3 = Unsicher (orange ?),
// 4 = Unwahrscheinlich (rotes !), 5 = Ausgeschlossen (graues X).
export const StartProbIcon = ({ code, size = 16, backdrop = false }) => {
  const viewBox = backdrop ? '-2.2 -2.2 28.4 28.4' : '0 0 24 24';
  if (code === 1) {
    return (
      <svg width={size} height={size} viewBox={viewBox} className="shrink-0 overflow-visible" aria-hidden="true">
        <BadgeBase fill="#1d6ef5" backdrop={backdrop} />
        <path
          d="M12 5.2L13.7 10.3L18.8 12L13.7 13.7L12 18.8L10.3 13.7L5.2 12L10.3 10.3Z"
          fill="#ffffff"
        />
      </svg>
    );
  }
  if (code === 2) {
    return (
      <svg width={size} height={size} viewBox={viewBox} className="shrink-0 overflow-visible" aria-hidden="true">
        <BadgeBase fill="#16a34a" backdrop={backdrop} />
        <path
          d="M7.5 12.3L10.6 15.4L16.8 8.8"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.6"
          strokeLinecap={isOctagonUI ? 'square' : 'round'}
          strokeLinejoin={isOctagonUI ? 'miter' : 'round'}
        />
      </svg>
    );
  }
  if (code === 3) {
    return (
      <svg width={size} height={size} viewBox={viewBox} className="shrink-0 overflow-visible" aria-hidden="true">
        <BadgeBase fill="#f58220" backdrop={backdrop} />
        <path
          d="M9.4 9.3C9.4 7.8 10.6 6.8 12.1 6.8C13.6 6.8 14.7 7.7 14.7 9.1C14.7 10.2 14 10.9 13 11.4C12.3 11.8 12 12.2 12 13.2"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap={isOctagonUI ? 'square' : 'round'}
        />
        {isOctagonUI ? (
          <rect x="10.7" y="15.3" width="2.6" height="2.6" fill="#ffffff" />
        ) : (
          <circle cx="12" cy="16.6" r="1.4" fill="#ffffff" />
        )}
      </svg>
    );
  }
  if (code === 4) {
    return (
      <svg width={size} height={size} viewBox={viewBox} className="shrink-0 overflow-visible" aria-hidden="true">
        <BadgeBase fill="#ef3b1d" backdrop={backdrop} />
        <path d="M12 6.8V13.1" stroke="#ffffff" strokeWidth="2.6" strokeLinecap={isOctagonUI ? 'square' : 'round'} />
        {isOctagonUI ? (
          <rect x="10.7" y="15.4" width="2.6" height="2.6" fill="#ffffff" />
        ) : (
          <circle cx="12" cy="16.7" r="1.4" fill="#ffffff" />
        )}
      </svg>
    );
  }
  if (code === 5) {
    return (
      <svg width={size} height={size} viewBox={viewBox} className="shrink-0 overflow-visible" aria-hidden="true">
        <BadgeBase fill="#3f3f46" stroke="rgba(255,255,255,0.18)" backdrop={backdrop} />
        <path
          d="M8.8 8.8L15.2 15.2M15.2 8.8L8.8 15.2"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap={isOctagonUI ? 'square' : 'round'}
        />
      </svg>
    );
  }
  return null;
};

const StartProbBadge = ({ prob, variant = 'compact', size = 14, backdrop = false }) => {
  const meta = getStartProbMeta(prob);
  if (!meta) return null;

  const tooltip = `Startelf-Prognose: ${meta.label} – ${meta.description}`;

  if (variant === 'icon') {
    return (
      <span title={tooltip} aria-label={tooltip} className="inline-flex items-center shrink-0">
        <StartProbIcon code={meta.code} size={size} backdrop={backdrop} />
      </span>
    );
  }

  if (variant === 'pill') {
    return (
      <span
        title={tooltip}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md oct-sm border text-[10px] sm:text-xs font-medium shrink-0 ${meta.badgeClass}`}
      >
        <StartProbIcon code={meta.code} size={size} />
        <span>Startelf: {meta.label}</span>
      </span>
    );
  }

  // "compact" fuer Spielerkarten (Advisor & Hot Shots)
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider rounded oct-sm px-1.5 py-0.5 border shrink-0 ${meta.badgeClass}`}
    >
      <StartProbIcon code={meta.code} size={11} />
      <span>{meta.label}</span>
    </span>
  );
};

export const StartProbLegend = ({ className = '' }) => (
  <div className={`rounded-xl oct-md bg-[#0a0a0a] border border-white/10 p-3.5 ${className}`}>
    <div className="text-[10px] font-black uppercase tracking-widest text-white mb-2.5">
      Legende · Startelf-Prognose
    </div>
    <div className="space-y-2.5">
      {START_PROB_LEVELS.map((level) => (
        <div key={level.code} className="flex items-start gap-2.5">
          <div className="mt-0.5 shrink-0">
            <StartProbIcon code={level.code} size={18} />
          </div>
          <div className="text-[11px] leading-snug text-[#a1a8b8]">
            <span className="font-bold text-gray-100">{level.label}:</span>{' '}
            {level.description}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default StartProbBadge;
