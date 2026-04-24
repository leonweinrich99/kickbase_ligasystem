import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trophy, Wallet } from 'lucide-react';

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
        <div className="px-6 py-4 bg-[#14161b] border-b border-[#2a2e37] flex flex-col md:flex-row justify-between items-center gap-6">
          
          {/* Spieltag-Wechsler (Dashboard-Design) */}
          <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-xl flex items-center shadow-lg font-semibold overflow-hidden w-full md:w-auto h-12">
            <button 
              onClick={handlePrev}
              className="px-5 h-full text-[#8b92a5] hover:text-[#ff5c3e] transition-colors bg-[#181a20] active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="px-6 flex flex-col items-center min-w-[120px]">
              <span className="text-[11px] font-bold text-gray-200 whitespace-nowrap uppercase tracking-widest text-center">
                Spieltag {matchday}
              </span>
            </div>
            <button 
              onClick={handleNext}
              className="px-5 h-full text-[#8b92a5] hover:text-[#ff5c3e] transition-colors bg-[#181a20] active:scale-90"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {!loading && !error && data && (
            <div className="flex items-center gap-8">
              {/* Punkte */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20 shadow-sm">
                  <Trophy size={20} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#8b92a5] font-black">Gesamtpunkte</div>
                  <div className="text-xl font-black text-green-500 leading-none tracking-tight">{data.totalPoints?.toLocaleString('de-DE')}</div>
                </div>
              </div>

              <div className="w-[1px] h-8 bg-[#2a2e37]"></div>

              {/* Budget */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-sm">
                  <Wallet size={20} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#8b92a5] font-black">Budget</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-white leading-none">{(data.totalBudget / 1000000).toFixed(1)} Mio.</span>
                    <span className="text-[10px] text-gray-500 font-bold">/ 250</span>
                  </div>
                </div>
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
