import React, { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Dashboard from './Dashboard';
import UserDetail from './UserDetail';
import CompareView from './CompareView';
import OptimalTeam from './OptimalTeam';

// SeasonView kapselt eine komplette "Saison-Ansicht" (Dashboard + User-Detail + Vergleich)
// und kann sowohl auf die LIVE-Daten (dataBase="") als auch auf ARCHIVIERTE Daten
// (dataBase="/archive/...") zeigen. routeBase sorgt dafür, dass interne Links
// (z.B. /user/:id) im richtigen Teilbaum bleiben ("" für live, "/archiv" fürs Archiv).
const SeasonView = ({ dataBase = '', routeBase = '', mode = 'live' }) => {
  const [data, setData] = useState(null);
  const [latestMatchday, setLatestMatchday] = useState(null);
  const [historyIndex, setHistoryIndex] = useState({ matchdays: [] });
  const [prevRanks, setPrevRanks] = useState({});

  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [availableViews, setAvailableViews] = useState(['saison']);

  const [isOptimalTeamOpen, setIsOptimalTeamOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${dataBase}/history/index.json`).then(res => res.json()).catch(() => ({ matchdays: [] })),
      fetch(`${dataBase}/data.json`).then(res => res.json())
    ])
      .then(([index, latestData]) => {
        setHistoryIndex(index);
        const mDay = Number(latestData.matchday);
        setData(latestData);
        setLatestMatchday(mDay);

        const historyDays = (index.matchdays || []).map(Number);
        const views = [
          ...historyDays.filter(m => m !== mDay).sort((a, b) => a - b),
          mDay,
          'saison'
        ];
        const uniqueViews = [...new Set(views)];
        setAvailableViews(uniqueViews);
        setCurrentViewIndex(uniqueViews.length - 1);

        const mDays = [...uniqueViews.filter(v => typeof v === 'number')].sort((a, b) => b - a);
        const prevMDay = mDays.length > 1 ? mDays[1] : (mDays.length === 1 && mDays[0] !== mDay ? mDays[0] : null);

        if (prevMDay) {
          fetch(`${dataBase}/history/spieltag-${prevMDay}.json`)
            .then(res => res.json())
            .then(prevData => {
              const rankMap = {};
              prevData.leagues.forEach(l => {
                l.users.forEach(u => {
                  rankMap[u.id] = u.rank;
                });
              });
              setPrevRanks(rankMap);
            })
            .catch(err => console.error("Error loading prev ranks:", err));
        }
      })
      .catch(err => console.error("Initial load error:", err));
  }, [dataBase]);

  useEffect(() => {
    if (availableViews.length === 0) return;

    const view = availableViews[currentViewIndex];

    if (view === 'saison') {
      fetch(`${dataBase}/data.json?t=${Date.now()}`)
        .then(res => res.json())
        .then(d => setData(d));
    } else if (typeof view === 'number') {
      const path = `${dataBase}/history/spieltag-${view}.json?t=${Date.now()}`;

      fetch(path)
        .then(res => {
          if (!res.ok) throw new Error(`History file not found: ${view}`);
          return res.json();
        })
        .then(d => setData(d))
        .catch(err => {
          console.error("Matchday fetch error:", err);
          fetch(`${dataBase}/data.json?t=${Date.now()}`)
            .then(res => res.json())
            .then(d => setData(d));
        });
    }
  }, [currentViewIndex, availableViews, latestMatchday, dataBase]);

  const navigate = (dir) => {
    setCurrentViewIndex(prev => {
      let next = prev + dir;
      if (next < 0) next = availableViews.length - 1;
      if (next >= availableViews.length) next = 0;
      return next;
    });
  };

  if (!data) return <div className="min-h-screen bg-[#0f1115]"></div>;

  return (
    <div className="min-h-screen bg-[#0f1115] p-4 sm:p-10 font-sans select-none flex flex-col">
      <div className="flex-1">
        <Routes>
          <Route index element={
            <Dashboard
              data={data}
              currentView={availableViews[currentViewIndex]}
              onNext={() => navigate(1)}
              onPrev={() => navigate(-1)}
              prevRanks={prevRanks}
              mode={mode}
              routeBase={routeBase}
            />
          } />
          <Route path="user/:id" element={<UserDetail dataBase={dataBase} routeBase={routeBase} mode={mode} />} />
          <Route path="compare/:id1/:id2" element={<CompareView dataBase={dataBase} routeBase={routeBase} />} />
        </Routes>
      </div>

      <footer className="mt-20 pt-2 pb-4 flex items-center justify-center">
        <button
          onClick={() => setIsOptimalTeamOpen(true)}
          className="flex items-center justify-center gap-2 whitespace-nowrap bg-[#1a1d24] text-[#ff5c3e] border border-[#ff5c3e]/30 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest hover:bg-[#ff5c3e] hover:text-white transition-all shadow-[0_0_15px_rgba(255,92,62,0.1)] hover:shadow-[0_0_25px_rgba(255,92,62,0.3)] active:scale-95 group"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 group-hover:fill-white group-hover:scale-110 transition-transform"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          Die optimale Elf
        </button>
      </footer>

      {mode === 'archive' && (
        <div className="pb-6 flex justify-center">
          <Link to="/" className="text-[10px] uppercase tracking-widest font-bold text-[#555] hover:text-[#ff5c3e] transition-colors">
            Zurück zum Ligasystem
          </Link>
        </div>
      )}

      <OptimalTeam
        isOpen={isOptimalTeamOpen}
        onClose={() => setIsOptimalTeamOpen(false)}
        availableMatchdays={availableViews}
        currentGlobalMatchday={latestMatchday}
        dataBase={dataBase}
      />
    </div>
  );
};

export default SeasonView;
