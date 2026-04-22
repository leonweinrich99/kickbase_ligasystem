import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Rules from './Rules';
import logo from './assets/logo.png';

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

const Header = ({ 
  matchday, 
  participants, 
  currentView, 
  onNext, 
  onPrev 
}) => {
  const displayLabel = currentView === 'saison' ? 'Gesamt' : `Spieltag ${currentView}`;

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b border-[#2a2e37] pb-6 gap-6">
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center p-0.5 sm:p-1 overflow-hidden">
          <img src={logo} alt="Kickbase Liga Logo" className="w-full h-full object-contain" />
        </div>
        <div>
          <div className="text-[9px] sm:text-[11px] font-bold tracking-wider text-[#ff5c3e] mb-1">SAISON 26/27</div>
          <h1 className="text-xl sm:text-3xl font-black tracking-tight uppercase">Qualifikationsrunde</h1>
        </div>
      </div>
      
      <div className="flex w-full sm:w-auto justify-between sm:justify-end items-center gap-2 sm:gap-4">
        {/* Spieltag-Wechsler (Pfeil-Design) */}
        <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-xl flex items-center shadow-lg font-semibold overflow-hidden flex-1 sm:flex-initial justify-between h-12">
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
          <span className="text-[8px] sm:text-[10px] font-bold text-[#8b92a5] tracking-widest leading-none uppercase hidden sm:inline">Teilnehmer</span>
          <span className="text-sm sm:text-base font-bold text-gray-200 leading-none">{participants}</span>
        </div>

        {/* Regeln Button */}
        <NavLink 
          to="/rules" 
          className="bg-[#1a1d24] border border-[#2a2e37] rounded-xl w-12 h-12 flex-shrink-0 flex justify-center items-center text-[#8b92a5] hover:text-white hover:border-[#ff5c3e] transition-all shadow-lg group"
          title="Regelwerk ansehen"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
        </NavLink>
      </div>
    </div>
  );
};

const parsePoints = (str) => {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  return parseInt(str.replace(/\./g, '')) || 0;
};

const UserRow = ({ item, color, isSaisonView, displayRank }) => {
  const statusColors = {
    green: '#22c55e',
    red: '#ef4444',
    yellow: '#eab308'
  };

  const pointsToShow = isSaisonView ? item.points : (item.pointsMatchday || '0');

  return (
    <div className={`flex items-center p-3 mb-2.5 bg-[#1a1d24] border ${isSaisonView && item.status ? 'border-[#3a3f4a]' : 'border-[#2a2e37]'} rounded-[14px] shadow-sm relative group hover:border-[#3a3f4a] transition-all`}>
      {isSaisonView && item.status && (
        <div className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-md" style={{ backgroundColor: statusColors[item.status] }}></div>
      )}
      <div className="w-8 flex justify-center items-center text-xs font-bold text-[#8b92a5]">
        {item.isTrophy && isSaisonView ? <TrophyIcon type={item.trophyColor} /> : displayRank}
      </div>
      <div className="w-10 h-10 rounded-full bg-[#20242d] ml-2 flex items-center justify-center">
        <AvatarIcon />
      </div>
      <div className="ml-3 flex-1 flex flex-col justify-center">
        <div className="text-[14px] font-bold tracking-wide text-gray-100">{item.name}</div>
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
  );
};

const LeagueColumn = ({ league, isSaisonView, rankOffset }) => {
  return (
    <div className="flex-1 w-full lg:w-1/3 min-w-0 px-0 sm:px-2.5">
      <div className="flex items-center mb-4 mt-8 lg:mt-0">
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
          />
        ))}
      </div>
    </div>
  );
};

const Dashboard = ({ data, currentView, onNext, onPrev }) => {
  const isSaisonView = currentView === 'saison';
  
  // 1. Alle User global sammeln
  const allUsers = data.leagues.reduce((acc, l) => [...acc, ...l.users], []);
  
  // 2. Global sortieren
  const sortedAll = [...allUsers].sort((a, b) => {
    const valA = isSaisonView ? parsePoints(a.points) : parsePoints(a.pointsMatchday);
    const valB = isSaisonView ? parsePoints(b.points) : parsePoints(b.pointsMatchday);
    return valB - valA;
  });

  // 3. In Blöcke aufteilen (9 pro Liga)
  const processedLeagues = data.leagues.map((originalLeague, idx) => {
    const start = idx * 9;
    const end = idx === 2 ? sortedAll.length : (idx + 1) * 9;
    return {
      ...originalLeague,
      users: sortedAll.slice(start, end)
    };
  });

  return (
    <div className="max-w-[1400px] mx-auto bg-[#0f1115]">
      <Header 
        matchday={data.matchday} 
        participants={data.participants} 
        currentView={currentView}
        onNext={onNext}
        onPrev={onPrev}
      />
      <div className="flex flex-col lg:flex-row gap-4">
        {processedLeagues.map((league, idx) => (
          <LeagueColumn 
            key={league.name} 
            league={league} 
            isSaisonView={isSaisonView} 
            rankOffset={idx * 9}
          />
        ))}
      </div>
    </div>
  );
};

function App() {
  const [data, setData] = useState(null);
  const [latestMatchday, setLatestMatchday] = useState(null);
  const [historyIndex, setHistoryIndex] = useState({ matchdays: [] });
  
  // View-Manager
  const [currentViewIndex, setCurrentViewIndex] = useState(0); 
  const [availableViews, setAvailableViews] = useState(['saison']);

  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);

  const handleManualUpdate = async () => {
    const password = window.prompt("Bitte Admin-Passwort eingeben:");
    if (!password) return;

    setIsUpdating(true);
    setUpdateStatus("Update wird gestartet...");

    try {
      const res = await fetch(`/api/cron?secret=${encodeURIComponent(password)}`);
      if (res.ok) {
        setUpdateStatus("✅ Update erfolgreich angestoßen! Der Workflow läuft.");
        setTimeout(() => setUpdateStatus(null), 5000);
      } else {
        const errData = await res.json();
        setUpdateStatus(`❌ Fehler: ${errData.error || "Unbefugt"}`);
        setTimeout(() => setUpdateStatus(null), 5000);
      }
    } catch (err) {
      setUpdateStatus("❌ Netzwerkfehler beim Update-Aufruf.");
      setTimeout(() => setUpdateStatus(null), 5000);
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    // 1. Lade Index der Spieltage
    fetch('/history/index.json')
      .then(res => res.json())
      .catch(() => ({ matchdays: [] }))
      .then(index => {
        setHistoryIndex(index);
        console.log("Loaded History Index:", index);
        
        // 2. Lade Initial-Daten (data.json)
        return fetch('/data.json').then(res => res.json().then(latestData => ({ index, latestData })));
      })
      .then(({ index, latestData }) => {
        const mDay = Number(latestData.matchday);
        console.log("Loaded Latest Data:", mDay);
        setData(latestData);
        setLatestMatchday(mDay);

        // 3. Views berechnen: [28, 29, 'saison']
        const historyDays = (index.matchdays || []).map(Number);
        const views = [
            ...historyDays.filter(m => m !== mDay).sort((a,b) => a - b),
            mDay,
            'saison'
        ];
        // Einzigartig machen
        const uniqueViews = [...new Set(views)];
        console.log("Available Views:", uniqueViews);
        setAvailableViews(uniqueViews);
        
        // Start bei Saison (letztes Item)
        setCurrentViewIndex(uniqueViews.length - 1);
      })
      .catch(err => console.error("Initial load error:", err));
  }, []);

  // Effekt zum Laden historischer Daten bei Ansichts-Wechel
  useEffect(() => {
    if (availableViews.length === 0) return;
    
    const view = availableViews[currentViewIndex];
    console.log("Switching to View:", view);

    if (view === 'saison') {
      fetch(`/data.json?t=${Date.now()}`)
        .then(res => res.json())
        .then(d => {
            console.log("Data loaded for Saison (live)");
            setData(d);
        });
    } else if (typeof view === 'number') {
      const path = `/history/spieltag-${view}.json?t=${Date.now()}`;
      console.log(`Fetching historical matchday data from ${path}`);
      
      fetch(path)
        .then(res => {
            if (!res.ok) throw new Error(`History file not found: ${view}`);
            return res.json();
        })
        .then(d => {
            console.log(`Data loaded for Matchday ${view} (snapshot)`);
            setData(d);
        })
        .catch(err => {
            console.error("Matchday fetch error:", err);
            // Fallback: Wenn Snapshot fehlt, versuchen wir doch die live daten
            fetch(`/data.json?t=${Date.now()}`)
              .then(res => res.json())
              .then(d => setData(d));
        });
    }
  }, [currentViewIndex, availableViews, latestMatchday]);

  const navigate = (dir) => {
    setCurrentViewIndex(prev => {
      let next = prev + dir;
      if (next < 0) next = availableViews.length - 1;
      if (next >= availableViews.length) next = 0;
      return next;
    });
  };

  const formatTimestamp = (ts) => {
    if (!ts) return "Unbekannt";
    const date = new Date(ts);
    return date.toLocaleString('de-DE', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    }) + " Uhr";
  };

  if (!data) return <div className="min-h-screen bg-[#0f1115] flex justify-center items-center text-gray-500 font-bold tracking-widest uppercase text-xs animate-pulse">Lade Kickbase System...</div>;

  return (
    <Router>
      <div className="min-h-screen bg-[#0f1115] p-4 sm:p-10 font-sans select-none flex flex-col">
        <div className="flex-1">
          <Routes>
            <Route path="/" element={
              <Dashboard 
                data={data} 
                currentView={availableViews[currentViewIndex]}
                onNext={() => navigate(1)}
                onPrev={() => navigate(-1)}
              />
            } />
            <Route path="/rules" element={<Rules />} />
          </Routes>
        </div>
        
        <footer className="mt-20 border-t border-[#2a2e37] pt-8 pb-10 flex flex-col sm:flex-row justify-between items-center gap-6 opacity-60">
            <div className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#8b92a5]">Status: Live</span>
                <span className="text-[#2a2e37]">|</span>
                <span className="text-[10px] sm:text-xs text-[#626978] font-medium uppercase font-mono">
                    Updated: {formatTimestamp(data.timestamp)}
                </span>
            </div>
            
            <div className="flex items-center gap-6 text-[9px] sm:text-[10px] uppercase font-bold tracking-widest text-[#555]">
                {updateStatus ? (
                  <span className="text-[#ff5c3e] transition-all animate-pulse">{updateStatus}</span>
                ) : (
                  <>
                    <button 
                      onClick={handleManualUpdate}
                      disabled={isUpdating}
                      className="hover:text-[#ff5c3e] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUpdating ? 'Läuft...' : 'Update'}
                    </button>
                    <span className="hidden sm:inline opacity-30">•</span>
                    <span>© 2024 Kickbase Liga System</span>
                    <span className="hidden sm:inline opacity-30">•</span>
                    <span>Push via GitHub Actions</span>
                  </>
                )}
            </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
