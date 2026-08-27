import React from 'react';

// Detaillierte Statistik-Karte: Icon-Box + Label oben, große Wert-Zahl,
// kleine Zusatzzeile darunter. Herkunft: UserDetail.jsx (Punkte/Schnitt/
// Bester Spieltag/Performance-Index Raster).
const RATING_COLORS = [
  { min: 8, className: 'text-green-400' },
  { min: 6, className: 'text-green-500/80' },
  { min: 4, className: 'text-yellow-500' },
  { min: 2, className: 'text-orange-500' },
];

function getRatingColor(val) {
  if (!val) return 'text-gray-400';
  const num = parseFloat(val.toString().replace(',', '.'));
  const match = RATING_COLORS.find((r) => num >= r.min);
  return match ? match.className : 'text-red-500';
}

export default function StatCard({ icon, label, value, subValue, isRating, loading }) {
  return (
    <div className="card-surface p-3 sm:p-5 rounded-2xl shadow-sm hover:border-[#404040] transition-all group relative overflow-hidden flex flex-col justify-between">
      <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
        <div className="bg-[#1f1f1f] p-1.5 sm:p-2 rounded-lg group-hover:scale-110 transition-transform shrink-0">
          {React.cloneElement(icon, { size: 16, className: 'sm:w-[18px] sm:h-[18px]' })}
        </div>
        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-[#8b92a5] leading-tight">{label}</span>
      </div>

      <div className="flex flex-col mb-1 gap-1">
        {loading ? (
          <div className="h-5 sm:h-6 w-12 rounded bg-[#1f1f1f] animate-pulse"></div>
        ) : (
          <div className={`text-[17px] sm:text-xl font-black leading-none ${isRating ? getRatingColor(value) : ''}`}>
            {value}
            {isRating && <span className="text-[10px] text-gray-500 ml-1">/ 10</span>}
          </div>
        )}
      </div>
      <div className="text-[8px] sm:text-[9px] font-bold text-[#626978] uppercase tracking-wider mt-1">{subValue}</div>
    </div>
  );
}
