import React from 'react';

// Spieler-Kreis fuer die Live-Punkte-Ansicht ("Meine 11" waehrend eines
// laufenden Spieltags) - bewusst ANDERS als PlayerPhotoCard (dort eckige
// Karte, Punktzahl-Badge AUF dem Foto): im echten Kickbase-Live-Pitch sind
// die Spielerfotos RUND, die Punktzahl steht GROSS UNTER dem Namen statt auf
// dem Foto, und die Farbe zeigt den Spielstatus (grau = Partie noch nicht
// begonnen, orange = laeuft gerade live, gruen = beendet) - siehe Recherche
// an echten App-Store-Screenshots, Chat 23.11.2026.
const STATUS_COLOR = {
  pending: 'text-[#8b92a5]',
  live: 'text-orange-400',
  finished: 'text-green-400',
};

export const matchPhase = (mst) => {
  if (mst === 2) return 'finished';
  if (mst === 1 || mst === 8) return 'live';
  return 'pending';
};

const LivePlayerCircle = ({ imagePath, name, displayName, points, matchStatus, size = 'w-14 h-14 sm:w-16 sm:h-16', containerSize = 'w-[72px] sm:w-[86px]', onClick }) => {
  const phase = matchPhase(matchStatus);
  const isPending = phase === 'pending';

  return (
    <div
      className={`relative flex flex-col items-center ${containerSize} ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
      onClick={onClick}
    >
      <div className={`relative ${size} rounded-full ${imagePath ? '' : 'bg-[#202020]'} overflow-hidden flex items-center justify-center shadow-lg ring-2 ring-[#2a2a2a]`}>
        {imagePath ? (
          <img
            src={`https://kickbase.b-cdn.net/${imagePath}`}
            alt={name}
            className={`w-full h-full object-cover object-top ${isPending ? 'grayscale opacity-60' : ''}`}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="text-gray-500 font-bold text-xs uppercase">{name?.substring(0, 2)}</div>
        )}
        {phase === 'live' && (
          <div className="absolute -top-1 -right-1.5 bg-orange-500 text-white text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border-2 border-black shadow-lg z-20">
            Live
          </div>
        )}
      </div>

      <div className="mt-1.5 text-center w-full">
        <div className="text-[9px] sm:text-[10px] font-bold text-gray-300 truncate w-full">
          {displayName || name}
        </div>
        <div className={`text-base sm:text-lg font-black leading-tight ${isPending ? STATUS_COLOR.pending : STATUS_COLOR[phase]}`}>
          {isPending ? '–' : points}
        </div>
      </div>
    </div>
  );
};

export default LivePlayerCircle;
