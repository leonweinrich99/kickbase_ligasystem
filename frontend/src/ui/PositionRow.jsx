import React from 'react';
import PlayerPhotoCard from './PlayerPhotoCard';

// Eine Formationsreihe (z.B. "Sturm" oder "Abwehr") aus Spieler-Foto-Karten -
// extrahiert aus OptimalTeam.jsx, damit UserDetail.jsx (Startelf-Anzeige,
// Issue 9a0d78ba) denselben Zeilen-Stil nutzen kann statt ihn zu duplizieren.
const PositionRow = ({ players }) => {
  if (!players || players.length === 0) return null;
  return (
    <div className="flex flex-col items-center mb-4 last:mb-0 w-full z-10">
      <div className="flex justify-center items-center flex-nowrap gap-1 sm:gap-4 w-full px-2 overflow-visible">
        {players.map(p => {
          // Dynamische Größe basierend auf Anzahl der Spieler in der Reihe
          const itemCount = players.length;
          const baseSize = itemCount > 4 ? "w-12 h-12 sm:w-14 sm:h-14" : "w-14 h-14 sm:w-16 sm:h-16";
          const containerSize = itemCount > 4 ? "w-[65px] sm:w-[80px]" : "w-[75px] sm:w-[90px]";

          return (
            <PlayerPhotoCard
              key={p.id}
              imagePath={p.imagePath}
              name={p.name}
              displayName={p.lastName || p.name}
              badgeValue={p.points}
              marketValue={p.marketValue}
              baseSize={baseSize}
              containerSize={containerSize}
            />
          );
        })}
      </div>
    </div>
  );
};

export default PositionRow;
