import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import logo from './assets/pokal_logo.png';
import LoadingScreen from './LoadingScreen';
import useMinimumDelay from './useMinimumDelay';

const MatchBox = ({ match, isFinal, tourTarget }) => {
  const isWinner1 = match.winner === 1;
  const isWinner2 = match.winner === 2;

  return (
    <div data-tour={tourTarget ? 'pokal-first-match' : undefined} className={`flex flex-col bg-[#1a1d24] border border-[#2a2e37] rounded-xl overflow-hidden shadow-lg w-full xl:w-48 flex-shrink-0 transition-transform hover:scale-105 hover:border-[#8b5cf6]/50 ${isFinal ? 'ring-2 ring-[#8b5cf6] shadow-[0_0_20px_rgba(139,92,246,0.3)] xl:scale-110 z-10' : ''}`}>
      <div className={`flex justify-between items-center p-2.5 xl:p-2 border-b border-[#2a2e37] ${isWinner1 ? 'bg-green-500/10' : ''}`}>
        <span className={`text-xs sm:text-sm font-bold truncate pr-2 ${isWinner1 ? 'text-white' : 'text-gray-300'}`}>{match.p1 || '-'}</span>
        <span className={`text-xs sm:text-sm font-black ${isWinner1 ? 'text-green-400' : 'text-gray-500'}`}>{match.score1 > 0 ? match.score1 : ''}</span>
      </div>
      <div className={`flex justify-between items-center p-2.5 xl:p-2 ${isWinner2 ? 'bg-green-500/10' : ''}`}>
        <span className={`text-xs sm:text-sm font-bold truncate pr-2 ${isWinner2 ? 'text-white' : 'text-gray-300'}`}>{match.p2 || '-'}</span>
        <span className={`text-xs sm:text-sm font-black ${isWinner2 ? 'text-green-400' : 'text-gray-500'}`}>{match.score2 > 0 ? match.score2 : ''}</span>
      </div>
    </div>
  );
};

const MobileRoundView = ({ matches, isFirstRound, isFinal }) => {
  // Group matches into pairs
  const pairs = [];
  for (let i = 0; i < matches.length; i += 2) {
    pairs.push([matches[i], matches[i + 1]]);
  }

  return (
    <div className="flex flex-col gap-8 mt-6 max-w-[320px] mx-auto relative w-full">
      {pairs.map((pair, idx) => (
        <div key={idx} className="relative flex flex-col gap-3">
          {pair[0] && (
            <div className="relative">
              {!isFirstRound && (
                <div className="absolute right-[100%] w-[100vw] top-1/2 border-t-2 border-[#3a3f4a] pointer-events-none"></div>
              )}
              <MatchBox match={pair[0]} isFinal={isFinal} tourTarget={idx === 0} />
            </div>
          )}
          {pair[1] && (
            <div className="relative">
              {!isFirstRound && (
                <div className="absolute right-[100%] w-[100vw] top-1/2 border-t-2 border-[#3a3f4a] pointer-events-none"></div>
              )}
              <MatchBox match={pair[1]} isFinal={isFinal} />
            </div>
          )}
          
          {/* Bracket Connecting Line */}
          {pair[1] && (
            <>
              <div className="absolute left-[100%] w-4 top-[25%] bottom-[25%] border-r-2 border-t-2 border-b-2 border-[#3a3f4a] rounded-r-xl pointer-events-none"></div>
              <div className="absolute left-[calc(100%+16px)] w-[100vw] top-1/2 border-t-2 border-[#3a3f4a] pointer-events-none"></div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};


const RoundColumn = ({ matches, title, markFirst = false }) => {
  return (
    <div className="flex flex-col justify-around gap-2 sm:gap-4 flex-1">
      <div className="text-[10px] sm:text-xs font-black uppercase text-center text-[#8b92a5] tracking-widest mb-2 opacity-70">
        {title}
      </div>
      <div className="flex flex-col justify-around flex-1 gap-2 sm:gap-4">
        {matches.map((match, index) => (
          <MatchBox key={match.id} match={match} tourTarget={markFirst && index === 0} />
        ))}
      </div>
    </div>
  );
};

const rounds = ['Sechzehntelfinale', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale'];

const variants = {
  enter: (direction) => ({
    x: direction > 0 ? 100 : -100,
    opacity: 0
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1
  },
  exit: (direction) => ({
    zIndex: 0,
    x: direction < 0 ? 100 : -100,
    opacity: 0
  })
};

const Pokal = () => {
  const [data, setData] = useState(null);
  const minDelayElapsed = useMinimumDelay(1800);
  const [activeRound, setActiveRound] = useState('Sechzehntelfinale');
  const [direction, setDirection] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const tabsRef = useRef(null);
  const desktopScrollRef = useRef(null);

  // Touch Swipe Handlers
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe || isRightSwipe) {
      const currentIndex = rounds.indexOf(activeRound);
      if (isLeftSwipe && currentIndex < rounds.length - 1) {
        handleRoundChange(rounds[currentIndex + 1]);
      }
      if (isRightSwipe && currentIndex > 0) {
        handleRoundChange(rounds[currentIndex - 1]);
      }
    }
  };

  const handleRoundChange = (round) => {
    if (round === activeRound) return;
    const currentIndex = rounds.indexOf(activeRound);
    const newIndex = rounds.indexOf(round);
    setDirection(newIndex > currentIndex ? 1 : -1);
    setActiveRound(round);
    
    if (tabsRef.current) {
      const button = tabsRef.current.querySelector(`[data-round="${round}"]`);
      if (button) {
        button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  };

  useEffect(() => {
    fetch('/pokal-data.json')
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch((err) => console.error("Error loading pokal data:", err));
  }, []);

  // Der Desktop-Baum ist breiter als der Bildschirm - standardmäßig aufs Finale
  // zentrieren, aber (anders als vorher mit CSS justify-center) über echtes
  // scrollLeft, damit man trotzdem ganz nach links/rechts scrollen kann.
  useEffect(() => {
    if (!data) return;
    const el = desktopScrollRef.current;
    if (!el) return;
    const center = () => {
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    };
    // Nach dem Layout (inkl. Zoom-Änderungen) zentrieren
    const raf = requestAnimationFrame(center);
    return () => cancelAnimationFrame(raf);
  }, [data, zoomLevel]);

  if (!data || !minDelayElapsed) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10 font-sans select-none">
    <div className="max-w-[1600px] mx-auto bg-[#000000]">
      {/* Header */}
      <div className="flex flex-col mb-4 sm:mb-8 border-b border-[#2a2e37] pb-4 sm:pb-6 gap-4">

        {/* Top Row: Logo, Title, Neuer-Pokalmodus-Badge (oben rechts, mobil) */}
        <div className="flex justify-between items-start gap-2 w-full">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
            <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center p-0.5 sm:p-1 overflow-hidden flex-shrink-0">
              <img src={logo} alt="Kickbase Liga Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0 pr-1">
              <div className="text-[9px] sm:text-[11px] font-bold tracking-wider text-[#8b5cf6] mb-1">SAISON 26/27</div>
              <h1 className="text-[17px] sm:text-3xl font-black tracking-tight uppercase leading-[1.1] break-words">Pokal</h1>
            </div>
          </div>

          <Link
            to="/pokal-rules"
            className="sm:hidden shrink-0 flex items-center gap-1.5 bg-[#1a1d24] border border-[#8b5cf6]/40 hover:border-[#8b5cf6] transition-colors rounded-full pl-2.5 pr-3 py-1.5 shadow-lg active:scale-95 group mt-1"
          >
            <span className="text-[7px] font-black uppercase text-white bg-[#8b5cf6] rounded-full px-1.5 py-0.5 tracking-widest leading-none">Neu</span>
            <span className="text-[10px] font-bold text-gray-300 group-hover:text-white transition-colors whitespace-nowrap">Pokalmodus</span>
          </Link>
        </div>

        {/* Zweite Zeile: Runden-Umschalter (mobil), auf gleicher Höhe wie der Spieltag-Wechsler in der Liga */}
        <div className="flex xl:hidden w-full items-center gap-2 sm:gap-4">
          <div ref={tabsRef} className="flex overflow-x-auto gap-2 no-scrollbar scroll-smooth h-12 items-center flex-1 bg-[#1a1d24] border border-[#2a2e37] rounded-xl px-2 shadow-lg">
            {rounds.map(round => (
              <button
                key={round}
                data-round={round}
                onClick={() => handleRoundChange(round)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap text-xs font-bold transition-all flex-shrink-0 ${activeRound === round ? 'bg-white text-black' : 'text-[#8b92a5] hover:text-white'}`}
              >
                {round}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Bracket View (Inhalt der Runde) */}
      <div data-tour="pokal-bracket" className="block xl:hidden -mx-4 pb-10 overflow-hidden">
        <div 
          className="mt-2 relative min-h-[400px] px-4"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEndHandler}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={activeRound}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ 
                x: { type: "spring", stiffness: 300, damping: 30 }, 
                opacity: { duration: 0.2 }
              }}
              className="w-full"
            >
              {activeRound === 'Sechzehntelfinale' && <MobileRoundView matches={[...data.roundOf32Left, ...data.roundOf32Right]} isFirstRound={true} />}
              {activeRound === 'Achtelfinale' && <MobileRoundView matches={[...data.roundOf16Left, ...data.roundOf16Right]} />}
              {activeRound === 'Viertelfinale' && <MobileRoundView matches={[...data.quarterFinalsLeft, ...data.quarterFinalsRight]} />}
              {activeRound === 'Halbfinale' && <MobileRoundView matches={[...data.semiFinalsLeft, ...data.semiFinalsRight]} />}
              {activeRound === 'Finale' && <MobileRoundView matches={data.final} isFinal={true} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Desktop Bracket View - Tree structure */}
      <div data-tour="pokal-bracket" className="hidden xl:block relative pb-10">
        
        {/* Zoom Controls */}
        <div className="absolute right-8 top-0 flex items-center gap-1.5 bg-[#1a1d24] border border-[#2a2e37] p-1.5 rounded-xl z-20 shadow-lg">
          <button onClick={() => setZoomLevel(prev => Math.max(0.4, prev - 0.15))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2a2e37] text-[#8b92a5] hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <span className="text-[11px] font-black w-12 text-center text-gray-300 tracking-wider">{Math.round(zoomLevel * 100)}%</span>
          <button onClick={() => setZoomLevel(prev => Math.min(1.5, prev + 0.15))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2a2e37] text-[#8b92a5] hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <div className="w-[1px] h-5 bg-[#2a2e37] mx-1"></div>
          <button onClick={() => setZoomLevel(1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2a2e37] text-[#8b92a5] hover:text-white transition-colors" title="Reset Zoom">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>
          </button>
        </div>

        <div ref={desktopScrollRef} className="overflow-x-auto custom-scrollbar mt-6">
          <div 
            className="min-w-max flex justify-center items-stretch gap-6 px-8 py-8 mx-auto"
            style={{ zoom: zoomLevel }}
          >
          
          {/* Left Bracket */}
          <div className="flex gap-4 sm:gap-8 flex-1">
            <RoundColumn matches={data.roundOf32Left} title="Sechzehntelfinale" markFirst />
            <RoundColumn matches={data.roundOf16Left} title="Achtelfinale" />
            <RoundColumn matches={data.quarterFinalsLeft} title="Viertelfinale" />
            <RoundColumn matches={data.semiFinalsLeft} title="Halbfinale" />
          </div>

          {/* Center (Final) */}
          <div className="flex flex-col justify-center items-center mx-4 sm:mx-8 relative">
            <div className="text-[14px] sm:text-[18px] font-black uppercase text-[#8b5cf6] tracking-widest mb-8 text-center drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]">
              Finale
            </div>
            {data.final.map(match => (
              <MatchBox key={match.id} match={match} isFinal={true} />
            ))}
            {/* Trophy Icon underneath final */}
            <div className="mt-12 opacity-80">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                    <path d="M4 22h16"></path>
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                    <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z"></path>
                </svg>
            </div>
          </div>

          {/* Right Bracket */}
          <div className="flex gap-4 sm:gap-8 flex-1 flex-row-reverse">
            <RoundColumn matches={data.roundOf32Right} title="Sechzehntelfinale" />
            <RoundColumn matches={data.roundOf16Right} title="Achtelfinale" />
            <RoundColumn matches={data.quarterFinalsRight} title="Viertelfinale" />
            <RoundColumn matches={data.semiFinalsRight} title="Halbfinale" />
          </div>

        </div>
        </div>
      </div>
      
    </div>
    </div>
  );
};

export default Pokal;
