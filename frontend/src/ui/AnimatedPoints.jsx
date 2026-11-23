import React, { useState, useEffect, useRef } from 'react';
import { pointColor } from './LivePlayerCircle';
import { playedAnimKeys, markAnimPlayed } from '../livePointsStore';

const isReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Animierte Punktzahl fuer Live-Ansichten:
// 1) Initialer Aufruf (`animateOnMount`, Standard: true): zaehlt beim ersten
//    Einblenden sanft von 0 auf den aktuellen Stand (ohne Delta-Badge).
// 2) Live-Update (`previousValue !== value` + ungespielter `animKey`): zaehlt
//    fluessig vom gespeicherten Vorwert auf den neuen Stand mit Pop/Glow und
//    +X / -X Delta-Hinweis.
const AnimatedPoints = ({
  value,
  previousValue,
  animKey,
  animateOnMount = true,
  usePointColor = false,
  format,
  className = '',
  deltaPlacement = 'bottom',
}) => {
  const hasValue = typeof value === 'number' && !Number.isNaN(value);
  const canLiveAnimate =
    hasValue &&
    typeof previousValue === 'number' &&
    !Number.isNaN(previousValue) &&
    previousValue !== value &&
    Boolean(animKey) &&
    !playedAnimKeys.has(animKey);

  const initialValue = (() => {
    if (!hasValue || isReducedMotion()) return value;
    if (canLiveAnimate) return previousValue;
    if (animateOnMount && value !== 0) return 0;
    return value;
  })();

  const [displayValue, setDisplayValue] = useState(initialValue);
  const [delta, setDelta] = useState(() => (canLiveAnimate && !isReducedMotion() ? value - previousValue : null));
  const [phase, setPhase] = useState(() => (canLiveAnimate && !isReducedMotion() ? 'animating' : 'idle'));

  const currentDisplayedRef = useRef(initialValue);
  const hasRevealedRef = useRef(!animateOnMount || !hasValue || value === 0 || isReducedMotion());

  useEffect(() => {
    if (!hasValue) return undefined;

    const shouldLiveAnimate =
      typeof previousValue === 'number' &&
      !Number.isNaN(previousValue) &&
      previousValue !== value &&
      Boolean(animKey) &&
      !playedAnimKeys.has(animKey);

    const reducedMotion = isReducedMotion();

    if (reducedMotion) {
      if (shouldLiveAnimate) markAnimPlayed(animKey);
      hasRevealedRef.current = true;
      currentDisplayedRef.current = value;
      const rafId = window.requestAnimationFrame(() => {
        setDisplayValue(value);
        setDelta(null);
        setPhase('idle');
      });
      return () => window.cancelAnimationFrame(rafId);
    }

    // Fall A: Echtes Live-Update (Vorwert != neuer Wert) -> Pop/Glow + Delta-Badge.
    if (shouldLiveAnimate) {
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
        currentDisplayedRef.current = current;
        setDisplayValue(current);

        if (progress < 1) {
          rafId = window.requestAnimationFrame(step);
        } else {
          currentDisplayedRef.current = to;
          hasRevealedRef.current = true;
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
    }

    // Fall B: Initiales Hoch-/Runterzaehlen beim ersten Anzeigen (0 -> aktueller Stand).
    // Falls waehrenddessen schon eine identische API-Antwort eintrifft, laeuft die
    // Animation einfach nahtlos vom aktuellen Zwischenstand zu Ende.
    const shouldReveal = animateOnMount && !hasRevealedRef.current && currentDisplayedRef.current !== value;
    if (shouldReveal) {
      const from = typeof currentDisplayedRef.current === 'number' ? currentDisplayedRef.current : 0;
      const to = value;
      const diff = to - from;
      const duration = Math.min(850, Math.max(480, 460 + Math.min(Math.abs(diff), 400) * 0.95));

      let rafId = null;
      let startTime = null;

      const step = (timestamp) => {
        if (startTime == null) {
          startTime = timestamp;
        }
        const elapsed = timestamp - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(from + diff * eased);
        currentDisplayedRef.current = current;
        setDisplayValue(current);

        if (progress < 1) {
          rafId = window.requestAnimationFrame(step);
        } else {
          currentDisplayedRef.current = to;
          hasRevealedRef.current = true;
          setDisplayValue(to);
        }
      };

      rafId = window.requestAnimationFrame(step);
      return () => {
        if (rafId != null) window.cancelAnimationFrame(rafId);
      };
    }

    // Fall C: Keine Animation noetig -> sauber auf Zielwert synchronisieren.
    hasRevealedRef.current = true;
    currentDisplayedRef.current = value;
    const rafId = window.requestAnimationFrame(() => {
      setDisplayValue(value);
      setDelta(null);
      setPhase('idle');
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [value, previousValue, animKey, animateOnMount, hasValue]);

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
