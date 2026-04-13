const Header = ({ matchday, participants, availableMatchdays, selectedMatchday, onSelectMatchday, viewMode, setViewMode }) => (
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
    
    <div className="flex w-full sm:w-auto flex-wrap justify-between sm:justify-end items-center gap-3 sm:gap-4">
      {/* Ansicht-Toggle */}
      <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-xl flex items-center shadow-lg font-semibold overflow-hidden h-12">
        <button 
          onClick={() => setViewMode('saison')}
          className={`px-4 h-full text-[10px] uppercase tracking-widest transition-all ${viewMode === 'saison' ? 'bg-[#ff5c3e] text-white' : 'text-[#8b92a5] hover:text-white'}`}
        >
          Saison
        </button>
        <button 
          onClick={() => setViewMode('spieltag')}
          className={`px-4 h-full text-[10px] uppercase tracking-widest transition-all ${viewMode === 'spieltag' ? 'bg-[#ff5c3e] text-white' : 'text-[#8b92a5] hover:text-white'}`}
        >
          Spieltag
        </button>
      </div>

      {/* Spieltag-Wechsler (Dropdown) */}
      <div className="relative group min-w-[140px]">
        <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-xl flex items-center shadow-lg font-semibold overflow-hidden h-12 px-4 cursor-pointer hover:border-[#ff5c3e] transition-all justify-between">
          <span className="text-[11px] sm:text-sm text-gray-200">Spieltag {selectedMatchday || matchday}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-[#8b92a5] ml-2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        
        <div className="absolute top-full right-0 mt-2 bg-[#1a1d24] border border-[#2a2e37] rounded-xl shadow-2xl overflow-hidden z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all min-w-full">
          <button 
            onClick={() => onSelectMatchday(null)}
            className={`w-full px-4 py-3 text-left text-xs hover:bg-[#181a20] transition-colors border-b border-[#2a2e37] ${!selectedMatchday ? 'text-[#ff5c3e]' : 'text-gray-300'}`}
          >
            Aktuell ({matchday})
          </button>
          {availableMatchdays.map(m => (
            <button 
              key={m}
              onClick={() => onSelectMatchday(m)}
              className={`w-full px-4 py-3 text-left text-xs hover:bg-[#181a20] transition-colors ${selectedMatchday === m ? 'text-[#ff5c3e]' : 'text-gray-300'}`}
            >
              Spieltag {m}
            </button>
          ))}
        </div>
      </div>

      {/* Regeln Button */}
      <NavLink 
        to="/rules" 
        className="bg-[#1a1d24] border border-[#2a2e37] rounded-xl w-12 h-12 flex justify-center items-center text-[#8b92a5] hover:text-white hover:border-[#ff5c3e] transition-all shadow-lg group"
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

const UserRow = ({ item, color, viewMode }) => {
  const statusColors = {
    green: '#22c55e',
    red: '#ef4444',
    yellow: '#eab308'
  };

  const pointsToShow = viewMode === 'spieltag' ? (item.pointsMatchday || '0') : item.points;

  return (
    <div className={`flex items-center p-3 mb-2.5 bg-[#1a1d24] border ${item.status ? 'border-[#3a3f4a]' : 'border-[#2a2e37]'} rounded-[14px] shadow-sm relative group hover:border-[#3a3f4a] transition-all`}>
      {item.status && (
        <div className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-md" style={{ backgroundColor: statusColors[item.status] }}></div>
      )}
      <div className="w-8 flex justify-center items-center text-xs font-bold text-[#8b92a5]">
        {item.isTrophy ? <TrophyIcon type={item.trophyColor} /> : item.rank}
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

const LeagueColumn = ({ league, viewMode }) => (
  <div className="flex-1 w-full lg:w-1/3 min-w-0 px-0 sm:px-2.5">
    <div className="flex items-center mb-4 mt-8 lg:mt-0">
      <div className="w-1 h-5 mr-3 rounded-full" style={{ backgroundColor: league.color }}></div>
      <h2 className="text-base sm:text-lg font-black tracking-wider uppercase text-gray-200">{league.name}</h2>
    </div>
    <div className="flex flex-col">
      {league.users.map((u) => <UserRow key={u.id} item={u} color={league.color} viewMode={viewMode} />)}
    </div>
  </div>
);

const Dashboard = ({ data, availableMatchdays, selectedMatchday, onSelectMatchday, viewMode, setViewMode }) => (
  <div className="max-w-[1400px] mx-auto bg-[#0f1115]">
    <Header 
      matchday={data.matchday} 
      participants={data.participants} 
      availableMatchdays={availableMatchdays}
      selectedMatchday={selectedMatchday}
      onSelectMatchday={onSelectMatchday}
      viewMode={viewMode}
      setViewMode={setViewMode}
    />
    <div className="flex flex-col lg:flex-row gap-4">
      {data.leagues.map((league) => (
        <LeagueColumn key={league.name} league={league} viewMode={viewMode} />
      ))}
    </div>
  </div>
);

function App() {
  const [data, setData] = useState(null);
  const [historyIndex, setHistoryIndex] = useState({ matchdays: [] });
  const [selectedMatchday, setSelectedMatchday] = useState(null);
  const [viewMode, setViewMode] = useState('saison'); // 'saison' | 'spieltag'
  
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
      .then(setHistoryIndex)
      .catch(() => console.log("Keine Historie vorhanden."));

    // 2. Lade Initial-Daten (data.json)
    fetch('/data.json')
      .then(res => res.json())
      .then(setData)
      .catch(err => {
        console.error("Fehler beim Laden der Daten:", err);
      });
  }, []);

  // Effekt zum Laden historischer Daten
  useEffect(() => {
    if (selectedMatchday === null) {
      fetch('/data.json').then(res => res.json()).then(setData);
    } else {
      fetch(`/history/spieltag-${selectedMatchday}.json`)
        .then(res => res.json())
        .then(setData)
        .catch(err => console.error("Fehler beim Laden des Spieltags:", err));
    }
  }, [selectedMatchday]);

  const formatTimestamp = (ts) => {
    if (!ts) return "Unbekannt";
    const date = new Date(ts);
    return date.toLocaleString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
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
                availableMatchdays={historyIndex.matchdays}
                selectedMatchday={selectedMatchday}
                onSelectMatchday={setSelectedMatchday}
                viewMode={viewMode}
                setViewMode={setViewMode}
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
