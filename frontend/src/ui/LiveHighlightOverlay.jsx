import React, { useEffect, useState } from 'react';
import { motion as Motion } from 'framer-motion';
import { HIGHLIGHT_ICON } from '../liveLineupUtils';

const HIGHLIGHT_META = {
  goal: {
    title: 'Tor',
    icon: HIGHLIGHT_ICON.goal,
    accent: '#22c55e',
    ring: '#22c55e',
    glow: 'rgba(34,197,94,0.38)',
    // Vollstaendig gedeckter (nicht transparenter) Muenz-Hintergrund
    coinBg: 'radial-gradient(circle at 35% 28%, #1f472f 0%, #11261a 58%, #09130d 100%)',
    coinFallback: '#102418',
  },
  assist: {
    title: 'Vorlage',
    icon: HIGHLIGHT_ICON.assist,
    accent: '#38bdf8',
    ring: '#38bdf8',
    glow: 'rgba(56,189,248,0.38)',
    coinBg: 'radial-gradient(circle at 35% 28%, #163d59 0%, #0d2333 58%, #08131c 100%)',
    coinFallback: '#0d2333',
  },
  penalty_save: {
    title: 'Elfmeter gehalten',
    icon: HIGHLIGHT_ICON.penalty_save,
    accent: '#f59e0b',
    ring: '#f59e0b',
    glow: 'rgba(245,158,11,0.38)',
    coinBg: 'radial-gradient(circle at 35% 28%, #4d3612 0%, #261b09 58%, #120d05 100%)',
    coinFallback: '#261b09',
  },
};

// 3-Phasen-Animation ueber dem Spielfeld:
// Phase 1 ("icon"):   Grosse runde, nicht-transparente Muenze mit Aktions-Icon erscheint & dreht sich.
// Phase 2 ("player"): 3D-Flip enthuellt das Spielerfoto + Name & Punkte-Badge auf opaker Rueckseite.
// Phase 3 ("fly"):    Muenze fliegt pixelgenau auf die Spieler-Position im Kader zurueck.
// Hinweis: Vom Aufrufer immer mit key={highlight.id} mounten, damit jeder neue
// Highlight-Durchlauf sauber bei stage="icon" startet.
const LiveHighlightOverlay = ({ highlight, onLand, onComplete }) => {
  const [stage, setStage] = useState('icon');

  useEffect(() => {
    if (!highlight) return undefined;

    const t1 = window.setTimeout(() => setStage('player'), 820);
    const t2 = window.setTimeout(() => setStage('fly'), 1720);
    const tLand = window.setTimeout(() => onLand?.(highlight), 2260);
    const tDone = window.setTimeout(() => onComplete?.(), 2460);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(tLand);
      window.clearTimeout(tDone);
    };
  }, [highlight, onLand, onComplete]);

  if (!highlight) return null;

  const meta = HIGHLIGHT_META[highlight.type] || HIGHLIGHT_META.goal;
  const player = highlight.player;
  const targetX = highlight.targetX ?? 0;
  const targetY = highlight.targetY ?? 0;
  const targetScale = highlight.targetScale ?? 0.45;

  const isFlying = stage === 'fly';
  const showPlayerFace = stage === 'player' || stage === 'fly';
  const minuteText =
    typeof highlight.minute === 'number' && highlight.minute > 0
      ? highlight.minute > 90
        ? `90+${highlight.minute - 90}'`
        : `${highlight.minute}'`
      : null;

  return (
    <div
      className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center overflow-hidden"
      style={{ perspective: '900px' }}
    >
      {/* Dezente Hintergrund-Vignette/Glow waehrend der Mitten-Phase */}
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isFlying ? 0 : 1 }}
        transition={{ duration: 0.35 }}
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at center, ${meta.glow} 0%, rgba(0,0,0,0.58) 48%, rgba(0,0,0,0.16) 100%)`,
        }}
      />

      {/* Haupt-Muenze (exakt 128x128 zentriert, damit Ziel-Koordinaten pixelgenau treffen) */}
      <Motion.div
        initial={{ x: 0, y: 0, scale: 0.22, opacity: 0 }}
        animate={
          isFlying
            ? { x: targetX, y: targetY, scale: targetScale, opacity: [1, 1, 0] }
            : { x: 0, y: 0, scale: 1, opacity: 1 }
        }
        transition={
          isFlying
            ? {
                duration: 0.68,
                ease: [0.22, 1, 0.36, 1],
                opacity: { duration: 0.68, times: [0, 0.78, 1] },
              }
            : { type: 'spring', stiffness: 250, damping: 20 }
        }
        className="relative w-32 h-32"
      >
        {/* 3D Flip-Container */}
        <Motion.div
          initial={{ rotateY: 0, rotateZ: -260 }}
          animate={{
            rotateY: showPlayerFace ? 180 : 0,
            rotateZ: 0,
          }}
          transition={{
            rotateZ: { duration: 0.76, ease: [0.22, 1, 0.36, 1] },
            rotateY: { duration: 0.54, ease: [0.4, 0, 0.2, 1] },
          }}
          className="relative w-full h-full"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Vorderseite: Vollstaendig opake Muenze mit demselben Icon wie in den Buttons */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center shadow-2xl"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              backgroundColor: meta.coinFallback,
              backgroundImage: meta.coinBg,
              boxShadow: `inset 0 2px 10px rgba(255,255,255,0.12), 0 0 0 2.5px ${meta.ring}, 0 0 34px ${meta.glow}`,
            }}
          >
            <span
              className="text-[58px] leading-none select-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]"
              role="img"
              aria-label={meta.title}
            >
              {meta.icon}
            </span>
          </div>

          {/* Rueckseite: Spielerfoto auf vollstaendig opakem Hintergrund */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center shadow-2xl"
            style={{
              transform: 'rotateY(180deg)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              backgroundColor: '#141416',
              backgroundImage: 'radial-gradient(circle at 50% 22%, #2b2b30 0%, #17171a 62%, #0c0c0e 100%)',
              boxShadow: `0 0 0 2.5px ${meta.ring}, 0 0 32px ${meta.glow}`,
            }}
          >
            {player?.imagePath ? (
              <img
                src={`https://kickbase.b-cdn.net/${player.imagePath}`}
                alt={player.lastName || player.name}
                className="w-full h-full object-cover object-top"
              />
            ) : (
              <span className="text-2xl font-bold text-gray-300 uppercase">
                {(player?.lastName || player?.name || '?').substring(0, 2)}
              </span>
            )}
          </div>
        </Motion.div>

        {/* Beschriftung absolut unter der Muenze (verschiebt den Mittelpunkt nicht) */}
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: isFlying ? 0 : 1, y: isFlying ? -4 : 0 }}
          transition={{ duration: 0.24 }}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-3 flex flex-col items-center gap-1 whitespace-nowrap"
        >
          <div
            className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border shadow-lg"
            style={{
              color: meta.accent,
              borderColor: meta.ring,
              backgroundColor: '#0a0a0c',
            }}
          >
            {meta.title}
            {minuteText ? ` · ${minuteText}` : ''}
            {typeof highlight.points === 'number' && highlight.points > 0 ? ` · +${highlight.points}` : ''}
          </div>
          {showPlayerFace && (
            <div className="text-sm font-semibold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              {player?.lastName || player?.name}
            </div>
          )}
        </Motion.div>
      </Motion.div>
    </div>
  );
};

export default LiveHighlightOverlay;
