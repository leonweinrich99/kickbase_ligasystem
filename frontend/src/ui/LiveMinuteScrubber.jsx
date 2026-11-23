import React, { useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

const STEP_PX = 14;
// Fluessige Wiedergabe-Geschwindigkeit: ~8 Minuten/Sekunde (~11s fuer 90 Min)
// per 60/120fps requestAnimationFrame statt abgehackter 1-Minuten-Spruenge.
const PLAY_MINUTES_PER_SEC = 8;

const formatMinuteLabel = (minute, maxMinute, hasLive, anyFinished) => {
  if (minute >= maxMinute) {
    if (hasLive) return `LIVE ${maxMinute}'`;
    if (anyFinished) return maxMinute > 90 ? `90+${maxMinute - 90}' · Ende` : `${maxMinute}' · Ende`;
    return `${maxMinute}'`;
  }
  if (minute === 0) return "0' · Anpfiff";
  if (minute === 45) return "45' · Halbzeit";
  if (minute > 90) return `90+${minute - 90}'`;
  return `${minute}'`;
};

// Horizontaler Minuten-Scrubber (Lineal-Optik): jede einzelne Spielminute von
// 0 bis maxMinute laesst sich per Touch-Swipe, Maus-Drag, Klick oder sanfter
// 60fps-Wiedergabe ansteuern. Farbpunkte ueber den Strichen markieren Minuten
// mit Punkt-Events im Kader.
const LiveMinuteScrubber = ({
  maxMinute,
  activeMinute,
  isLiveEdge,
  hasLive,
  anyFinished,
  minuteDeltas,
  isPlaying,
  resetToken = 0,
  onSelectMinute,
  onResetToLive,
  onTogglePlay,
  onPausePlay,
  onFinishPlay,
}) => {
  const scrollerRef = useRef(null);
  const programmaticRef = useRef(false);
  const programmaticTimerRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startScrollLeft: 0, moved: false });
  const initSyncedRef = useRef(false);
  const lastReportedMinuteRef = useRef(activeMinute);

  const scrollToMinute = useCallback((minute, behavior = 'auto') => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(maxMinute, minute)) * STEP_PX;
    if (Math.abs(el.scrollLeft - target) < 1) return;
    programmaticRef.current = true;
    if (programmaticTimerRef.current != null) {
      window.clearTimeout(programmaticTimerRef.current);
    }
    el.scrollTo({ left: target, behavior });
    programmaticTimerRef.current = window.setTimeout(() => {
      programmaticRef.current = false;
      programmaticTimerRef.current = null;
    }, behavior === 'smooth' ? 350 : 45);
  }, [maxMinute]);

  // Initial sofort vor dem ersten Paint auf die aktuelle Minute positionieren.
  useLayoutEffect(() => {
    if (!initSyncedRef.current) {
      initSyncedRef.current = true;
      lastReportedMinuteRef.current = activeMinute;
      scrollToMinute(activeMinute, 'auto');
    }
  }, [activeMinute, scrollToMinute]);

  // Butterweiche 60/120fps-Wiedergabe direkt ueber kontinuierliches scrollLeft
  // in requestAnimationFrame (React rendert nur beim Ueberschreiten einer vollen
  // Minute neu, waehrend das Lineal kontinuierlich Pixel fuer Pixel gleitet).
  useEffect(() => {
    if (!isPlaying) return undefined;
    const el = scrollerRef.current;
    if (!el) return undefined;

    const maxScroll = maxMinute * STEP_PX;
    const pxPerMs = (PLAY_MINUTES_PER_SEC * STEP_PX) / 1000;

    // Wenn wir am Ende standen, direkt von Minute 0 starten.
    let virtualScroll = el.scrollLeft >= maxScroll - 2 ? 0 : el.scrollLeft;
    if (virtualScroll === 0) {
      programmaticRef.current = true;
      el.scrollLeft = 0;
      lastReportedMinuteRef.current = 0;
      onSelectMinute(0);
    }

    let rafId = null;
    let lastTs = null;

    const tick = (ts) => {
      if (lastTs == null) {
        lastTs = ts;
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(64, ts - lastTs);
      lastTs = ts;

      virtualScroll = Math.min(maxScroll, virtualScroll + dt * pxPerMs);
      programmaticRef.current = true;
      el.scrollLeft = virtualScroll;

      const minute = Math.max(0, Math.min(maxMinute, Math.round(virtualScroll / STEP_PX)));
      if (minute !== lastReportedMinuteRef.current) {
        lastReportedMinuteRef.current = minute;
        onSelectMinute(minute);
      }

      if (virtualScroll >= maxScroll) {
        programmaticRef.current = false;
        onFinishPlay();
      } else {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
      programmaticRef.current = false;
    };
  }, [isPlaying, maxMinute, onSelectMinute, onFinishPlay]);

  // Sprung ans Ende (z.B. ueber das Minuten-Badge oben rechts oder "Aktuell").
  useEffect(() => {
    if (resetToken > 0) {
      lastReportedMinuteRef.current = maxMinute;
      scrollToMinute(maxMinute, 'smooth');
    }
  }, [resetToken, maxMinute, scrollToMinute]);

  useEffect(() => () => {
    if (programmaticTimerRef.current != null) {
      window.clearTimeout(programmaticTimerRef.current);
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (programmaticRef.current || isPlaying) return;
    const el = scrollerRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(maxMinute, Math.round(el.scrollLeft / STEP_PX)));
    if (next !== lastReportedMinuteRef.current) {
      lastReportedMinuteRef.current = next;
      onSelectMinute(next);
    }
  }, [maxMinute, isPlaying, onSelectMinute]);

  // Desktop-Maus-Drag fuer komfortables Ziehen ohne horizontales Trackpad.
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    if (isPlaying) onPausePlay();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragRef.current.active) return;
      const dx = moveEvent.clientX - dragRef.current.startX;
      if (Math.abs(dx) > 3) dragRef.current.moved = true;
      el.scrollLeft = dragRef.current.startScrollLeft - dx;
    };

    const handleMouseUp = () => {
      dragRef.current.active = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTickClick = (minute) => {
    if (dragRef.current.moved) return;
    if (isPlaying) onPausePlay();
    lastReportedMinuteRef.current = minute;
    onSelectMinute(minute);
    scrollToMinute(minute, 'smooth');
  };

  const handleJumpLive = () => {
    lastReportedMinuteRef.current = maxMinute;
    onResetToLive();
    scrollToMinute(maxMinute, 'smooth');
  };

  const minutes = Array.from({ length: maxMinute + 1 }, (_, i) => i);

  return (
    <div className="mt-3 card-surface rounded-2xl px-3.5 py-3 select-none">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Wiedergabe pausieren' : 'Spielverlauf abspielen'}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors active:scale-95"
          >
            {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
          </button>
          <span className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5]">
            Spielverlauf
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs font-black tabular-nums ${isLiveEdge ? 'text-white' : 'text-[#ff5c3e]'}`}>
            {formatMinuteLabel(activeMinute, maxMinute, hasLive, anyFinished)}
          </span>
          {!isLiveEdge && (
            <button
              type="button"
              onClick={handleJumpLive}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#ff5c3e]/15 border border-[#ff5c3e]/40 text-[#ff5c3e] hover:bg-[#ff5c3e]/25 transition-colors"
            >
              <RotateCcw size={10} />
              Aktuell
            </button>
          )}
        </div>
      </div>

      {/* Scrollbares Minuten-Lineal mit fester Mittelmarkierung */}
      <div className="relative h-12">
        {/* Fade-Kanten links & rechts */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#101010] to-transparent z-10 rounded-l-lg" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#101010] to-transparent z-10 rounded-r-lg" />

        {/* Feste rote Mittel-Nadel */}
        <div className="pointer-events-none absolute top-1 bottom-3 left-1/2 -translate-x-1/2 w-[2px] rounded-full bg-[#ff5c3e] shadow-[0_0_8px_rgba(255,92,62,0.8)] z-20" />

        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
          onTouchStart={() => { if (isPlaying) onPausePlay(); }}
          className="h-full overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing flex items-end"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Linker Spacer, damit Minute 0 exakt unter der Mitte liegt */}
          <div className="shrink-0" style={{ width: `calc(50% - ${STEP_PX / 2}px)` }} />

          <div className="flex items-end shrink-0">
            {minutes.map((m) => {
              const isMajor = m === 0 || m === 45 || m === 90 || m === maxMinute;
              const isFifteen = m % 15 === 0;
              const isFive = m % 5 === 0;
              const isActive = m === activeMinute;
              const netDelta = minuteDeltas?.get(m) || 0;
              const showLabel =
                m === 0 ||
                m === maxMinute ||
                ((m === 45 || m === 90 || isFifteen) && Math.abs(m - maxMinute) >= 4);

              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleTickClick(m)}
                  aria-label={`Minute ${m}`}
                  style={{ width: `${STEP_PX}px` }}
                  className="shrink-0 flex flex-col items-center justify-end h-12 pb-0.5 focus:outline-none group"
                >
                  {/* Kleiner Event-Punkt ueber Minuten mit Punkt-Aktionen */}
                  <span className="h-1.5 flex items-center justify-center mb-1">
                    {netDelta !== 0 && (
                      <span
                        className={`rounded-full ${
                          Math.abs(netDelta) >= 15 ? 'w-1.5 h-1.5' : 'w-1 h-1'
                        } ${netDelta > 0 ? 'bg-emerald-400' : 'bg-[#ff5c3e]'}`}
                      />
                    )}
                  </span>

                  {/* Strich-Markierung */}
                  <span
                    className={`rounded-full transition-colors ${
                      isActive
                        ? 'h-5 w-[2px] bg-[#ff5c3e]'
                        : isMajor
                          ? 'h-4 w-[1.5px] bg-white/75 group-hover:bg-white'
                          : isFive
                            ? 'h-3 w-[1.5px] bg-white/40 group-hover:bg-white/70'
                            : 'h-2 w-[1px] bg-white/20 group-hover:bg-white/50'
                    }`}
                  />

                  {/* Minuten-Beschriftung */}
                  <span className="h-3.5 mt-0.5 flex items-center justify-center">
                    {showLabel && (
                      <span
                        className={`text-[9px] font-bold leading-none tabular-nums whitespace-nowrap ${
                          isActive ? 'text-[#ff5c3e]' : 'text-[#8b92a5]'
                        }`}
                      >
                        {m === 45 ? 'HZ' : `${m}'`}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Rechter Spacer, damit maxMinute exakt unter der Mitte liegt */}
          <div className="shrink-0" style={{ width: `calc(50% - ${STEP_PX / 2}px)` }} />
        </div>
      </div>
    </div>
  );
};

export default LiveMinuteScrubber;
