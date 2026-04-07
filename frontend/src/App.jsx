import React, { useEffect, useState } from 'react';

const AvatarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#8b92a5] opacity-50">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
    <path d="M4 20C4 16.6863 6.68629 14 10 14H14C17.3137 14 20 16.6863 20 20" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const TrophyIcon = ({ type }) => {
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

const Header = ({ matchday, participants }) => (
  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b border-[#2a2e37] pb-6 gap-6">
    <div className="flex items-center gap-4 sm:gap-6">
      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[#1a1d24] border border-[#2a2e37] rounded-lg flex relative p-1.5 sm:p-2 shadow-inner">
        <div className="w-full flex flex-col justify-end items-center gap-0.5">
          <div className="w-3 sm:w-4 h-1.5 sm:h-2 bg-[#ff5c3e] rounded-sm transform origin-bottom-left rotate-y-3 skew-y-6"></div>
          <div className="w-5 sm:w-6 h-1.5 sm:h-2 bg-[#4ba6ff] rounded-sm transform origin-bottom-left rotate-y-3 skew-y-6"></div>
          <div className="w-7 sm:w-8 h-1.5 sm:h-2 bg-[#22c55e] rounded-sm transform origin-bottom-left rotate-y-3 skew-y-6"></div>
          <div className="w-9 sm:w-10 h-1.5 sm:h-2 bg-[#10b981] rounded-sm transform origin-bottom-left rotate-y-3 skew-y-6"></div>
        </div>
      </div>
      <div>
        <div className="text-[9px] sm:text-[11px] font-bold tracking-wider text-[#ff5c3e] mb-1">SAISON 26/27</div>
        <h1 className="text-xl sm:text-3xl font-black tracking-tight uppercase">Qualifikationsrunde</h1>
      </div>
    </div>
    <div className="flex w-full sm:w-auto justify-between sm:justify-end gap-3 sm:gap-4">
      <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-xl flex items-center shadow-lg font-semibold overflow-hidden flex-1 sm:flex-initial justify-between">
        <button className="px-3 sm:px-4 py-2 sm:py-3 text-[#8b92a5] hover:text-white transition-colors bg-[#181a20]">&lsaquo;</button>
        <span className="px-4 sm:px-8 text-[11px] sm:text-sm text-gray-200 whitespace-nowrap">Spieltag {matchday}</span>
        <button className="px-3 sm:px-4 py-2 sm:py-3 text-[#8b92a5] hover:text-white transition-colors bg-[#181a20]">&rsaquo;</button>
      </div>
      <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-xl px-4 sm:px-5 py-2 shadow-lg flex flex-col justify-center items-end min-w-[80px] sm:min-w-0">
        <span className="text-[8px] sm:text-[10px] font-bold text-[#8b92a5] tracking-widest leading-tight">TEILNEHMER</span>
        <span className="text-sm sm:text-base font-bold text-gray-200 leading-tight block -mt-1">{participants}</span>
      </div>
      <div className="hidden sm:flex bg-[#1a1d24] border border-[#2a2e37] rounded-xl w-14 justify-center items-center text-[#8b92a5]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
      </div>
    </div>
  </div>
);

const UserRow = ({ item, color }) => {
  return (
    <div className={`flex items-center p-3 mb-2.5 bg-[#1a1d24] border ${item.highlight ? 'border-[#3a3f4a]' : 'border-[#2a2e37]'} rounded-[14px] shadow-sm relative`}>
      {item.highlight && (
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md bg-${item.highlight === 'green' ? '[#22c55e]' : item.highlight === 'blue' ? '[#4ba6ff]' : item.highlight === 'orange' ? '[#ff5c3e]' : '[#ef4444]'}`}></div>
      )}
      <div className="w-8 flex justify-center items-center text-xs font-bold text-[#8b92a5]">
        {item.isTrophy ? <TrophyIcon type={item.trophyColor} /> : item.rank}
      </div>
      <div className="w-10 h-10 rounded-full bg-[#20242d] ml-2 flex items-center justify-center">
        <AvatarIcon />
      </div>
      <div className="ml-3 flex-1">
        <div className="text-[14px] font-bold tracking-wide text-gray-100">{item.name}</div>
        <div className="text-[10px] font-bold text-[#626978] tracking-widest mt-0.5">MANAGER</div>
      </div>
      <div className="text-right mr-2">
        <div className="text-[17px] font-bold" style={{ color: color }}>
          {item.points}
        </div>
        <div className="text-[10px] font-bold text-[#626978] tracking-widest mt-0.5 uppercase">Punkte</div>
      </div>
    </div>
  );
};

const LeagueColumn = ({ league }) => (
  <div className="flex-1 w-full lg:w-1/3 min-w-0 px-0 sm:px-2.5">
    <div className="flex items-center mb-4 mt-8 lg:mt-0">
      <div className="w-1 h-5 mr-3 rounded-full" style={{ backgroundColor: league.color }}></div>
      <h2 className="text-base sm:text-lg font-black tracking-wider uppercase text-gray-200">{league.name}</h2>
    </div>
    <div className="flex flex-col">
      {league.users.map((u) => <UserRow key={u.id} item={u} color={league.color} />)}
    </div>
  </div>
);

function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // In Produktion und lokal nutzen wir die statische Datei im public-Ordner
    fetch('/data.json')
      .then(res => res.json())
      .then(setData)
      .catch(err => {
        console.error("Fehler beim Laden der Daten:", err);
      });
  }, []);

  if (!data) return <div className="min-h-screen bg-[#0f1115] flex justify-center items-center text-gray-500 font-bold">Lade Kickbase Daten...</div>;

  return (
    <div className="min-h-screen bg-[#0f1115] p-4 sm:p-10 font-sans select-none">
      <div className="max-w-[1400px] mx-auto bg-[#0f1115]">
        <Header matchday={data.matchday} participants={data.participants} />
        <div className="flex flex-col lg:flex-row gap-4">
          {data.leagues.map((league) => (
            <LeagueColumn key={league.name} league={league} />
          ))}
        </div>
      </div>
      <div className="mt-20 text-center text-[#555] text-[10px] sm:text-xs">
        *The data above is retrieved automatically via GitHub Actions.
      </div>
    </div>
  );
}

export default App;
