import React from 'react';
import { isOctagonUI } from './shapeTheme';

/**
 * Recharts Custom-Bar-Shape mit 45°-Chamfer an beiden oberen Ecken + dezentem
 * 2-Ton-Facetten-Split (wie unsere Kickbase-Logos/Icons).
 * Schaltet über `shapeTheme.js` nahtlos auf klassische runde Balken zurück.
 */
export function ChamferedBar(props) {
  const { x, y, width, height, fill = '#ff5c3e' } = props;
  if (x == null || y == null || width == null || height == null) return null;

  const absH = Math.abs(height);
  if (absH < 0.5 || width <= 0) return null;

  const topY = height >= 0 ? y : y + height;
  const botY = topY + absH;

  if (!isOctagonUI) {
    const r = Math.min(4, width / 2, absH);
    const d = `M ${x},${botY} L ${x},${topY + r} Q ${x},${topY} ${x + r},${topY} L ${x + width - r},${topY} Q ${x + width},${topY} ${x + width},${topY + r} L ${x + width},${botY} Z`;
    return <path d={d} fill={fill} />;
  }

  const c = Math.min(5, width * 0.34, absH * 0.45);
  const midX = x + width / 2;

  const fullPts = [
    `${x},${botY}`,
    `${x},${topY + c}`,
    `${x + c},${topY}`,
    `${x + width - c},${topY}`,
    `${x + width},${topY + c}`,
    `${x + width},${botY}`,
  ].join(' ');

  const rightShadePts = [
    `${midX},${botY}`,
    `${midX},${topY}`,
    `${x + width - c},${topY}`,
    `${x + width},${topY + c}`,
    `${x + width},${botY}`,
  ].join(' ');

  return (
    <g>
      <polygon points={fullPts} fill={fill} />
      <polygon points={rightShadePts} fill="#000000" opacity="0.18" />
    </g>
  );
}

/**
 * Scharfes stehendes Hexagon als ActiveDot für Recharts LineCharts.
 */
export function HexActiveDot(props) {
  const { cx, cy, stroke, fill, r = 7.5 } = props;
  if (cx == null || cy == null) return null;
  const col = fill || stroke || '#ffffff';

  if (!isOctagonUI) {
    return <circle cx={cx} cy={cy} r={r} fill={col} strokeWidth={0} />;
  }

  const rx = r * 0.8;
  const ry = r;
  const pts = [
    `${cx},${cy - ry}`,
    `${cx + rx},${cy - ry * 0.5}`,
    `${cx + rx},${cy + ry * 0.5}`,
    `${cx},${cy + ry}`,
    `${cx - rx},${cy + ry * 0.5}`,
    `${cx - rx},${cy - ry * 0.5}`,
  ].join(' ');

  return <polygon points={pts} fill={col} stroke="#0a0a0c" strokeWidth={1.5} strokeLinejoin="miter" />;
}

/**
 * Kompaktes scharfes Hexagon für kleine Prognose-Datenpunkte (z.B. Advisor).
 */
export function HexSmallDot(props) {
  const { cx, cy, stroke, fill, r = 3.6 } = props;
  if (cx == null || cy == null) return null;
  const col = fill || stroke || '#eab308';

  if (!isOctagonUI) {
    return <circle cx={cx} cy={cy} r={r} fill={col} strokeWidth={0} />;
  }

  const rx = r * 0.8;
  const ry = r;
  const pts = [
    `${cx},${cy - ry}`,
    `${cx + rx},${cy - ry * 0.5}`,
    `${cx + rx},${cy + ry * 0.5}`,
    `${cx},${cy + ry}`,
    `${cx - rx},${cy + ry * 0.5}`,
    `${cx - rx},${cy - ry * 0.5}`,
  ].join(' ');

  return <polygon points={pts} fill={col} />;
}
