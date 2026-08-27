import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Minus, Plus, RotateCcw, Trophy } from 'lucide-react';
import logo from './assets/pokal_logo.png';
import LoadingScreen from './LoadingScreen';
import useMinimumDelay from './useMinimumDelay';
import { shouldShowSplash, markSplashShown } from './appLoadState';
import ManagerAvatar from './ui/ManagerAvatar';

// "Sieger SF13" & Co. sind Platzhalter für noch nicht ausgespielte Partien,
// "Freilos" für einen direkten Aufstieg ohne Gegner - beides ist (noch) kein
// echter Manager und kann daher nicht mit jemandem verglichen werden.
const isPlaceholderName = (name) => !name || name.startsWith('Sieger') || name === 'Freilos';

// Horizontale Kachel - Foto-Avatar (ohne Fade, mit duennem farbigem
// Liga-Ring) links, Name direkt rechts daneben (nicht mehr ueberlagernd) -
// Ergebnis mittig.
const MatchBox = ({ match, isFinal, tourTarget, leagueColors = {}, nameToId = {}, onOpenCompare, pokalMembers = null }) => {
  const isWinner1 = match.winner === 1;
  const isWinner2 = match.winner === 2;
  const color1 = leagueColors[match.p1];
  const color2 = leagueColors[match.p2];

  const id1 = !isPlaceholderName(match.p1) ? nameToId[match.p1] : null;
  const id2 = !isPlaceholderName(match.p2) ? nameToId[match.p2] : null;
  const isClickable = Boolean(id1 && id2 && id1 !== id2 && onOpenCompare);

  // Grüner Haken: ist diese Person schon Mitglied der echten Kickbase-Pokal-Liga?
  // (pokalMembers === null, solange die Liste noch lädt -> dann lieber nichts
  // anzeigen als fälschlich "fehlt" zu suggerieren)
  const isMember1 = pokalMembers && !isPlaceholderName(match.p1) && pokalMembers.has(match.p1);
  const isMember2 = pokalMembers && !isPlaceholderName(match.p2) && pokalMembers.has(match.p2);

  const hasResult = Boolean(match.winner) || (match.score1 || 0) > 0 || (match.score2 || 0) > 0;
  const score1Display = hasResult ? (match.score1 ?? 0) : '–';
  const score2Display = hasResult ? (match.score2 ?? 0) : '–';

  return (
    <div
      data-tour={tourTarget ? 'pokal-first-match' : undefined}
      onClick={isClickable ? () => onOpenCompare(id1, id2) : undefined}
      role={isClickable ? 'button' : undefined}
      className={`flex items-center gap-1.5 sm:gap-2 card-surface rounded-xl shadow-lg w-full xl:w-64 flex-shrink-0 p-2 sm:p-2.5 transition-transform hover:scale-105 hover:border-[#8b5cf6]/50 ${isFinal ? 'ring-2 ring-[#8b5cf6] shadow-[0_0_20px_rgba(139,92,246,0.3)] xl:scale-110 z-10' : ''} ${isClickable ? 'cursor-pointer active:scale-95' : ''}`}
    >
      {/* Spieler 1 (links): Avatar, Name direkt rechts daneben */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
        <ManagerAvatar name={isPlaceholderName(match.p1) ? null : match.p1} size={40} ringColor={color1} ringWidth={1.5} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className={`text-[10px] sm:text-xs font-bold truncate ${isWinner1 ? 'text-white' : 'text-gray-300'}`}>{match.p1 || '-'}</span>
            {isMember1 && <Check size={10} strokeWidth={3.5} className="text-green-500 shrink-0" />}
          </div>
        </div>
      </div>

      {/* Ergebnis mittig - min-w reserviert genug Platz fuer den Arena-Modus,
          dessen Punktestand auch mal vierstellig sein kann (z.B. 1354:1876) */}
      <div className="flex flex-col items-center shrink-0 px-0.5 min-w-[44px] sm:min-w-[56px]">
        <div className="text-[11px] sm:text-sm font-black whitespace-nowrap tabular-nums">
          <span className={isWinner1 ? 'text-green-400' : 'text-gray-500'}>{score1Display}</span>
          <span className="text-gray-600 mx-0.5">:</span>
          <span className={isWinner2 ? 'text-green-400' : 'text-gray-500'}>{score2Display}</span>
        </div>
      </div>

      {/* Spieler 2 (rechts): Avatar, Name direkt rechts daneben */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
        <ManagerAvatar name={isPlaceholderName(match.p2) ? null : match.p2} size={40} ringColor={color2} ringWidth={1.5} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className={`text-[10px] sm:text-xs font-bold truncate ${isWinner2 ? 'text-white' : 'text-gray-300'}`}>{match.p2 || '-'}</span>
            {isMember2 && <Check size={10} strokeWidth={3.5} className="text-green-500 shrink-0" />}
          </div>
        </div>
      </div>
    </div>
  );
};

const MobileRoundView = ({ matches, isFirstRound, isFinal, leagueColors, nameToId, onOpenCompare, pokalMembers }) => {
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
                <div className="absolute right-[100%] w-[100vw] top-1/2 border-t-2 border-[#404040] pointer-events-none"></div>
              )}
              <MatchBox match={pair[0]} isFinal={isFinal} tourTarget={idx === 0} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={onOpenCompare} pokalMembers={pokalMembers} />
            </div>
          )}
          {pair[1] && (
            <div className="relative">
              {!isFirstRound && (
                <div className="absolute right-[100%] w-[100vw] top-1/2 border-t-2 border-[#404040] pointer-events-none"></div>
              )}
              <MatchBox match={pair[1]} isFinal={isFinal} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={onOpenCompare} pokalMembers={pokalMembers} />
            </div>
          )}
          
          {/* Bracket Connecting Line */}
          {pair[1] && (
            <>
              <div className="absolute left-[100%] w-4 top-[25%] bottom-[25%] border-r-2 border-t-2 border-b-2 border-[#404040] rounded-r-xl pointer-events-none"></div>
              <div className="absolute left-[calc(100%+16px)] w-[100vw] top-1/2 border-t-2 border-[#404040] pointer-events-none"></div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};


const RoundColumn = ({ matches, title, schedule, markFirst = false, leagueColors, nameToId, onOpenCompare, pokalMembers }) => {
  return (
    <div className="flex flex-col justify-around gap-2 sm:gap-4 flex-1">
      <div className="text-[10px] sm:text-xs font-black uppercase text-center text-[#8b92a5] tracking-widest mb-2 opacity-70">
        {title}
        {schedule && <div className="normal-case tracking-normal text-[9px] text-[#8b5cf6] mt-1 opacity-100">BL-Spieltag {schedule.matchday} · {schedule.date}</div>}
      </div>
      <div className="flex flex-col justify-around flex-1 gap-2 sm:gap-4">
        {matches.map((match, index) => (
          <MatchBox key={match.id} match={match} tourTarget={markFirst && index === 0} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={onOpenCompare} pokalMembers={pokalMembers} />
        ))}
      </div>
    </div>
  );
};

const rounds = ['Sechzehntelfinale', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale'];

const variants = {
  enter: (direction) => ({
    x: direction > 0 ? 50 : -50,
    opacity: 0
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1
  },
  exit: (direction) => ({
    zIndex: 0,
    x: direction < 0 ? 50 : -50,
    opacity: 0
  })
};

const Pokal = () => {
  const [data, setData] = useState(null);
  const [leagueColors, setLeagueColors] = useState({});
  const [nameToId, setNameToId] = useState({});
  const [pokalMembers, setPokalMembers] = useState(null);
  const navigate = useNavigate();
  const minDelayElapsed = useMinimumDelay(1800);

  // Der animierte Splash-Screen soll nur beim allerersten Öffnen der App
  // erscheinen - bei jedem weiteren Besuch von /pokal reicht eine stille,
  // dunkle Fläche.
  const [showSplash] = useState(() => {
    const should = shouldShowSplash();
    if (should) markSplashShown();
    return should;
  });
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

  const roundSchedule = data?.meta?.roundSchedule || {};

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

    // Für die Farbmarkierung: Zuordnung Name -> Liga-Farbe aus dem
    // Qualiphasen-Endstand (die Basis der Pokal-Auslosung) aufbauen.
    fetch('/archive/quali-2025-26/data.json')
      .then((res) => res.json())
      .then((json) => {
        const map = {};
        (json.leagues || []).forEach((l) => {
          l.users.forEach((u) => {
            map[u.name] = l.color;
          });
        });
        setLeagueColors(map);
      })
      .catch((err) => console.error("Error loading league color map:", err));

    // Für den Klick auf eine Partie (Head-to-Head-Vergleich): Zuordnung
    // Name -> aktuelle Kickbase-ID aus dem LIVE-Ligasystem (CompareView
    // erwartet genau diese IDs, siehe App.jsx-Route "/*" -> dataBase="").
    fetch('/data.json')
      .then((res) => res.json())
      .then((json) => {
        const map = {};
        (json.leagues || []).forEach((l) => {
          l.users.forEach((u) => {
            map[u.name] = u.id;
          });
        });
        setNameToId(map);
      })
      .catch((err) => console.error("Error loading manager id map:", err));

    // Für den grünen Haken: wer ist schon TATSÄCHLICH Mitglied der echten
    // Kickbase-Pokal-Liga? (siehe backend/scripts/fetch-pokal-arena.js)
    fetch('/history/pokal-league-members.json')
      .then((res) => res.json())
      .then((json) => setPokalMembers(new Set(json.members || [])))
      .catch((err) => console.error("Error loading pokal league members:", err));
  }, []);

  const handleOpenCompare = (id1, id2) => {
    navigate(`/compare/${id1}/${id2}`);
  };

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

  if (!data || (showSplash && !minDelayElapsed)) {
    return showSplash ? <LoadingScreen /> : <div className="min-h-screen bg-[#000000]"></div>;
  }

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10 font-sans select-none">
    <div className="max-w-[1600px] mx-auto bg-[#000000]">
      {/* Header */}
      <div className="flex flex-col mb-4 sm:mb-8 border-b border-[#2e2e2e] pb-4 sm:pb-6 gap-4">

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
            className="sm:hidden shrink-0 flex items-center gap-1.5 bg-[#171717] border border-[#8b5cf6]/40 hover:border-[#8b5cf6] transition-colors rounded-full pl-2.5 pr-3 py-1.5 shadow-lg active:scale-95 group mt-1"
          >
            <span className="text-[7px] font-black uppercase text-white bg-[#8b5cf6] rounded-full px-1.5 py-0.5 tracking-widest leading-none">Neu</span>
            <span className="text-[10px] font-bold text-gray-300 group-hover:text-white transition-colors whitespace-nowrap">Pokalmodus</span>
          </Link>
        </div>

        {/* Zweite Zeile: Runden-Umschalter (mobil), auf gleicher Höhe wie der Spieltag-Wechsler in der Liga */}
        {/* Zweite Zeile: Runden-Umschalter (mobil), auf gleicher Höhe wie der Spieltag-Wechsler in der Liga */}
        <div className="flex xl:hidden w-full items-center gap-2 sm:gap-4">
          <div ref={tabsRef} className="flex overflow-x-auto gap-2 no-scrollbar scroll-smooth h-12 items-center flex-1 bg-[#171717] border border-[#2e2e2e] rounded-xl px-2 shadow-lg">
            {rounds.map(round => (
              <button
                key={round}
                data-round={round}
                onClick={() => handleRoundChange(round)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap text-xs font-bold transition-all flex-shrink-0 ${activeRound === round ? 'bg-white text-black' : 'text-[#8b92a5] hover:text-white'}`}
              >
                <span>{round}</span>
                {roundSchedule[round] && <span className="block text-[9px] font-normal text-[#8b5cf6] mt-0.5">BL-Spieltag {roundSchedule[round].matchday} · {roundSchedule[round].date}</span>}
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
                x: { type: "tween", duration: 0.15, ease: "easeOut" }, 
                opacity: { duration: 0.12 }
              }}
              className="w-full"
            >
              {activeRound === 'Sechzehntelfinale' && <MobileRoundView matches={[...data.roundOf32Left, ...data.roundOf32Right]} isFirstRound={true} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />}
              {activeRound === 'Achtelfinale' && <MobileRoundView matches={[...data.roundOf16Left, ...data.roundOf16Right]} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />}
              {activeRound === 'Viertelfinale' && <MobileRoundView matches={[...data.quarterFinalsLeft, ...data.quarterFinalsRight]} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />}
              {activeRound === 'Halbfinale' && <MobileRoundView matches={[...data.semiFinalsLeft, ...data.semiFinalsRight]} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />}
              {activeRound === 'Finale' && <MobileRoundView matches={data.final} isFinal={true} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Desktop Bracket View - Tree structure */}
      <div data-tour="pokal-bracket" className="hidden xl:block relative pb-10">
        
        {/* Zoom Controls */}
        <div className="absolute right-8 top-0 flex items-center gap-1.5 bg-[#171717] border border-[#2e2e2e] p-1.5 rounded-xl z-20 shadow-lg">
          <button onClick={() => setZoomLevel(prev => Math.max(0.4, prev - 0.15))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2e2e2e] text-[#8b92a5] hover:text-white transition-colors">
            <Minus size={18} strokeWidth={2.5} />
          </button>
          <span className="text-[11px] font-black w-12 text-center text-gray-300 tracking-wider">{Math.round(zoomLevel * 100)}%</span>
          <button onClick={() => setZoomLevel(prev => Math.min(1.5, prev + 0.15))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2e2e2e] text-[#8b92a5] hover:text-white transition-colors">
            <Plus size={18} strokeWidth={2.5} />
          </button>
          <div className="w-[1px] h-5 bg-[#2e2e2e] mx-1"></div>
          <button onClick={() => setZoomLevel(1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2e2e2e] text-[#8b92a5] hover:text-white transition-colors" title="Reset Zoom">
            <RotateCcw size={15} strokeWidth={2.5} />
          </button>
        </div>

        <div ref={desktopScrollRef} className="overflow-x-auto custom-scrollbar mt-6">
          <div 
            className="min-w-max flex justify-center items-stretch gap-6 px-8 py-8 mx-auto"
            style={{ zoom: zoomLevel }}
          >
          
          {/* Left Bracket */}
          <div className="flex gap-4 sm:gap-8 flex-1">
            <RoundColumn matches={data.roundOf32Left} title="Sechzehntelfinale" schedule={roundSchedule.Sechzehntelfinale} markFirst leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />
            <RoundColumn matches={data.roundOf16Left} title="Achtelfinale" schedule={roundSchedule.Achtelfinale} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />
            <RoundColumn matches={data.quarterFinalsLeft} title="Viertelfinale" schedule={roundSchedule.Viertelfinale} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />
            <RoundColumn matches={data.semiFinalsLeft} title="Halbfinale" schedule={roundSchedule.Halbfinale} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />
          </div>

          {/* Center (Final) */}
          <div className="flex flex-col justify-center items-center mx-4 sm:mx-8 relative">
            <div className="text-[14px] sm:text-[18px] font-black uppercase text-[#8b5cf6] tracking-widest mb-8 text-center drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]">
              Finale
            </div>
            {data.final.map(match => (
              <MatchBox key={match.id} match={match} isFinal={true} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />
            ))}
            {/* Trophy Icon underneath final */}
            <div className="mt-12 opacity-80">
                <Trophy size={48} color="#8b5cf6" strokeWidth={1.5} />
            </div>
          </div>

          {/* Right Bracket */}
          <div className="flex gap-4 sm:gap-8 flex-1 flex-row-reverse">
            <RoundColumn matches={data.roundOf32Right} title="Sechzehntelfinale" schedule={roundSchedule.Sechzehntelfinale} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />
            <RoundColumn matches={data.roundOf16Right} title="Achtelfinale" schedule={roundSchedule.Achtelfinale} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />
            <RoundColumn matches={data.quarterFinalsRight} title="Viertelfinale" schedule={roundSchedule.Viertelfinale} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />
            <RoundColumn matches={data.semiFinalsRight} title="Halbfinale" schedule={roundSchedule.Halbfinale} leagueColors={leagueColors} nameToId={nameToId} onOpenCompare={handleOpenCompare} pokalMembers={pokalMembers} />
          </div>

        </div>
        </div>
      </div>
      
    </div>
    </div>
  );
};

export default Pokal;
