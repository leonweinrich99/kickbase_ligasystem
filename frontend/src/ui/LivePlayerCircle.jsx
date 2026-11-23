import React from 'react';

// Spieler-Kreis fuer die Live-Punkte-Ansicht ("Meine 11" waehrend eines
// laufenden Spieltags) - bewusst ANDERS als PlayerPhotoCard (dort eckige
// Karte, Punktzahl-Badge AUF dem Foto): im echten Kickbase-Live-Pitch sind
// die Spielerfotos RUND, die Punktzahl steht GROSS UNTER dem Namen statt auf
// dem Foto (siehe Recherche an echten App-Screenshots, Chat 23.11.2026).
//
// Farbskala NUR nach erreichten Punkten (Owner-Vorgabe 23.11.2026, ersetzt
// die vorherige Spielstatus-basierte Faerbung):
// < 0 rot, genau 0 grau, 1-99 orange, 100-199 gruen, ab 200 dunkelgruen.
// Exportiert, damit die Live-Ranking-Liste (LiveLineupPage.jsx) dieselbe
// Skala fuer die Gesamtpunkte je Manager nutzt.
export const pointColor = (points) => {
  if (points == null) return 'text-[#8b92a5]';
  if (points < 0) return 'text-red-500';
  if (points === 0) return 'text-[#8b92a5]';
  if (points < 100) return 'text-orange-400';
  if (points < 200) return 'text-green-400';
  return 'text-green-700';
};

const LivePlayerCircle = ({ imagePath, name, displayName, points, size = 'w-14 h-14 sm:w-16 sm:h-16', containerSize = 'w-[72px] sm:w-[86px]', onClick }) => {
  const hasPoints = points != null;

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
            className="w-full h-full object-cover object-top"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="text-gray-500 font-bold text-xs uppercase">{name?.substring(0, 2)}</div>
        )}
      </div>

      <div className="mt-1.5 text-center w-full">
        <div className="text-[9px] sm:text-[10px] font-bold text-gray-300 truncate w-full">
          {displayName || name}
        </div>
        <div className={`text-base sm:text-lg font-black leading-tight ${pointColor(points)}`}>
          {hasPoints ? points : '–'}
        </div>
      </div>
    </div>
  );
};

export default LivePlayerCircle;
