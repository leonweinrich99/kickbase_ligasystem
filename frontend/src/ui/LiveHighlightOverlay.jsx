import React, { useEffect, useState } from 'react';
import { motion as Motion } from 'framer-motion';

// Eigene, scharfe Vektor-Icons fuer die runde Medaillen-Animation
const SoccerBallSvg = () => (
  <svg viewBox="0 0 64 64" className="w-16 h-16 drop-shadow-[0_4px_12px_rgba(34,197,94,0.45)]" fill="none">
    <circle cx="32" cy="32" r="27" fill="#f8fafc" stroke="#1e293b" strokeWidth="2.5" />
    <polygon points="32,19 42,26.5 38.2,38.5 25.8,38.5 22,26.5" fill="#111827" />
    <path d="M32 19V7M42 26.5L54.5 22M38.2 38.5L46.5 51M25.8 38.5L17.5 51M22 26.5L9.5 22" stroke="#111827" strokeWidth="2.2" strokeLinecap="round" />
    <polygon points="32,5 38,9.5 35.5,13 28.5,13 26,9.5" fill="#111827" />
    <polygon points="56,20 53,27 48,25.5 51,18.5" fill="#111827" />
    <polygon points="8,20 11,27 16,25.5 13,18.5" fill="#111827" />
    <polygon points="48,53 42,50 44.5,45 50.5,48" fill="#111827" />
    <polygon points="16,53 22,50 19.5,45 13.5,48" fill="#111827" />
    <circle cx="32" cy="32" r="27" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
  </svg>
);

const CleatBootSvg = () => (
  <svg viewBox="0 0 64 64" className="w-16 h-16 drop-shadow-[0_4px_12px_rgba(56,189,248,0.45)]" fill="none">
    {/* Speed-Linien links */}
    <path d="M7 28H15M5 35H13M9 42H15" stroke="#38bdf8" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
    {/* Fussballschuh */}
    <path
      d="M21 20C23 20 26 24 29 27C33 30 41 31 49 33C54 34.2 57 36.5 57 40C57 42.8 54.5 44 50 44H20C17.5 44 16 42.5 16 40V25C16 21.8 18.2 20 21 20Z"
      fill="#f8fafc"
      stroke="#0f172a"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    {/* Akzent-Streifen auf dem Schuh */}
    <path d="M27 28L23 41M33 30L29.5 41M39 31.5L36 41" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" />
    {/* Sohle & Stollen */}
    <path d="M17 44H54" stroke="#0284c7" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M21 44V49M28 44V49M43 44V49M50 44V49" stroke="#e2e8f0" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

const KeeperGlovesSvg = () => (
  <svg viewBox="0 0 64 64" className="w-16 h-16 drop-shadow-[0_4px_12px_rgba(245,158,11,0.45)]" fill="none">
    {/* Linker Handschuh */}
    <g transform="rotate(-12 24 34)">
      <path
        d="M15 34V21C15 19.3 16.3 18 18 18C19.7 18 21 19.3 21 21V28V16.5C21 14.8 22.3 13.5 24 13.5C25.7 13.5 27 14.8 27 16.5V28V18C27 16.3 28.3 15 30 15C31.7 15 33 16.3 33 18V33C33 39 29 44 24 44C19 44 15 39.5 15 34Z"
        fill="#f8fafc"
        stroke="#0f172a"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="17" y="42" width="14" height="6" rx="2.5" fill="#f59e0b" stroke="#0f172a" strokeWidth="1.8" />
    </g>
    {/* Rechter Handschuh */}
    <g transform="rotate(12 40 34)">
      <path
        d="M31 33V18C31 16.3 32.3 15 34 15C35.7 15 37 16.3 37 18V28V16.5C37 14.8 38.3 13.5 40 13.5C41.7 13.5 43 14.8 43 16.5V28V21C43 19.3 44.3 18 46 18C47.7 18 49 19.3 49 21V34C49 39.5 45 44 40 44C35 44 31 39 31 33Z"
        fill="#f8fafc"
        stroke="#0f172a"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="33" y="42" width="14" height="6" rx="2.5" fill="#f59e0b" stroke="#0f172a" strokeWidth="1.8" />
    </g>
  </svg>
);

const HIGHLIGHT_META = {
  goal: {
    title: 'Tor',
    accent: '#22c55e',
    ring: 'rgba(34,197,94,0.85)',
    glow: 'rgba(34,197,94,0.38)',
    bg: 'radial-gradient(circle, rgba(34,197,94,0.28) 0%, rgba(16,185,129,0.08) 65%, rgba(0,0,0,0.88) 100%)',
    Icon: SoccerBallSvg,
  },
  assist: {
    title: 'Vorlage',
    accent: '#38bdf8',
    ring: 'rgba(56,189,248,0.85)',
    glow: 'rgba(56,189,248,0.38)',
    bg: 'radial-gradient(circle, rgba(56,189,248,0.28) 0%, rgba(14,165,233,0.08) 65%, rgba(0,0,0,0.88) 100%)',
    Icon: CleatBootSvg,
  },
  penalty_save: {
    title: 'Elfmeter gehalten',
    accent: '#f59e0b',
    ring: 'rgba(245,158,11,0.9)',
    glow: 'rgba(245,158,11,0.38)',
    bg: 'radial-gradient(circle, rgba(245,158,11,0.28) 0%, rgba(217,119,6,0.08) 65%, rgba(0,0,0,0.88) 100%)',
    Icon: KeeperGlovesSvg,
  },
};

// 3-Phasen-Animation ueber dem Spielfeld:
// Phase 1 ("icon"):   Grosses rundes Aktions-Icon erscheint mittig und dreht sich.
// Phase 2 ("player"): 3D-Flip enthuellt das Spielerfoto + Name & Punkte-Badge.
// Phase 3 ("fly"):    Kreis fliegt pixelgenau auf die Spieler-Position im Kader zurueck.
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
  const Icon = meta.Icon;
  const player = highlight.player;
  const targetX = highlight.targetX ?? 0;
  const targetY = highlight.targetY ?? 0;
  const targetScale = highlight.targetScale ?? 0.45;

  const isFlying = stage === 'fly';
  const showPlayerFace = stage === 'player' || stage === 'fly';

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

      {/* Haupt-Medaillon (exakt 128x128 zentriert, damit Ziel-Koordinaten pixelgenau treffen) */}
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
          {/* Vorderseite: Grosses rundes Aktions-Icon */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center shadow-2xl"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              background: meta.bg,
              boxShadow: `0 0 0 2px ${meta.ring}, 0 0 36px ${meta.glow}`,
            }}
          >
            <Icon />
          </div>

          {/* Rueckseite: Spielerfoto im leuchtenden Kreis */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden bg-[#171717] flex items-center justify-center shadow-2xl"
            style={{
              transform: 'rotateY(180deg)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
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

        {/* Beschriftung absolut unter dem Kreis (verschiebt den Mittelpunkt nicht) */}
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: isFlying ? 0 : 1, y: isFlying ? -4 : 0 }}
          transition={{ duration: 0.24 }}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-3 flex flex-col items-center gap-1 whitespace-nowrap"
        >
          <div
            className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border backdrop-blur-md shadow-lg"
            style={{
              color: meta.accent,
              borderColor: meta.ring,
              backgroundColor: 'rgba(0,0,0,0.8)',
            }}
          >
            {meta.title}
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
