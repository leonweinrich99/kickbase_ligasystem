import React from 'react';
import { isOctagonUI } from './shapeTheme';

// Spitzes, stehendes Hexagon — etwas höher als breit (ca. 0,80:1 wie logo.png).
const SHARP_HEX_CLIP = 'polygon(50% 1%, 90% 25.5%, 90% 74.5%, 50% 99%, 10% 74.5%, 10% 25.5%)';
const SHARP_HEX_POINTS = '50,1.5 89.5,25.5 89.5,74.5 50,98.5 10.5,74.5 10.5,25.5';

/**
 * Zentrale Hexagon-Hülle für ehemals runde Elemente (Kader-Spieler, Live-Spielfeld,
 * Manager-Avatare, Regel-Knoten).
 *
 * Nutzt `vectorEffect="non-scaling-stroke"`, sodass Rahmenstärken (`ringWidth` in px)
 * bei 36px-Avataren wie bei 140px-Profilbildern immer gleich fein und präzise bleiben.
 */
const HexFrame = React.forwardRef(function HexFrame(
  {
    children,
    className = '',
    innerClassName = '',
    style,
    ringColor = 'rgba(255, 255, 255, 0.22)',
    ringWidth = 1.5,
    dashed = false,
    glowColor = null,
    roundClassName = '',
    ...rest
  },
  ref
) {
  if (!isOctagonUI) {
    const roundStyle = {
      ...style,
      ...(ringColor && !dashed ? { boxShadow: glowColor ? `0 0 0 2px ${glowColor}, 0 0 18px ${glowColor}` : undefined } : {}),
    };
    return (
      <div
        ref={ref}
        className={`relative rounded-full overflow-hidden flex items-center justify-center ${roundClassName} ${className}`}
        style={{
          ...roundStyle,
          border: ringColor ? `${dashed ? 1 : Math.max(1, ringWidth)}px ${dashed ? 'dashed' : 'solid'} ${ringColor}` : undefined,
        }}
        {...rest}
      >
        {children}
      </div>
    );
  }

  const outerStyle = {
    ...style,
    ...(glowColor ? { filter: `drop-shadow(0 0 8px ${glowColor})` } : {}),
  };

  return (
    <div
      ref={ref}
      className={`relative inline-flex items-center justify-center ${className}`}
      style={outerStyle}
      {...rest}
    >
      <div
        className={`w-full h-full overflow-hidden flex items-center justify-center ${innerClassName}`}
        style={{ clipPath: SHARP_HEX_CLIP }}
      >
        {children}
      </div>

      {ringColor && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
        >
          <polygon
            points={SHARP_HEX_POINTS}
            fill="none"
            stroke={glowColor || ringColor}
            strokeWidth={ringWidth}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={dashed ? '4 3' : undefined}
            strokeLinejoin="miter"
          />
        </svg>
      )}
    </div>
  );
});

export default HexFrame;
