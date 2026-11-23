import React from 'react';
import LivePlayerCircle from './LivePlayerCircle';

// Gemeinsame Live-Pitch-Darstellung fuer alle Stellen, die eine Startelf mit
// Live-Punkten zeigen (LiveLineupPage.jsx "Live Punkte" UND UserDetail.jsx
// Manager-Profil, Owner-Wunsch 23.11.2026: "zeig die Live-Punkte-Anzeige
// auch im Manager-Profil, aktuell ist die Anzeige dort unterschiedlich" -
// beide Stellen nutzen jetzt exakt dieselbe Komponente + dieselbe Datenquelle
// (frontend/api/live-lineup.js), damit die Zahlen nie wieder auseinanderlaufen
// koennen.

export const LiveRow = ({ players, onPlayerClick }) => {
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
          points={p.points}
          size={size}
          containerSize={containerSize}
          onClick={!p.isDummy && onPlayerClick ? () => onPlayerClick(p.id) : undefined}
        />
      ))}
    </div>
  );
};

// Der dunkle Spielfeld-Rahmen selbst (Hintergrund + Feldlinien-Dekoration +
// die 4 Positionsreihen + Gesamtpunkte-Box unten rechts) - identisch an
// beiden Einsatzorten.
const LiveLineupPitch = ({ lineup, totalPoints, onPlayerClick }) => {
  const st = lineup?.filter((p) => p.position === 4) || [];
  const mf = lineup?.filter((p) => p.position === 3 || p.position === 0) || [];
  const aw = lineup?.filter((p) => p.position === 2) || [];
  const tw = lineup?.filter((p) => p.position === 1) || [];

  return (
    <div
      className="rounded-2xl overflow-hidden relative min-h-[500px] sm:min-h-[600px] flex flex-col justify-between py-6 sm:py-8 mt-4 shadow-2xl"
      style={{ backgroundImage: 'radial-gradient(circle at center, #1a1a1a 0%, #050505 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none opacity-5 border border-white rounded-lg m-4 sm:m-6">
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-32 sm:h-32 border border-white rounded-full"></div>
      </div>

      <div className="relative z-10 w-full px-2 sm:px-4 flex flex-col">
        <LiveRow players={st} onPlayerClick={onPlayerClick} />
        <LiveRow players={mf} onPlayerClick={onPlayerClick} />
        <LiveRow players={aw} onPlayerClick={onPlayerClick} />
        <LiveRow players={tw} onPlayerClick={onPlayerClick} />
      </div>

      {totalPoints != null && (
        <div className="relative z-10 flex justify-end px-6 sm:px-8 mt-4">
          <div className="text-right">
            <div className="text-3xl sm:text-4xl font-black text-white leading-none">{totalPoints.toLocaleString('de-DE')}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] mt-1">Punkte</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveLineupPitch;
