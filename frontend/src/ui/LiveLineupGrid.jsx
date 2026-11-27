import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LivePlayerCircle from './LivePlayerCircle';
import AnimatedPoints from './AnimatedPoints';
import LiveMinuteScrubber from './LiveMinuteScrubber';
import LiveHighlightOverlay from './LiveHighlightOverlay';
import {
  classifyHighlightEvent,
  HIGHLIGHT_ACCENT_COLOR,
  HIGHLIGHT_ICON,
  HIGHLIGHT_PRIORITY,
} from '../liveLineupUtils';

// Gemeinsame Live-Pitch-Darstellung fuer alle Stellen, die eine Startelf mit
// Live-Punkten zeigen (LiveLineupPage.jsx "Live Punkte" UND UserDetail.jsx
// Manager-Profil, Owner-Wunsch 23.11.2026: "zeig die Live-Punkte-Anzeige
// auch im Manager-Profil, aktuell ist die Anzeige dort unterschiedlich" -
// beide Stellen nutzen jetzt exakt dieselbe Komponente + dieselbe Datenquelle
// (frontend/api/live-lineup.js), damit die Zahlen nie wieder auseinanderlaufen
// koennen.
//
// Klick auf einen Spieler navigiert zu einer EIGENEN Seite (PlayerLiveDetailPage,
// Owner-Wunsch 23.11.2026: "als extra Seite machen und nicht als Overlay")
// mit der Event-Liste ("Pass +2" usw.) - moeglich seit
// frontend/api/_kickbaseClient.js::getEventTypeMap die eti-Codes aus den
// playercenter-events via /v4/live/eventtypes in Klartext uebersetzt. Die
// Spielerdaten werden per Router-State mitgegeben (kein Extra-Fetch noetig).
//
// Minuten-Timeline (Owner-Wunsch 24.11.2026): oben rechts im Spielfeld wird
// die aktuelle Spielminute angezeigt; unterhalb des Kaders erlaubt ein
// horizontaler Minuten-Scrubber das minutengenaue Scrollen (0' bis Spielende/
// aktuelle Minute), wobei die Spieler- und Gesamtpunkte live aus den geladenen
// Events neu berechnet werden.

export const LiveRow = ({
  players,
  onPlayerClick,
  prevPointsMap,
  animId,
  isScrubbing,
  activeMinute,
  registerAvatarRef,
  landedHighlight,
}) => {
  if (!players || players.length === 0) return null;
  const itemCount = players.length;
  const size = itemCount > 4 ? 'w-12 h-12 sm:w-14 sm:h-14' : 'w-14 h-14 sm:w-16 sm:h-16';
  const containerSize = itemCount > 4 ? 'w-[62px] sm:w-[76px]' : 'w-[72px] sm:w-[86px]';
  return (
    <div className="flex justify-center items-start flex-nowrap gap-1 sm:gap-4 w-full px-2 mb-4 last:mb-0 overflow-visible">
      {players.map((p) => (
        <LivePlayerCircle
          key={p.id}
          imagePath={p.imagePath}
          name={p.name}
          displayName={p.lastName || p.name}
          points={p.displayPoints}
          prevPoints={!p.isDummy ? prevPointsMap?.[String(p.id)] : undefined}
          animKey={!p.isDummy && animId != null ? `${animId}:p:${p.id}` : null}
          instant={isScrubbing}
          instantDelta={p.minuteDelta || 0}
          instantKey={isScrubbing ? `m:${activeMinute}:${p.id}` : null}
          avatarRef={!p.isDummy && registerAvatarRef ? (el) => registerAvatarRef(String(p.id), el) : null}
          highlightedColor={landedHighlight && String(landedHighlight.playerId) === String(p.id) ? landedHighlight.color : null}
          size={size}
          containerSize={containerSize}
          onClick={!p.isDummy && onPlayerClick ? () => onPlayerClick(p) : undefined}
        />
      ))}
    </div>
  );
};

// Der dunkle Spielfeld-Rahmen selbst (Hintergrund + Feldlinien-Dekoration +
// Minuten-Anzeige oben rechts + die 4 Positionsreihen + Gesamtpunkte-Box unten
// rechts) plus Minuten-Scrubber darunter. Navigiert bei Spieler-Klick selbst
// zur Detailseite (immer mit dem vollstaendigen Original-Spielerobjekt).
const LiveLineupPitch = ({ lineup, totalPoints, prevPointsMap, animId }) => {
  const navigate = useNavigate();
  const openPlayer = (player) => navigate('/live-player', { state: { player } });

  // Minuten-Metadaten + Highlight-Index (Tore, Vorlagen, gehaltene 11m) aus den Events ableiten.
  const timelineMeta = useMemo(() => {
    const realPlayers = (lineup || []).filter((p) => !p.isDummy);
    let maxEventMin = 0;
    let maxMatchMin = 0;
    let hasAnyEvents = false;
    let hasLive = false;
    let anyFinished = false;
    const minuteDeltas = new Map();
    const minuteHighlights = new Map();
    const highlightsByType = { goal: [], assist: [], penalty_save: [] };

    for (const p of realPlayers) {
      if (p.matchStatus === 2) {
        anyFinished = true;
      } else if (typeof p.matchMinute === 'number' && p.matchMinute > 0) {
        hasLive = true;
      }
      if (typeof p.matchMinute === 'number' && p.matchMinute > maxMatchMin) {
        maxMatchMin = Math.min(120, p.matchMinute);
      }
      if (Array.isArray(p.events) && p.events.length > 0) {
        hasAnyEvents = true;
        for (const ev of p.events) {
          const m = Math.max(0, Math.min(120, typeof ev.minute === 'number' ? ev.minute : 0));
          if (m > maxEventMin) maxEventMin = m;
          minuteDeltas.set(m, (minuteDeltas.get(m) || 0) + (ev.points || 0));

          const hlType = classifyHighlightEvent(ev);
          if (hlType) {
            const item = { type: hlType, player: p, points: ev.points, minute: m };
            highlightsByType[hlType].push(item);
            if (!minuteHighlights.has(m)) minuteHighlights.set(m, []);
            minuteHighlights.get(m).push(item);
          }
        }
      }
    }

    for (const list of minuteHighlights.values()) {
      list.sort((a, b) => (HIGHLIGHT_PRIORITY[b.type] || 0) - (HIGHLIGHT_PRIORITY[a.type] || 0));
    }
    for (const list of Object.values(highlightsByType)) {
      list.sort((a, b) => a.minute - b.minute);
    }

    const baseMax = Math.max(maxEventMin, maxMatchMin, anyFinished ? 90 : 0);
    const maxMinute = hasAnyEvents ? Math.max(1, baseMax) : 0;

    return {
      hasTimeline: hasAnyEvents && maxMinute > 0,
      maxMinute,
      hasLive,
      anyFinished,
      minuteDeltas,
      minuteHighlights,
      highlightsByType,
    };
  }, [lineup]);

  // `selectedMinute === null` bedeutet: folgt automatisch dem aktuellen/letzten Stand.
  const [selectedMinute, setSelectedMinute] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetToken, setResetToken] = useState(0);

  const activeMinute = selectedMinute == null
    ? timelineMeta.maxMinute
    : Math.min(selectedMinute, timelineMeta.maxMinute);
  const isLiveEdge = selectedMinute == null || activeMinute >= timelineMeta.maxMinute;
  const isScrubbing = timelineMeta.hasTimeline && (!isLiveEdge || isPlaying);

  const handleSelectMinute = useCallback((minute) => {
    if (minute >= timelineMeta.maxMinute) {
      setSelectedMinute(null);
    } else {
      setSelectedMinute(minute);
    }
  }, [timelineMeta.maxMinute]);

  const handleResetToLive = useCallback(() => {
    setIsPlaying(false);
    setSelectedMinute(null);
    setResetToken((t) => t + 1);
  }, []);

  const handleFinishPlay = useCallback(() => {
    setIsPlaying(false);
    setSelectedMinute(null);
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  // Punkte je Spieler fuer die gewaehlte Minute berechnen. Am rechten Rand
  // (`isLiveEdge && !isPlaying`) stehen immer exakt die offiziellen Punkte.
  const computed = useMemo(() => {
    if (!isScrubbing) {
      return {
        players: (lineup || []).map((p) => ({
          ...p,
          displayPoints: p.points,
          minuteDelta: 0,
        })),
        total: totalPoints,
        totalMinuteDelta: 0,
      };
    }

    let sumTotal = 0;
    let hasNumeric = false;
    let sumMinuteDelta = 0;

    const mapped = (lineup || []).map((p) => {
      if (p.isDummy || p.points == null) {
        return { ...p, displayPoints: p.points, minuteDelta: 0 };
      }

      if (activeMinute >= timelineMeta.maxMinute) {
        sumTotal += p.points;
        hasNumeric = true;
        let mDelta = 0;
        for (const ev of p.events || []) {
          const em = Math.max(0, Math.min(120, typeof ev.minute === 'number' ? ev.minute : 0));
          if (em === activeMinute) mDelta += ev.points || 0;
        }
        sumMinuteDelta += mDelta;
        return { ...p, displayPoints: p.points, minuteDelta: mDelta };
      }

      let pts = 0;
      let mDelta = 0;
      const evs = p.events || [];
      for (const ev of evs) {
        const em = Math.max(0, Math.min(120, typeof ev.minute === 'number' ? ev.minute : 0));
        if (em <= activeMinute) {
          pts += ev.points || 0;
        }
        if (em === activeMinute) {
          mDelta += ev.points || 0;
        }
      }
      sumTotal += pts;
      sumMinuteDelta += mDelta;
      hasNumeric = true;
      return { ...p, displayPoints: pts, minuteDelta: mDelta };
    });

    return {
      players: mapped,
      total: hasNumeric ? sumTotal : totalPoints,
      totalMinuteDelta: sumMinuteDelta,
    };
  }, [lineup, totalPoints, isScrubbing, activeMinute, timelineMeta.maxMinute]);

  const st = computed.players.filter((p) => p.position === 4);
  const mf = computed.players.filter((p) => p.position === 3 || p.position === 0);
  const aw = computed.players.filter((p) => p.position === 2);
  const tw = computed.players.filter((p) => p.position === 1);

  // Refs & State fuer die Aktions-Animationen (Tor, Vorlage, 11m gehalten)
  const pitchRef = useRef(null);
  const avatarRefs = useRef(new Map());
  const highlightIdRef = useRef(0);
  const landedTimerRef = useRef(null);
  const lastScrubHighlightRef = useRef('');
  const seenLiveHighlightsRef = useRef(null);
  const highlightCycleRef = useRef({ goal: 0, assist: 0, penalty_save: 0 });

  const [activeHighlight, setActiveHighlight] = useState(null);
  const [landedHighlight, setLandedHighlight] = useState(null);

  const registerAvatarRef = useCallback((id, el) => {
    if (el) {
      avatarRefs.current.set(id, el);
    } else {
      avatarRefs.current.delete(id);
    }
  }, []);

  const triggerHighlight = useCallback((type, player, points = null, minute = null) => {
    if (!player) return;
    const pitchEl = pitchRef.current;
    const avatarEl = avatarRefs.current.get(String(player.id));

    let targetX = 0;
    let targetY = 0;
    let targetScale = 0.45;
    if (pitchEl && avatarEl) {
      const pitchRect = pitchEl.getBoundingClientRect();
      const avatarRect = avatarEl.getBoundingClientRect();
      targetX = (avatarRect.left + avatarRect.width / 2) - (pitchRect.left + pitchRect.width / 2);
      targetY = (avatarRect.top + avatarRect.height / 2) - (pitchRect.top + pitchRect.height / 2);
      targetScale = Math.max(0.32, Math.min(0.8, avatarRect.width / 128));
    }

    if (landedTimerRef.current) {
      window.clearTimeout(landedTimerRef.current);
      landedTimerRef.current = null;
    }
    setLandedHighlight(null);

    highlightIdRef.current += 1;
    setActiveHighlight({
      id: highlightIdRef.current,
      type,
      player,
      points,
      minute,
      targetX,
      targetY,
      targetScale,
    });
  }, []);

  const handleHighlightLand = useCallback((hl) => {
    if (!hl?.player) return;
    setLandedHighlight({
      playerId: String(hl.player.id),
      color: HIGHLIGHT_ACCENT_COLOR[hl.type] || '#22c55e',
    });
    if (landedTimerRef.current) window.clearTimeout(landedTimerRef.current);
    landedTimerRef.current = window.setTimeout(() => {
      setLandedHighlight(null);
      landedTimerRef.current = null;
    }, 900);
  }, []);

  const handleHighlightComplete = useCallback(() => {
    setActiveHighlight(null);
  }, []);

  useEffect(() => () => {
    if (landedTimerRef.current) window.clearTimeout(landedTimerRef.current);
  }, []);

  // Auto-Trigger 1: Beim Scrubben/Abspielen der Minuten-Timeline
  useEffect(() => {
    if (!isScrubbing) {
      lastScrubHighlightRef.current = '';
      return undefined;
    }

    const hlList = timelineMeta.minuteHighlights.get(activeMinute);
    const best = hlList?.[0] || null;

    if (!best) return undefined;
    const dedupKey = `${activeMinute}:${best.player.id}:${best.type}`;
    if (lastScrubHighlightRef.current === dedupKey) return undefined;
    lastScrubHighlightRef.current = dedupKey;

    const rafId = window.requestAnimationFrame(() => {
      triggerHighlight(best.type, best.player, best.points, best.minute);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [isScrubbing, activeMinute, timelineMeta.minuteHighlights, triggerHighlight]);

  // Auto-Trigger 2: Bei Live-Updates, sobald ein neues Tor / eine neue Vorlage / ein gehaltener 11m eintrifft
  useEffect(() => {
    const realPlayers = (lineup || []).filter((p) => !p.isDummy);
    if (realPlayers.length === 0) return undefined;

    const currentKeys = new Set();
    let newestBest = null;

    for (const p of realPlayers) {
      for (const ev of p.events || []) {
        const type = classifyHighlightEvent(ev);
        if (!type) continue;
        const minute = Math.max(0, Math.min(120, typeof ev.minute === 'number' ? ev.minute : 0));
        const key = `${p.id}:${minute}:${ev.points ?? 0}:${type}`;
        currentKeys.add(key);

        if (seenLiveHighlightsRef.current && !seenLiveHighlightsRef.current.has(key)) {
          const prio = HIGHLIGHT_PRIORITY[type] || 0;
          if (!newestBest || prio > newestBest.prio) {
            newestBest = { type, player: p, points: ev.points, minute, prio };
          }
        }
      }
    }

    // Beim allerersten Laden nur Bestand merken, keine alten Aktionen abfeuern
    if (seenLiveHighlightsRef.current === null) {
      seenLiveHighlightsRef.current = currentKeys;
      return undefined;
    }

    seenLiveHighlightsRef.current = currentKeys;
    if (!newestBest || isScrubbing) return undefined;

    const rafId = window.requestAnimationFrame(() => {
      triggerHighlight(newestBest.type, newestBest.player, newestBest.points, newestBest.minute);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [lineup, animId, isScrubbing, triggerHighlight]);

  // Interaktive Highlight-Buttons unten links:
  // - Bei echten Spieltags-Aktionen werden diese der Reihe nach abgespielt (mit Anzahl-Zaehler).
  // - Bei 0 Aktionen dient der Button als Vorschau mit einem passenden Spieler aus dem Kader.
  const realPlayers = useMemo(
    () => computed.players.filter((p) => !p.isDummy),
    [computed.players],
  );

  const handleHighlightButtonClick = useCallback((type) => {
    const realEvents = timelineMeta.highlightsByType[type] || [];
    if (realEvents.length > 0) {
      const idx = highlightCycleRef.current[type] % realEvents.length;
      highlightCycleRef.current[type] = (idx + 1) % realEvents.length;
      const ev = realEvents[idx];
      triggerHighlight(ev.type, ev.player, ev.points, ev.minute);
      return;
    }

    if (realPlayers.length === 0) return;
    const realSt = realPlayers.filter((p) => p.position === 4);
    const realMf = realPlayers.filter((p) => p.position === 3 || p.position === 0);
    const realAw = realPlayers.filter((p) => p.position === 2);
    const realTw = realPlayers.filter((p) => p.position === 1);

    let target = realPlayers[0];
    let demoPoints = 100;
    if (type === 'goal') {
      target = realSt[0] || realMf[0] || realAw[0] || realPlayers[0];
      demoPoints = 100;
    } else if (type === 'assist') {
      target = realMf[0] || realSt[1] || realAw[0] || realPlayers[0];
      demoPoints = 40;
    } else if (type === 'penalty_save') {
      target = realTw[0] || realPlayers[0];
      demoPoints = 75;
    }
    triggerHighlight(type, target, demoPoints, null);
  }, [timelineMeta.highlightsByType, realPlayers, triggerHighlight]);

  const handleSelectHighlightMinute = useCallback((minute, hl) => {
    if (!hl?.player) return;
    lastScrubHighlightRef.current = `${minute}:${hl.player.id}:${hl.type}`;
    triggerHighlight(hl.type, hl.player, hl.points, minute);
  }, [triggerHighlight]);

  const highlightButtons = [
    {
      type: 'goal',
      label: 'Tore',
      count: timelineMeta.highlightsByType.goal.length,
      activeStyle: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25',
      idleStyle: 'border-transparent text-gray-400 opacity-55 hover:opacity-100 hover:bg-emerald-500/15',
    },
    {
      type: 'assist',
      label: 'Vorlagen',
      count: timelineMeta.highlightsByType.assist.length,
      activeStyle: 'bg-sky-500/15 border-sky-400/40 text-sky-300 hover:bg-sky-500/25',
      idleStyle: 'border-transparent text-gray-400 opacity-55 hover:opacity-100 hover:bg-sky-500/15',
    },
    {
      type: 'penalty_save',
      label: 'Elfmeter gehalten',
      count: timelineMeta.highlightsByType.penalty_save.length,
      activeStyle: 'bg-amber-500/15 border-amber-400/40 text-amber-300 hover:bg-amber-500/25',
      idleStyle: 'border-transparent text-gray-400 opacity-55 hover:opacity-100 hover:bg-amber-500/15',
    },
  ];

  const cornerMinuteLabel = activeMinute > 90
    ? `90+${activeMinute - 90}'`
    : `${activeMinute}'`;

  return (
    <div>
      <div
        ref={pitchRef}
        className="oct-box rounded-2xl overflow-hidden relative min-h-[500px] sm:min-h-[600px] flex flex-col justify-between py-6 sm:py-8 mt-4 shadow-2xl"
        style={{ backgroundImage: 'radial-gradient(circle at center, #1a1a1a 0%, #050505 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none opacity-5 border border-white rounded-lg m-4 sm:m-6">
          <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-32 sm:h-32 border border-white rounded-full hex-pitch-center"></div>
        </div>

        {/* Minuten-Anzeige oben rechts im Spielfeld */}
        {timelineMeta.hasTimeline && (
          <button
            type="button"
            onClick={!isLiveEdge ? handleResetToLive : undefined}
            title={!isLiveEdge ? 'Zurück zum aktuellen Stand' : undefined}
            className={`absolute top-3.5 right-4 sm:top-5 sm:right-6 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full oct-pill border backdrop-blur-md transition-colors ${
              isLiveEdge
                ? 'bg-black/45 border-white/10 text-gray-200 cursor-default'
                : 'bg-[#ff5c3e]/15 border-[#ff5c3e]/50 oct-bd-accent text-[#ff5c3e] hover:bg-[#ff5c3e]/25 cursor-pointer'
            }`}
          >
            {isLiveEdge && timelineMeta.hasLive && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full hex-beacon bg-[#ef4444] opacity-75"></span>
                <span className="relative inline-flex rounded-full hex-beacon h-2 w-2 bg-[#ef4444]"></span>
              </span>
            )}
            <span className="text-xs font-black tabular-nums leading-none">{cornerMinuteLabel}</span>
            {isLiveEdge && !timelineMeta.hasLive && timelineMeta.anyFinished && (
              <span className="text-[9px] font-black uppercase tracking-wider text-[#8b92a5] leading-none">Ende</span>
            )}
            {!isLiveEdge && activeMinute === 45 && (
              <span className="text-[9px] font-black uppercase tracking-wider leading-none">HZ</span>
            )}
          </button>
        )}

        <div className="relative z-10 w-full px-2 sm:px-4 flex flex-col pt-3 sm:pt-2">
          <LiveRow players={st} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} isScrubbing={isScrubbing} activeMinute={activeMinute} registerAvatarRef={registerAvatarRef} landedHighlight={landedHighlight} />
          <LiveRow players={mf} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} isScrubbing={isScrubbing} activeMinute={activeMinute} registerAvatarRef={registerAvatarRef} landedHighlight={landedHighlight} />
          <LiveRow players={aw} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} isScrubbing={isScrubbing} activeMinute={activeMinute} registerAvatarRef={registerAvatarRef} landedHighlight={landedHighlight} />
          <LiveRow players={tw} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} isScrubbing={isScrubbing} activeMinute={activeMinute} registerAvatarRef={registerAvatarRef} landedHighlight={landedHighlight} />
        </div>

        {(realPlayers.length > 0 || computed.total != null) && (
          <div className="relative z-10 flex items-end justify-between px-4 sm:px-8 mt-4">
            {/* Highlight-Buttons unten links (mit Anzahl-Zaehler bei echten Spieltags-Aktionen) */}
            {realPlayers.length > 0 ? (
              <div className="flex items-center gap-1 bg-black/55 border border-white/10 rounded-full oct-pill p-1 backdrop-blur-md">
                {highlightButtons.map((btn) => (
                  <button
                    key={btn.type}
                    type="button"
                    onClick={() => handleHighlightButtonClick(btn.type)}
                    title={
                      btn.count > 0
                        ? `${btn.label} abspielen (${btn.count})`
                        : `${btn.label}-Animation testen`
                    }
                    aria-label={
                      btn.count > 0
                        ? `${btn.label} abspielen (${btn.count})`
                        : `${btn.label}-Animation testen`
                    }
                    className={`h-7 ${btn.count > 0 ? 'px-2 gap-1' : 'w-7 justify-center'} rounded-full oct-sm border flex items-center text-sm active:scale-90 transition-all cursor-pointer ${
                      btn.count > 0 ? btn.activeStyle : btn.idleStyle
                    }`}
                  >
                    <span className="leading-none">{HIGHLIGHT_ICON[btn.type]}</span>
                    {btn.count > 0 && (
                      <span className="text-[11px] font-bold tabular-nums leading-none">
                        {btn.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div />
            )}

            {computed.total != null && (
              <div className="text-right">
                <AnimatedPoints
                  value={computed.total}
                  previousValue={prevPointsMap?.__total__}
                  animKey={animId != null ? `${animId}:__total__` : null}
                  instant={isScrubbing}
                  instantDelta={computed.totalMinuteDelta}
                  instantKey={isScrubbing ? `m:${activeMinute}:__total__` : null}
                  format={(n) => n.toLocaleString('de-DE')}
                  className="text-3xl sm:text-4xl font-extrabold text-white leading-none"
                  deltaPlacement="left"
                />
                <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8b92a5] mt-1">Punkte</div>
              </div>
            )}
          </div>
        )}

        {/* Aktions-Overlay (Tor, Vorlage, 11m gehalten) */}
        {activeHighlight && (
          <LiveHighlightOverlay
            key={activeHighlight.id}
            highlight={activeHighlight}
            onLand={handleHighlightLand}
            onComplete={handleHighlightComplete}
          />
        )}
      </div>

      {/* Horizontaler Minuten-Scrubber unterhalb des Kaders (0' bis maxMinute) */}
      {timelineMeta.hasTimeline && (
        <LiveMinuteScrubber
          maxMinute={timelineMeta.maxMinute}
          activeMinute={activeMinute}
          isLiveEdge={isLiveEdge}
          hasLive={timelineMeta.hasLive}
          anyFinished={timelineMeta.anyFinished}
          minuteDeltas={timelineMeta.minuteDeltas}
          minuteHighlights={timelineMeta.minuteHighlights}
          isPlaying={isPlaying}
          resetToken={resetToken}
          onSelectMinute={handleSelectMinute}
          onSelectHighlightMinute={handleSelectHighlightMinute}
          onResetToLive={handleResetToLive}
          onTogglePlay={handleTogglePlay}
          onPausePlay={() => setIsPlaying(false)}
          onFinishPlay={handleFinishPlay}
        />
      )}
    </div>
  );
};

export default LiveLineupPitch;
