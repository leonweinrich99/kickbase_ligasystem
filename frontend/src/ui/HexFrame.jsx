import React from 'react';
import { isOctagonUI } from './shapeTheme';

// Spitzes, stehendes Hexagon (exakte Proportion passend zu unseren Logo-Hexagonen).
const SHARP_HEX_CLIP = 'polygon(50% 2%, 94% 26%, 94% 74%, 50% 98%, 6% 74%, 6% 26%)';
const SHARP_HEX_POINTS = '50,2.5 93.5,26.2 93.5,73.8 50,97.5 6.5,73.8 6.5,26.2';

/**
 * Zentrale Hexagon-Hülle für ehemals runde Elemente (Kader-Spieler, Live-Spielfeld,
 * Manager-Avatare, Regel-Knoten).
 *
 * Schaltet über `shapeTheme.js` (`UI_SHAPE = 'octagon' | 'rounded'`) nahtlos
 * zwischen scharfem Hexagon (mit 6-Kanten-Rahmen & Glow) und klassischem Kreis um.
 */
const HexFrame = React.forwardRef(function HexFrame(
  {
    children,
    className = '',
    innerClassName = '',
    style,
    ringColor = 'rgba(255, 255, 255, 0.22)',
    ringWidth = 2.6,
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
          border: ringColor ? `${dashed ? 1 : Math.max(1, Math.round(ringWidth / 1.8))}px ${dashed ? 'dashed' : 'solid'} ${ringColor}` : undefined,
        }}
        {...rest}
      >
        {children}
      </div>
    );
  }

  const outerStyle = {
    ...style,
    ...(glowColor ? { filter: `drop-shadow(0 0 10px ${glowColor})` } : {}),
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
            strokeWidth={glowColor ? Math.max(ringWidth, 4) : ringWidth}
            strokeDasharray={dashed ? '8 6' : undefined}
            strokeLinejoin="miter"
          />
        </svg>
      )}
    </div>
  );
});

export default HexFrame;
