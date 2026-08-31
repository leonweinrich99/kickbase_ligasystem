import React from 'react';

// Spieler-Foto-Karte (Foto ohne Kreis/Rahmen/Hintergrund, Punktzahl-Badge in
// der Ecke) - extrahiert aus OptimalTeam.jsx::PositionRow (Issue 3edfc346/
// cb7f0f5f/24ae1537), damit UserDetail.jsx (Kader-Anzeige, Issue e6beecd8)
// denselben Kartenstil nutzen kann statt ihn zu duplizieren. Groesse/Zeilen-
// Layout bleibt Sache des jeweiligen Aufrufers (Optimale Elf: feste 11er-
// Reihen, Kader: variable Groesse pro Position).
const PlayerPhotoCard = ({ imagePath, name, displayName, badgeValue, marketValue, baseSize = 'w-14 h-14 sm:w-16 sm:h-16', containerSize = 'w-[75px] sm:w-[90px]', highlighted = false }) => (
  <div className={`relative flex flex-col items-center group ${containerSize}`}>
    <div className={`${baseSize} rounded-lg ${imagePath ? '' : 'bg-[#202020]'} overflow-hidden flex items-center justify-center shadow-lg relative ${highlighted ? 'ring-2 ring-[#ff5c3e]' : ''}`}>
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
      {badgeValue != null && (
        <div className="absolute -bottom-1.5 -right-1.5 bg-green-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-md border-2 border-[#202020] shadow-xl flex items-center justify-center min-w-[26px] z-20">
          {badgeValue}
        </div>
      )}
    </div>

    <div className="mt-2 text-center w-full">
      <div className="text-[10px] sm:text-[11px] font-bold text-white truncate w-full shadow-sm" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
        {displayName || name}
      </div>
      {marketValue != null && (
        <div className="text-[8px] sm:text-[9px] font-bold text-[#8b92a5] whitespace-nowrap bg-[#171717]/80 px-1 rounded-sm inline-block mt-0.5">
          {(marketValue / 1000000).toFixed(1)} Mio
        </div>
      )}
    </div>
  </div>
);

export default PlayerPhotoCard;
