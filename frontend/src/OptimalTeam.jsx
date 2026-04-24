import React, { useState, useEffect } from 'react';

const formatMoney = (val) => (val || 0).toLocaleString('de-DE') + ' €';

const PositionRow = ({ players, positionName }) => {
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
            <div key={p.id} className={`relative flex flex-col items-center group ${containerSize}`}>
              {/* Spieler-Bild */}
              <div className={`${baseSize} rounded-full bg-[#1e222a] border-2 border-[#3a3f4a] overflow-hidden flex items-center justify-center shadow-lg relative group-hover:border-[#ff5c3e] transition-colors`}>
              {p.imagePath ? (
                <img 
                  src={`https://cdn.kickbase.com/files/players/${p.imagePath}/1`} 
                  alt={p.name} 
                  className="w-full h-full object-cover scale-110 mt-2"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="text-gray-500 font-bold text-xs uppercase">{p.name.substring(0, 2)}</div>
              )}
              {/* Punkte-Badge - Exakt im Zentrum (mittig mittig) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white text-[11px] font-black px-2 py-1 rounded-lg border-2 border-[#1e222a] shadow-xl flex items-center justify-center min-w-[32px] z-20">
                {p.points}
              </div>
            </div>
            
            {/* Name & Wert */}
            <div className="mt-2 text-center w-full">
              <div className="text-[10px] sm:text-[11px] font-bold text-white truncate w-full shadow-sm" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                {p.lastName || p.name}
              </div>
              <div className="text-[8px] sm:text-[9px] font-bold text-[#8b92a5] whitespace-nowrap bg-[#1a1d24]/80 px-1 rounded-sm inline-block mt-0.5">
                {(p.marketValue / 1000000).toFixed(1)} Mio
              </div>
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const OptimalTeam = ({ isOpen, onClose, availableMatchdays, currentGlobalMatchday }) => {
  // Start with the latest matchday, but ensure it's a number
  const initial = availableMatchdays.filter(m => typeof m === 'number').sort((a,b) => b-a)[0] || currentGlobalMatchday;
  const [matchday, setMatchday] = useState(initial);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch optimal team data
  useEffect(() => {
    if (!isOpen) return;
    
    setLoading(true);
    setError(null);
    
    // Vermeide Caching
    fetch(`/history/optimal-md-${matchday}-final.json?t=${Date.now()}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Keine optimalen Daten für diesen Spieltag gefunden.');
        }
        return res.json();
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setData(null);
        setLoading(false);
      });
  }, [matchday, isOpen]);

  // Sync initial matchday when modal opens
  useEffect(() => {
    if (isOpen) {
      const bestInitial = availableMatchdays.filter(m => typeof m === 'number').sort((a,b) => b-a)[0] || currentGlobalMatchday;
      setMatchday(bestInitial);
    }
  }, [isOpen, availableMatchdays, currentGlobalMatchday]);

  if (!isOpen) return null;

  const validMatchdays = availableMatchdays.filter(m => typeof m === 'number').sort((a, b) => a - b);
  const currentIndex = validMatchdays.indexOf(matchday);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setMatchday(validMatchdays[currentIndex - 1]);
    } else {
      setMatchday(validMatchdays[validMatchdays.length - 1]); // wrap around
    }
  };

  const handleNext = () => {
    if (currentIndex < validMatchdays.length - 1) {
      setMatchday(validMatchdays[currentIndex + 1]);
    } else {
      setMatchday(validMatchdays[0]); // wrap around
    }
  };

  // Gruppieren
  const tw = data?.lineup?.filter(p => p.position === 1) || [];
  const aw = data?.lineup?.filter(p => p.position === 2) || [];
  const mf = data?.lineup?.filter(p => p.position === 3) || [];
  const st = data?.lineup?.filter(p => p.position === 4) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>
      
      {/* Modal Container */}
      <div className="bg-[#111318] border border-[#2a2e37] w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl relative flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[#2a2e37] bg-[#1a1d24]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#ff5c3e]/10 flex items-center justify-center text-[#ff5c3e]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black uppercase tracking-wider text-white">Die Optimale Elf</h2>
              <p className="text-[10px] text-[#8b92a5] uppercase tracking-widest">Maximal mögliche Punkte</p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#20242d] text-[#8b92a5] hover:text-white hover:bg-[#2a2e37] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Matchday Toggle & Summary */}
        <div className="p-4 bg-[#14161b] border-b border-[#2a2e37] flex flex-col sm:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center bg-[#1a1d24] border border-[#2a2e37] rounded-lg shadow-inner w-full sm:w-auto h-10">
            <button onClick={handlePrev} className="px-4 text-[#8b92a5] hover:text-[#ff5c3e] transition-colors active:scale-95 h-full">
              &lsaquo;
            </button>
            <span className="px-4 text-xs font-bold text-gray-200 uppercase tracking-widest min-w-[120px] text-center">
              Spieltag {matchday}
            </span>
            <button onClick={handleNext} className="px-4 text-[#8b92a5] hover:text-[#ff5c3e] transition-colors active:scale-95 h-full">
              &rsaquo;
            </button>
          </div>

          {!loading && !error && data && (
            <div className="flex gap-4 w-full sm:w-auto text-center sm:text-right">
              <div className="flex-1 sm:flex-none">
                <div className="text-[10px] uppercase tracking-widest text-[#8b92a5] font-bold">Punkte</div>
                <div className="text-lg font-black text-green-500 leading-none">{data.totalPoints?.toLocaleString('de-DE')}</div>
              </div>
              <div className="w-[1px] bg-[#2a2e37]"></div>
              <div className="flex-1 sm:flex-none">
                <div className="text-[10px] uppercase tracking-widest text-[#8b92a5] font-bold">Budget</div>
                <div className="text-sm font-bold text-white mt-1 leading-none">{formatMoney(data.totalBudget)}</div>
                <div className="text-[9px] text-gray-500">/ 250 Mio.</div>
              </div>
            </div>
          )}
        </div>

        {/* Content (Pitch) */}
        <div className="flex-1 overflow-y-auto bg-[#1a1d24] relative min-h-[400px] flex flex-col justify-center py-8"
             style={{
                backgroundImage: 'radial-gradient(circle at center, #1e2530 0%, #111318 100%)'
             }}>
          
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center">
                <span className="w-8 h-8 border-2 border-[#ff5c3e] border-t-transparent rounded-full animate-spin"></span>
                <span className="mt-4 text-[10px] font-bold text-[#8b92a5] uppercase tracking-widest animate-pulse">Berechne ILP Modell...</span>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <div>
                <div className="text-4xl mb-4 opacity-50">🏟️</div>
                <h3 className="text-gray-300 font-bold mb-2">Keine Daten gefunden</h3>
                <p className="text-xs text-[#8b92a5] max-w-xs mx-auto">Die optimale Elf für Spieltag {matchday} wurde noch nicht berechnet oder der Spieltag existiert nicht in der Historie.</p>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-md mx-auto flex flex-col justify-between h-full relative">
              {/* Pitch lines background */}
              <div className="absolute inset-0 pointer-events-none opacity-5 border-2 border-white rounded-lg m-4">
                <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border border-white rounded-full"></div>
              </div>

              {/* Aufstellung Rows */}
              <div className="flex flex-col justify-between h-full gap-2 relative z-10">
                <PositionRow players={st} positionName="ST" />
                <PositionRow players={mf} positionName="MF" />
                <PositionRow players={aw} positionName="AW" />
                <PositionRow players={tw} positionName="TW" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OptimalTeam;
