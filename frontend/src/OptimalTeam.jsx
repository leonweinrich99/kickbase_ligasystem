import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Trophy, Wallet, Star, SearchX } from 'lucide-react';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';

// Vollbild-Seite (eigene Route) statt Overlay-Modal - gleiche Design-Strategie
// wie UserDetail/CompareView: sticky Header mit Zurueck-Button, Inhalt direkt
// darunter, kein Backdrop/Card-Rahmen mehr. Der Spieltag steckt in der URL
// (":matchday"), damit die Seite per Browser-Back/Deep-Link funktioniert.

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
            <div key={p.id} className={`relative flex flex-col items-center group ${containerSize}`}>
              {/* Spieler-Bild - abgerundetes Rechteck statt Kreis, damit der
                  Bildausschnitt (top-orientiert) das Gesicht nicht mehr an
                  den Raendern abschneidet (Owner-Wunsch 30.08., Issue 3edfc346) */}
              <div className={`${baseSize} rounded-lg bg-[#202020] overflow-hidden flex items-center justify-center shadow-lg relative`}>
              {p.imagePath ? (
                <img
                  src={`https://kickbase.b-cdn.net/${p.imagePath}`}
                  alt={p.name}
                  className="w-full h-full object-cover object-top"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="text-gray-500 font-bold text-xs uppercase">{p.name.substring(0, 2)}</div>
              )}
              {/* Punkte-Badge - untere rechte Ecke statt Bildmitte, damit das
                  Gesicht frei sichtbar bleibt (Owner-Wunsch 30.08.) */}
              <div className="absolute -bottom-1.5 -right-1.5 bg-green-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-md border-2 border-[#202020] shadow-xl flex items-center justify-center min-w-[26px] z-20">
                {p.points}
              </div>
            </div>

            {/* Name & Wert */}
            <div className="mt-2 text-center w-full">
              <div className="text-[10px] sm:text-[11px] font-bold text-white truncate w-full shadow-sm" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                {p.lastName || p.name}
              </div>
              <div className="text-[8px] sm:text-[9px] font-bold text-[#8b92a5] whitespace-nowrap bg-[#171717]/80 px-1 rounded-sm inline-block mt-0.5">
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

const OptimalTeam = ({ dataBase = '', routeBase = '' }) => {
  const { matchday: matchdayParam } = useParams();
  const navigate = useNavigate();
  const goBack = useBackNavigation(routeBase || '/');

  const [availableMatchdays, setAvailableMatchdays] = useState([]);
  const [latestMatchday, setLatestMatchday] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Verfügbare Spieltage + aktuellsten Spieltag laden (einmalig) - sobald
  // klar ist, welcher Spieltag "der neueste" ist, wird bei fehlendem
  // URL-Parameter direkt dorthin umgeleitet.
  useEffect(() => {
    Promise.all([
      fetch(`${dataBase}/history/index.json`).then((res) => res.json()).catch(() => ({ matchdays: [] })),
      fetch(`${dataBase}/data.json`).then((res) => res.json())
    ]).then(([index, latestData]) => {
      const mDay = Number(latestData.matchday);
      const historyDays = (index.matchdays || []).map(Number);
      const all = [...new Set([...historyDays, mDay])].sort((a, b) => a - b);
      setAvailableMatchdays(all);
      setLatestMatchday(mDay);

      if (!matchdayParam) {
        navigate(`${routeBase}/optimale-elf/${mDay}`, { replace: true });
      }
    }).catch((err) => console.error('Fehler beim Laden der Spieltag-Liste:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataBase]);

  const matchday = matchdayParam ? Number(matchdayParam) : latestMatchday;

  // Fetch optimal team data
  useEffect(() => {
    if (!matchday) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Vermeide Caching
    fetch(`${dataBase}/history/optimal-md-${matchday}-final.json?t=${Date.now()}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Keine optimalen Daten für diesen Spieltag gefunden.');
        }
        return res.json();
      })
      .then(d => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error(err);
        setError(err.message);
        setData(null);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [matchday, dataBase]);

  const currentIndex = availableMatchdays.indexOf(matchday);

  const handlePrev = () => {
    if (!availableMatchdays.length) return;
    const idx = currentIndex > 0 ? currentIndex - 1 : availableMatchdays.length - 1;
    navigate(`${routeBase}/optimale-elf/${availableMatchdays[idx]}`);
  };

  const handleNext = () => {
    if (!availableMatchdays.length) return;
    const idx = currentIndex < availableMatchdays.length - 1 ? currentIndex + 1 : 0;
    navigate(`${routeBase}/optimale-elf/${availableMatchdays[idx]}`);
  };

  // Gruppieren
  const tw = data?.lineup?.filter(p => p.position === 1) || [];
  const aw = data?.lineup?.filter(p => p.position === 2) || [];
  const mf = data?.lineup?.filter(p => p.position === 3) || [];
  const st = data?.lineup?.filter(p => p.position === 4) || [];

  return (
    <div className="w-full bg-[#000000] min-h-screen relative flex flex-col pb-10">
      {/* Header mit Zurueck-Button (Page-Look, wie Advisor::PlayerDetailView) */}
      <div className="sticky top-0 z-40 bg-[#000000]/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#2e2e2e]/50">
        <BackButton onClick={goBack} />
        <div className="flex items-center gap-2 text-[#ff5c3e]">
          <Star size={16} strokeWidth={2.5} fill="#ff5c3e" />
          <span className="text-xs font-bold uppercase tracking-wider">Die Optimale Elf</span>
        </div>
      </div>

      <div className="max-w-[700px] w-full mx-auto pt-6 pb-8 px-4 sm:px-6">
        {/* Matchday Toggle & Summary */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-6">
          <div className="bg-[#171717] border border-[#2e2e2e] rounded-xl flex items-center shadow-lg font-semibold overflow-hidden w-full md:w-auto justify-between h-12">
            <button
              onClick={handlePrev}
              className="px-5 h-full text-[#8b92a5] hover:text-[#ff5c3e] transition-colors bg-[#141414] active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="px-6 flex-1 flex flex-col items-center justify-center min-w-[120px]">
              <span className="text-[11px] font-bold text-gray-200 whitespace-nowrap uppercase tracking-widest text-center">
                Spieltag {matchday ?? '–'}
              </span>
            </div>
            <button
              onClick={handleNext}
              className="px-5 h-full text-[#8b92a5] hover:text-[#ff5c3e] transition-colors bg-[#141414] active:scale-90"
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

              <div className="w-[1px] h-8 bg-[#2e2e2e]"></div>

              {/* Budget */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-sm">
                  <Wallet size={20} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#8b92a5] font-black">Budget</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-white leading-none">{(data.totalBudget / 1000000).toFixed(1)} Mio.</span>
                    <span className="text-[10px] text-gray-500 font-bold">/ 150</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Content (Pitch) */}
        <div data-tour="optimal-team-pitch" className="rounded-2xl overflow-hidden relative min-h-[400px] flex flex-col justify-center py-8"
             style={{
                backgroundImage: 'radial-gradient(circle at center, #171717 0%, #0a0a0a 100%)'
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
                <SearchX size={36} strokeWidth={1.5} className="mx-auto mb-4 text-gray-500" />
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
                <PositionRow players={st} />
                <PositionRow players={mf} />
                <PositionRow players={aw} />
                <PositionRow players={tw} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OptimalTeam;
