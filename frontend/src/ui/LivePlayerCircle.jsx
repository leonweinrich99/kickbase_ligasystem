import React from 'react';
import AnimatedPoints from './AnimatedPoints';
import HexFrame from './HexFrame';

// Spieler-Kreis fuer die Live-Punkte-Ansicht ("Meine 11" waehrend eines
// laufenden Spieltags) - bewusst ANDERS als PlayerPhotoCard (dort eckige
// Karte, Punktzahl-Badge AUF dem Foto): im echten Kickbase-Live-Pitch sind
// die Spielerfotos RUND, die Punktzahl steht GROSS UNTER dem Namen statt auf
// dem Foto (siehe Recherche an echten App-Screenshots, Chat 23.11.2026).
//
// Farbskala NUR nach erreichten Punkten:
// < 0 rot, genau 0 grau, 1-99 orange, 100-199 gruen, 200-399 dunkelgruen, >= 400 gold.
export const pointColor = (points) => {
  if (points == null) return 'text-[#8b92a5]';
  if (points < 0) return 'text-red-500';
  if (points === 0) return 'text-[#8b92a5]';
  if (points < 100) return 'text-orange-400';
  if (points < 200) return 'text-green-400';
  if (points < 400) return 'text-green-700';
  return 'text-yellow-400';
};

const LivePlayerCircle = ({
  imagePath,
  name,
  displayName,
  points,
  prevPoints,
  animKey,
  instant = false,
  instantDelta = 0,
  instantKey = null,
  avatarRef = null,
  highlightedColor = null,
  size = 'w-14 h-14 sm:w-16 sm:h-16',
  containerSize = 'w-[72px] sm:w-[86px]',
  onClick,
}) => {
  return (
    <div
      className={`relative flex flex-col items-center ${containerSize} ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
      onClick={onClick}
    >
      <HexFrame
        ref={avatarRef}
        className={`${size} transition-all duration-300`}
        innerClassName={`${imagePath ? '' : 'bg-[#202020]'} shadow-md`}
        ringColor={highlightedColor || 'rgba(255, 255, 255, 0.22)'}
        ringWidth={highlightedColor ? 4.2 : 2.6}
        glowColor={highlightedColor || null}
      >
        {imagePath ? (
          <img
            src={`https://kickbase.b-cdn.net/${imagePath}`}
            alt={name}
            className="w-full h-full object-cover object-top"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="text-gray-500 font-semibold text-xs uppercase">{name?.substring(0, 2)}</div>
        )}
      </HexFrame>

      <div className="mt-1.5 text-center w-full">
        <div className="text-[9px] sm:text-[10px] font-medium text-gray-300 truncate w-full">
          {displayName || name}
        </div>
        <div className="leading-tight">
          <AnimatedPoints
            value={points}
            previousValue={prevPoints}
            animKey={animKey}
            instant={instant}
            instantDelta={instantDelta}
            instantKey={instantKey}
            usePointColor
            className="text-base sm:text-lg font-extrabold leading-tight"
            deltaPlacement="bottom"
          />
        </div>
      </div>
    </div>
  );
};

export default LivePlayerCircle;
