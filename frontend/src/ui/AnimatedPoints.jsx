import React, { useState, useEffect } from 'react';
import { pointColor } from './LivePlayerCircle';
import { playedAnimKeys, markAnimPlayed } from '../livePointsStore';

// Animierte Punktzahl fuer Live-Updates: zaehlt per requestAnimationFrame
// fluessig vom gespeicherten Vorwert (`previousValue`) auf den aktuellen Wert
// (`value`), zeigt kurz die Richtung (+X gruen / -X rot) als Delta-Hinweis
// und respektiert prefers-reduced-motion.
const AnimatedPoints = ({
  value,
  previousValue,
  animKey,
  usePointColor = false,
  format,
  className = '',
  deltaPlacement = 'bottom',
}) => {
  const hasValue = typeof value === 'number' && !Number.isNaN(value);
  const canAnimate =
    hasValue &&
    typeof previousValue === 'number' &&
    !Number.isNaN(previousValue) &&
    previousValue !== value &&
    Boolean(animKey) &&
    !playedAnimKeys.has(animKey);

  const [displayValue, setDisplayValue] = useState(() => (canAnimate ? previousValue : value));
  const [delta, setDelta] = useState(() => (canAnimate ? value - previousValue : null));
  const [phase, setPhase] = useState(() => (canAnimate ? 'animating' : 'idle'));

  useEffect(() => {
    if (!hasValue) return undefined;

    const shouldAnimate =
      typeof previousValue === 'number' &&
      !Number.isNaN(previousValue) &&
      previousValue !== value &&
      Boolean(animKey) &&
      !playedAnimKeys.has(animKey);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!shouldAnimate || prefersReducedMotion) {
      if (shouldAnimate && prefersReducedMotion) {
        markAnimPlayed(animKey);
      }
      const rafId = window.requestAnimationFrame(() => {
        setDisplayValue(value);
        setDelta(null);
        setPhase('idle');
      });
      return () => window.cancelAnimationFrame(rafId);
    }

    const from = previousValue;
    const to = value;
    const diff = to - from;
    const duration = Math.min(1100, Math.max(600, 520 + Math.abs(diff) * 12));

    let rafId = null;
    let settleTimeoutId = null;
    let startTime = null;

    const step = (timestamp) => {
      if (startTime == null) {
        startTime = timestamp;
        setDelta(diff);
        setPhase('animating');
      }
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + diff * eased);
      setDisplayValue(current);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setDisplayValue(to);
        setPhase('settling');
        markAnimPlayed(animKey);
        settleTimeoutId = window.setTimeout(() => {
          setDelta(null);
          setPhase('idle');
        }, 1800);
      }
    };

    rafId = window.requestAnimationFrame(step);

    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
      if (settleTimeoutId != null) window.clearTimeout(settleTimeoutId);
    };
  }, [value, previousValue, animKey, hasValue]);

  if (!hasValue) {
    return <span className={`${usePointColor ? pointColor(null) : ''} ${className}`}>–</span>;
  }

  const shownNumber = typeof displayValue === 'number' ? displayValue : value;
  const formatted = format ? format(shownNumber) : String(shownNumber);
  const colorClass = usePointColor ? pointColor(shownNumber) : '';
  const directionClass =
    phase === 'animating' && delta != null
      ? delta > 0
        ? 'live-points-pop-up'
        : 'live-points-pop-down'
      : '';

  const showDelta = delta != null && delta !== 0 && phase !== 'idle';
  const deltaText = showDelta ? `${delta > 0 ? '+' : ''}${delta}` : '';
  const deltaColor = delta > 0 ? 'text-emerald-400' : 'text-[#ff5c3e]';
  const deltaPillStyle =
    delta > 0
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : 'bg-[#ff5c3e]/15 text-[#ff5c3e] border-[#ff5c3e]/30';

  if (deltaPlacement === 'left') {
    return (
      <span className="inline-flex items-center justify-end gap-1.5">
        {showDelta && (
          <span
            key={animKey}
            className={`text-[10px] font-black leading-none px-1.5 py-0.5 rounded-full border tabular-nums live-delta-badge ${deltaPillStyle}`}
          >
            {deltaText}
          </span>
        )}
        <span className={`inline-block tabular-nums transition-colors duration-300 ${colorClass} ${className} ${directionClass}`}>
          {formatted}
        </span>
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center justify-center">
      <span className={`inline-block tabular-nums transition-colors duration-300 ${colorClass} ${className} ${directionClass}`}>
        {formatted}
      </span>
      {showDelta && (
        <span
          key={animKey}
          className={`absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-black leading-none whitespace-nowrap pointer-events-none tabular-nums live-delta-badge ${deltaColor}`}
        >
          {deltaText}
        </span>
      )}
    </span>
  );
};

export default AnimatedPoints;
