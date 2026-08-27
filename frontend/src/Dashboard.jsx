import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Star, Trophy, Info, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import logo from './assets/logo.png';
import PageHeader from './ui/PageHeader';
import CloseButton from './ui/CloseButton';

export const AvatarIcon = ({ name }) => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#1f1f1f] text-[#ff5c3e] font-black text-xs uppercase">
      {name?.charAt(0) || '?'}
    </div>
  );
};

export const TrophyIcon = ({ type }) => {
  const colors = { gold: '#eab308', silver: '#94a3b8', bronze: '#ca8a04' };
  return <Trophy size={18} color={colors[type]} strokeWidth={2.5} />;
};

export const UsersIcon = ({ className }) => (
  <Users size={18} strokeWidth={2.5} className={className} />
);

export const Header = ({
  participants,
  currentView,
  onNext,
  onPrev,
  mode = 'live',
  onOpenOptimalTeam,
  onOpenTrueTableInfo
}) => {
  const isTrueTable = currentView === 'wahre-tabelle';
  const displayLabel = isTrueTable ? 'Wahre Tabelle' : (currentView === 'saison' ? 'Gesamt' : `Spieltag ${currentView}`);

  return (
    <div className="flex flex-col mb-4 sm:mb-8 border-b border-[#2e2e2e] pb-4 sm:pb-6 gap-4">

      {/* Top Row: Logo, Title, and Optimale-Elf-Badge */}
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
                <div className="text-[8px] sm:text-[9px] font-black tracking-widest text-[#8b92a5] bg-[#1f1f1f] border border-[#2e2e2e] rounded-full px-2 py-0.5 uppercase">Archiv</div>
              )}
            </div>
            <h1 className="text-[17px] sm:text-3xl font-black tracking-tight uppercase leading-[1.1] break-words">
              {mode === 'archive' ? <>Qualifikations<br />gruppe</> : 'Ligasystem'}
            </h1>
          </div>
        </div>

        {/* Right: Optimale-Elf-Badge (oben, wie die Pokal-Kachel) */}
        <button
          onClick={onOpenOptimalTeam}
          data-tour="optimal-team-button"
          className="shrink-0 flex items-center gap-1.5 bg-[#171717] border border-[#ff5c3e]/40 hover:border-[#ff5c3e] transition-colors rounded-full pl-2.5 pr-3 py-1.5 shadow-lg active:scale-95 group mt-1"
        >
          <Star size={12} fill="#ff5c3e" stroke="#ff5c3e" strokeWidth={1} className="shrink-0" />
          <span className="text-[10px] font-bold text-gray-300 group-hover:text-white transition-colors whitespace-nowrap">
            Top Elf
          </span>
        </button>
      </div>

      {/* Bottom Row: Controls */}
      <div className="flex w-full sm:w-auto justify-between sm:justify-end items-center gap-2 sm:gap-4">
        {/* Spieltag-Wechsler (Pfeil-Design) - "Die wahre Tabelle" ist hier einfach
            ein zusätzlicher Klick-Stopp nach "Gesamt", kein eigenes Element. */}
        <div data-tour="matchday-switcher" className="bg-[#171717] border border-[#2e2e2e] rounded-xl flex items-center shadow-lg font-semibold overflow-hidden flex-1 sm:flex-initial justify-between h-12">
          <button
            onClick={onPrev}
            className="px-3 sm:px-5 h-full text-[#8b92a5] hover:text-[#ff5c3e] transition-colors bg-[#141414] active:scale-90"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-2 sm:px-6 text-[11px] sm:text-sm text-gray-200 whitespace-nowrap uppercase tracking-widest text-center flex-1 flex items-center justify-center gap-1.5">
            {displayLabel}
            {isTrueTable && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onOpenTrueTableInfo?.(); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpenTrueTableInfo?.(); } }}
                title="Was bedeutet 'Die wahre Tabelle'?"
                aria-label="Erklärung zur wahren Tabelle"
                className="text-[#ff5c3e] opacity-80 hover:opacity-100 transition-opacity shrink-0"
              >
                <Info size={13} strokeWidth={2.5} />
              </span>
            )}
          </span>
          <button
            onClick={onNext}
            className="px-3 sm:px-5 h-full text-[#8b92a5] hover:text-[#ff5c3e] transition-colors bg-[#141414] active:scale-90"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Teilnehmer Kachel */}
        <div className="bg-[#171717] border border-[#2e2e2e] rounded-xl px-3 sm:px-5 h-12 shadow-lg flex items-center gap-2 sm:gap-3 min-w-0">
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

export const UserRow = ({ item, color, isSaisonView, displayRank, prevRank, routeBase = '', isTourTarget = false, leagueBadge = null }) => {
  const rankChange = prevRank ? prevRank - displayRank : 0;
  const statusColors = {
    green: '#22c55e',
    red: '#ef4444',
    yellow: '#eab308'
  };

  const pointsToShow = isSaisonView ? item.points : (item.pointsMatchday || '0');

  return (
    <Link to={`${routeBase}/user/${item.id}`} className="block transition-transform active:scale-95" data-tour={isTourTarget ? 'user-row' : undefined}>
      <div className={`flex items-center p-3 mb-2.5 bg-[#171717] border ${isSaisonView && item.status ? 'border-[#404040]' : 'border-[#2e2e2e]'} rounded-[14px] shadow-sm relative overflow-hidden group hover:border-[#ff5c3e]/50 hover:bg-[#202020] transition-all cursor-pointer`}>
        {isSaisonView && item.status && (
          <div className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ backgroundColor: statusColors[item.status] }}></div>
        )}
        <div className="w-8 flex justify-center items-center text-xs font-bold text-[#8b92a5]">
          {item.isTrophy && isSaisonView ? <TrophyIcon type={item.trophyColor} /> : displayRank}
        </div>
        <div className="w-10 h-10 rounded-full bg-[#1f1f1f] ml-2 flex items-center justify-center overflow-hidden border border-[#2e2e2e]">
          <AvatarIcon name={item.name} />
        </div>
        <div className="ml-3 flex-1 flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[16px] font-bold tracking-wide text-gray-100 truncate">{item.name}</div>
            {rankChange !== 0 && isSaisonView && (
              <div className={`flex items-center gap-1 text-[10px] font-black shrink-0 ${rankChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {rankChange > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {Math.abs(rankChange)}
              </div>
            )}
          </div>
          {leagueBadge && (
            <span
              className="mt-1 inline-flex items-center self-start text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${leagueBadge.color}26`, color: leagueBadge.color }}
            >
              {leagueBadge.name}
            </span>
          )}
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

const TrueTableInfoModal = ({ onClose }) => (
  <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
    <div
      className="max-w-md w-full bg-[#171717] border border-[#2e2e2e] rounded-3xl p-6 shadow-2xl relative"
      onClick={(e) => e.stopPropagation()}
    >
      <CloseButton onClick={onClose} size="compact" className="absolute top-4 right-4" />

      <div className="w-11 h-11 rounded-xl bg-[#ff5c3e]/10 text-[#ff5c3e] flex items-center justify-center mb-4">
        <Info size={20} strokeWidth={2.5} />
      </div>

      <h2 className="text-lg font-black uppercase text-white mb-3">Die wahre Tabelle</h2>
      <p className="text-sm text-[#8b92a5] leading-relaxed mb-3">
        Hier siehst du alle Teilnehmer:innen aus allen drei Ligen in einer einzigen, nach Punkten sortierten Gesamttabelle.
      </p>
      <p className="text-sm text-[#8b92a5] leading-relaxed mb-3">
        Wichtig dabei: Diese Tabelle ist <span className="text-white font-bold">nicht zu 100 % vergleichbar</span>. Jede der drei Ligen läuft komplett unabhängig - dieselben echten Fußballprofis sind daher in jeder Liga separat und exklusiv verfügbar. Ein Spieler kann also gleichzeitig in bis zu drei verschiedenen Teams (einem pro Liga) stehen und dort jeweils Punkte einbringen, während er innerhalb einer einzelnen Liga natürlich nur ein einziges Team verstärken kann.
      </p>
      <p className="text-sm text-[#8b92a5] leading-relaxed">
        Die wahre Tabelle ist deshalb eher zur Unterhaltung und groben Einordnung gedacht - offiziell zählt weiterhin nur die Platzierung innerhalb der eigenen Liga.
      </p>
    </div>
  </div>
);

// mode 'archive' = altes Qualigruppen-Verhalten: alle Ligen zusammen global sortieren
//                  und dann wieder in 3 Blöcke á 9 aufteilen (so wie es zur Quali lief).
// mode 'live'     = neues Ligasystem: jede Liga läuft komplett unabhängig, eigenes Ranking.
const Dashboard = ({ data, currentView, onNext, onPrev, prevRanks, mode = 'live', routeBase = '', onOpenOptimalTeam }) => {
  const isTrueTable = currentView === 'wahre-tabelle';
  // "Die wahre Tabelle" zeigt immer die zuletzt geladenen Gesamt-Daten - für
  // Punkte-/Sortierzwecke verhält sie sich wie die Saisonansicht.
  const isSaisonView = currentView === 'saison' || isTrueTable;
  const [isInfoOpen, setIsInfoOpen] = useState(false);

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

  // "Die wahre Tabelle": alle Ligen zu einer Gesamtliste zusammenfassen, nur
  // fürs neue, unabhängige Ligasystem relevant (im Archiv war das ohnehin
  // schon die einzige Ansicht).
  const trueTableUsers = isTrueTable
    ? data.leagues
        .reduce((acc, l) => [...acc, ...l.users.map((u) => ({ ...u, leagueColor: l.color, leagueName: l.name }))], [])
        .sort(sortByView)
    : [];

  return (
    <div className="max-w-[1400px] mx-auto bg-[#000000]">
      <Header
        participants={data.participants}
        currentView={currentView}
        onNext={onNext}
        onPrev={onPrev}
        mode={mode}
        onOpenOptimalTeam={onOpenOptimalTeam}
        onOpenTrueTableInfo={() => setIsInfoOpen(true)}
      />

      {isTrueTable ? (
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col">
            {trueTableUsers.map((u, index) => (
              <UserRow
                key={u.id}
                item={u}
                color={u.leagueColor}
                isSaisonView={isSaisonView}
                displayRank={index + 1}
                prevRank={prevRanks?.[u.id]}
                routeBase={routeBase}
                leagueBadge={{ name: u.leagueName, color: u.leagueColor }}
              />
            ))}
          </div>
        </div>
      ) : (
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
      )}

      {isInfoOpen && <TrueTableInfoModal onClose={() => setIsInfoOpen(false)} />}
    </div>
  );
};

export default Dashboard;
