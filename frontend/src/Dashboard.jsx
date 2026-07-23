import React from 'react';
import { Link } from 'react-router-dom';
import logo from './assets/logo.png';

export const AvatarIcon = ({ name }) => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#20242d] text-[#ff5c3e] font-black text-xs uppercase">
      {name?.charAt(0) || '?'}
    </div>
  );
};

export const TrophyIcon = ({ type }) => {
  const colors = { gold: '#eab308', silver: '#94a3b8', bronze: '#ca8a04' };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors[type]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
      <path d="M4 22h16"></path>
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
      <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z"></path>
    </svg>
  );
};

export const UsersIcon = ({ className }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

export const Header = ({
  participants,
  currentView,
  onNext,
  onPrev,
  mode = 'live'
}) => {
  const displayLabel = currentView === 'saison' ? 'Gesamt' : `Spieltag ${currentView}`;

  return (
    <div className="flex flex-col mb-4 sm:mb-8 border-b border-[#2a2e37] pb-4 sm:pb-6 gap-4">

      {/* Top Row: Logo, Title, and Mobile Toggle */}
      <div className="flex justify-between items-start gap-2 w-full">
        {/* Left: Logo & Title */}
        <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
          <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center p-0.5 sm:p-1 overflow-hidden flex-shrink-0">
            <img src={logo} alt="Kickbase Liga Logo" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0 pr-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="text-[9px] sm:text-[11px] font-bold tracking-wider text-[#ff5c3e]">SAISON 26/27</div>
              {mode === 'archive' && (
                <div className="text-[8px] sm:text-[9px] font-black tracking-widest text-[#8b92a5] bg-[#20242d] border border-[#2a2e37] rounded-full px-2 py-0.5 uppercase">Archiv</div>
              )}
            </div>
            <h1 className="text-[17px] sm:text-3xl font-black tracking-tight uppercase leading-[1.1] break-words">
              {mode === 'archive' ? <>Qualifikations<br />gruppe</> : 'Ligasystem'}
            </h1>
          </div>
        </div>

        {/* Right: Archiv-Badge Platzhalter (Navigation läuft jetzt über die Tabbar) */}
      </div>

      {/* Bottom Row: Controls */}
      <div className="flex w-full sm:w-auto justify-between sm:justify-end items-center gap-2 sm:gap-4">
        {/* Spieltag-Wechsler (Pfeil-Design) */}
        <div data-tour="matchday-switcher" className="bg-[#1a1d24] border border-[#2a2e37] rounded-xl flex items-center shadow-lg font-semibold overflow-hidden flex-1 sm:flex-initial justify-between h-12">
          <button
            onClick={onPrev}
            className="px-3 sm:px-5 h-full text-[#8b92a5] hover:text-[#ff5c3e] transition-colors bg-[#181a20] active:scale-90"
          >
            &lsaquo;
          </button>
          <span className="px-2 sm:px-10 text-[11px] sm:text-sm text-gray-200 whitespace-nowrap uppercase tracking-widest text-center flex-1">
            {displayLabel}
          </span>
          <button
            onClick={onNext}
            className="px-3 sm:px-5 h-full text-[#8b92a5] hover:text-[#ff5c3e] transition-colors bg-[#181a20] active:scale-90"
          >
            &rsaquo;
          </button>
        </div>

        {/* Teilnehmer Kachel */}
        <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-xl px-3 sm:px-5 h-12 shadow-lg flex items-center gap-2 sm:gap-3 min-w-0">
          <UsersIcon className="text-[#8b92a5] sm:hidden" />
          <span className="text-[8px] sm:text-[10px] font-bold text-[#8b92a5] tracking-widest leading-none uppercase hidden sm:inline">Teilnehmer</span>
          <span className="text-sm sm:text-base font-bold text-gray-200 leading-none">{participants}</span>
        </div>
      </div>
    </div>
  );
};

export const parsePoints = (str) => {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  return parseInt(str.replace(/\./g, '')) || 0;
};

export const UserRow = ({ item, color, isSaisonView, displayRank, prevRank, routeBase = '', isTourTarget = false }) => {
  const rankChange = prevRank ? prevRank - displayRank : 0;
  const statusColors = {
    green: '#22c55e',
    red: '#ef4444',
    yellow: '#eab308'
  };

  const pointsToShow = isSaisonView ? item.points : (item.pointsMatchday || '0');

  return (
    <Link to={`${routeBase}/user/${item.id}`} className="block transition-transform active:scale-95" data-tour={isTourTarget ? 'user-row' : undefined}>
      <div className={`flex items-center p-3 mb-2.5 bg-[#1a1d24] border ${isSaisonView && item.status ? 'border-[#3a3f4a]' : 'border-[#2a2e37]'} rounded-[14px] shadow-sm relative group hover:border-[#ff5c3e]/50 hover:bg-[#1e222a] transition-all cursor-pointer`}>
        {isSaisonView && item.status && (
          <div className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-md" style={{ backgroundColor: statusColors[item.status] }}></div>
        )}
        <div className="w-8 flex justify-center items-center text-xs font-bold text-[#8b92a5]">
          {item.isTrophy && isSaisonView ? <TrophyIcon type={item.trophyColor} /> : displayRank}
        </div>
        <div className="w-10 h-10 rounded-full bg-[#20242d] ml-2 flex items-center justify-center overflow-hidden border border-[#2a2e37]">
          <AvatarIcon name={item.name} />
        </div>
        <div className="ml-3 flex-1 flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <div className="text-[14px] font-bold tracking-wide text-gray-100">{item.name}</div>
            {rankChange !== 0 && isSaisonView && (
              <div className={`flex items-center text-[10px] font-black ${rankChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {rankChange > 0 ? '▲' : '▼'} {Math.abs(rankChange)}
              </div>
            )}
          </div>
          <div className="text-[10px] font-bold text-[#8b92a5] tracking-wider mt-0.5 opacity-70">
            Budget: {item.estimatedBudget}
          </div>
        </div>
        <div className="text-right mr-2">
          <div className="text-[17px] font-bold" style={{ color: color }}>
            {pointsToShow}
          </div>
          <div className="text-[10px] font-bold text-[#626978] tracking-widest mt-0.5 uppercase">Punkte</div>
        </div>
      </div>
    </Link>
  );
};

export const LeagueColumn = ({ league, isSaisonView, rankOffset, prevRanks, routeBase = '', isFirstColumn = false }) => {
  return (
    <div className="flex-1 w-full lg:w-1/3 min-w-0 px-0 sm:px-2.5">
      <div className="flex items-center mb-4 mt-4 lg:mt-0">
        <div className="w-1 h-5 mr-3 rounded-full" style={{ backgroundColor: league.color }}></div>
        <h2 className="text-base sm:text-lg font-black tracking-wider uppercase text-gray-200">{league.name}</h2>
      </div>
      <div className="flex flex-col">
        {league.users.map((u, index) => (
          <UserRow
            key={u.id}
            item={u}
            color={league.color}
            isSaisonView={isSaisonView}
            displayRank={rankOffset + index + 1}
            prevRank={prevRanks?.[u.id]}
            routeBase={routeBase}
            isTourTarget={isFirstColumn && index === 0}
          />
        ))}
      </div>
    </div>
  );
};

// mode 'archive' = altes Qualigruppen-Verhalten: alle Ligen zusammen global sortieren
//                  und dann wieder in 3 Blöcke á 9 aufteilen (so wie es zur Quali lief).
// mode 'live'     = neues Ligasystem: jede Liga läuft komplett unabhängig, eigenes Ranking.
const Dashboard = ({ data, currentView, onNext, onPrev, prevRanks, mode = 'live', routeBase = '' }) => {
  const isSaisonView = currentView === 'saison';

  const sortByView = (a, b) => {
    const valA = isSaisonView ? parsePoints(a.points) : parsePoints(a.pointsMatchday);
    const valB = isSaisonView ? parsePoints(b.points) : parsePoints(b.pointsMatchday);
    return valB - valA;
  };

  let processedLeagues;

  if (mode === 'archive') {
    // Legacy-Verhalten der Qualifikationsrunde: global vergleichen, dann in 3x9 Blöcke aufteilen
    const allUsers = data.leagues.reduce((acc, l) => [...acc, ...l.users], []);
    const sortedAll = [...allUsers].sort(sortByView);

    processedLeagues = data.leagues.map((originalLeague, idx) => {
      const start = idx * 9;
      const end = idx === 2 ? sortedAll.length : (idx + 1) * 9;
      return {
        ...originalLeague,
        users: sortedAll.slice(start, end)
      };
    });
  } else {
    // Neues Ligasystem: jede Liga für sich, kein Vergleich über Ligen hinweg
    processedLeagues = data.leagues.map((originalLeague) => ({
      ...originalLeague,
      users: [...originalLeague.users].sort(sortByView)
    }));
  }

  return (
    <div className="max-w-[1400px] mx-auto bg-[#0f1115]">
      <Header
        participants={data.participants}
        currentView={currentView}
        onNext={onNext}
        onPrev={onPrev}
        mode={mode}
      />
      <div className="flex flex-col lg:flex-row gap-4">
        {processedLeagues.map((league, idx) => (
          <LeagueColumn
            key={league.name}
            league={league}
            isSaisonView={isSaisonView}
            rankOffset={mode === 'archive' ? idx * 9 : 0}
            prevRanks={prevRanks}
            routeBase={routeBase}
            isFirstColumn={idx === 0}
          />
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
