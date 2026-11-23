import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import LivePlayerCircle from './LivePlayerCircle';
import AnimatedPoints from './AnimatedPoints';
import LiveMinuteScrubber from './LiveMinuteScrubber';

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

export const LiveRow = ({ players, onPlayerClick, prevPointsMap, animId, isScrubbing, activeMinute }) => {
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

  // Minuten-Metadaten aus den vorhandenen Spieler-Events ableiten (kein Extra-Fetch).
  const timelineMeta = useMemo(() => {
    const realPlayers = (lineup || []).filter((p) => !p.isDummy);
    let maxEventMin = 0;
    let maxMatchMin = 0;
    let hasAnyEvents = false;
    let hasLive = false;
    let anyFinished = false;
    const minuteDeltas = new Map();

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
        }
      }
    }

    const baseMax = Math.max(maxEventMin, maxMatchMin, anyFinished ? 90 : 0);
    const maxMinute = hasAnyEvents ? Math.max(1, baseMax) : 0;

    return {
      hasTimeline: hasAnyEvents && maxMinute > 0,
      maxMinute,
      hasLive,
      anyFinished,
      minuteDeltas,
    };
  }, [lineup]);

  // `selectedMinute === null` bedeutet: folgt automatisch dem aktuellen/letzten Stand.
  const [selectedMinute, setSelectedMinute] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const activeMinute = selectedMinute == null
    ? timelineMeta.maxMinute
    : Math.min(selectedMinute, timelineMeta.maxMinute);
  const isLiveEdge = selectedMinute == null || activeMinute >= timelineMeta.maxMinute;
  const isScrubbing = timelineMeta.hasTimeline && (!isLiveEdge || isPlaying);

  // Spielverlauf-Wiedergabe (Play-Button): zaehlt Minute fuer Minute hoch.
  useEffect(() => {
    if (!isPlaying || !timelineMeta.hasTimeline) return undefined;
    const timer = window.setInterval(() => {
      setSelectedMinute((prev) => {
        const current = prev == null ? 0 : prev;
        if (current >= timelineMeta.maxMinute) {
          setIsPlaying(false);
          return null;
        }
        return current + 1;
      });
    }, 110);
    return () => window.clearInterval(timer);
  }, [isPlaying, timelineMeta.hasTimeline, timelineMeta.maxMinute]);

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
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    setSelectedMinute((prev) => (prev == null || prev >= timelineMeta.maxMinute ? 0 : prev));
    setIsPlaying(true);
  }, [isPlaying, timelineMeta.maxMinute]);

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

  const cornerMinuteLabel = activeMinute > 90
    ? `90+${activeMinute - 90}'`
    : `${activeMinute}'`;

  return (
    <div>
      <div
        className="rounded-2xl overflow-hidden relative min-h-[500px] sm:min-h-[600px] flex flex-col justify-between py-6 sm:py-8 mt-4 shadow-2xl"
        style={{ backgroundImage: 'radial-gradient(circle at center, #1a1a1a 0%, #050505 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none opacity-5 border border-white rounded-lg m-4 sm:m-6">
          <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-32 sm:h-32 border border-white rounded-full"></div>
        </div>

        {/* Minuten-Anzeige oben rechts im Spielfeld */}
        {timelineMeta.hasTimeline && (
          <button
            type="button"
            onClick={!isLiveEdge ? handleResetToLive : undefined}
            title={!isLiveEdge ? 'Zurück zum aktuellen Stand' : undefined}
            className={`absolute top-3.5 right-4 sm:top-5 sm:right-6 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-md transition-colors ${
              isLiveEdge
                ? 'bg-black/45 border-white/10 text-gray-200 cursor-default'
                : 'bg-[#ff5c3e]/15 border-[#ff5c3e]/50 text-[#ff5c3e] hover:bg-[#ff5c3e]/25 cursor-pointer'
            }`}
          >
            {isLiveEdge && timelineMeta.hasLive && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ef4444]"></span>
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
          <LiveRow players={st} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} isScrubbing={isScrubbing} activeMinute={activeMinute} />
          <LiveRow players={mf} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} isScrubbing={isScrubbing} activeMinute={activeMinute} />
          <LiveRow players={aw} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} isScrubbing={isScrubbing} activeMinute={activeMinute} />
          <LiveRow players={tw} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} isScrubbing={isScrubbing} activeMinute={activeMinute} />
        </div>

        {computed.total != null && (
          <div className="relative z-10 flex justify-end px-6 sm:px-8 mt-4">
            <div className="text-right">
              <AnimatedPoints
                value={computed.total}
                previousValue={prevPointsMap?.__total__}
                animKey={animId != null ? `${animId}:__total__` : null}
                instant={isScrubbing}
                instantDelta={computed.totalMinuteDelta}
                instantKey={isScrubbing ? `m:${activeMinute}:__total__` : null}
                format={(n) => n.toLocaleString('de-DE')}
                className="text-3xl sm:text-4xl font-black text-white leading-none"
                deltaPlacement="left"
              />
              <div className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] mt-1">Punkte</div>
            </div>
          </div>
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
          isPlaying={isPlaying}
          onSelectMinute={handleSelectMinute}
          onResetToLive={handleResetToLive}
          onTogglePlay={handleTogglePlay}
          onPausePlay={() => setIsPlaying(false)}
        />
      )}
    </div>
  );
};

export default LiveLineupPitch;
