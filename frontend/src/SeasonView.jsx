import React, { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Dashboard from './Dashboard';
import UserDetail from './UserDetail';
import CompareView from './CompareView';
import OptimalTeam from './OptimalTeam';
import LoadingScreen from './LoadingScreen';
import useMinimumDelay from './useMinimumDelay';
import { shouldShowSplash, markSplashShown } from './appLoadState';
import { useTour } from './Tour';

// SeasonView kapselt eine komplette "Saison-Ansicht" (Dashboard + User-Detail + Vergleich)
// und kann sowohl auf die LIVE-Daten (dataBase="") als auch auf ARCHIVIERTE Daten
// (dataBase="/archive/...") zeigen. routeBase sorgt dafür, dass interne Links
// (z.B. /user/:id) im richtigen Teilbaum bleiben ("" für live, "/archiv" fürs Archiv).
const SeasonView = ({ dataBase = '', routeBase = '', mode = 'live' }) => {
  const tour = useTour();
  const [data, setData] = useState(null);
  const [latestMatchday, setLatestMatchday] = useState(null);
  const [historyIndex, setHistoryIndex] = useState({ matchdays: [] });
  const [prevRanks, setPrevRanks] = useState({});

  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [availableViews, setAvailableViews] = useState(['saison']);

  const [isOptimalTeamOpen, setIsOptimalTeamOpen] = useState(false);
  // Die Tour kann das Modal rein deklarativ "erzwingen" (z.B. während des
  // Optimale-Elf-Schritts) - kein simulierter Klick, kein Timing-Risiko.
  const isOptimalTeamForced = Boolean(tour?.step?.forceOptimalTeamOpen);
  const optimalTeamVisible = isOptimalTeamOpen || isOptimalTeamForced;

  const minDelayElapsed = useMinimumDelay(1800);

  // Der animierte Splash-Screen soll nur beim allerersten Öffnen der App
  // erscheinen - bei jedem weiteren Wechsel (z.B. Archiv <-> Liga) reicht
  // eine stille, dunkle Fläche.
  const [showSplash] = useState(() => {
    const should = shouldShowSplash();
    if (should) markSplashShown();
    return should;
  });

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
    if (view === undefined) return; // "Die wahre Tabelle" liegt außerhalb von availableViews - kein eigener Fetch nötig

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

  // "Die wahre Tabelle" ist im neuen, unabhängigen Ligasystem ein zusätzlicher
  // Klick-Stopp direkt im bestehenden Spieltag-Umschalter (nach "Gesamt"),
  // kein eigenes UI-Element. Sie zeigt immer die aktuell geladenen
  // Gesamt-Daten als eine gemeinsame Tabelle über alle Ligen.
  const extendedViews = mode === 'live' ? [...availableViews, 'wahre-tabelle'] : availableViews;

  const navigate = (dir) => {
    setCurrentViewIndex(prev => {
      let next = prev + dir;
      if (next < 0) next = extendedViews.length - 1;
      if (next >= extendedViews.length) next = 0;
      return next;
    });
  };

  if (!data || (showSplash && !minDelayElapsed)) {
    return showSplash ? <LoadingScreen /> : <div className="min-h-screen bg-[#000000]"></div>;
  }

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10 font-sans select-none flex flex-col">
      <div className="flex-1">
        <Routes>
          <Route index element={
            <Dashboard
              data={data}
              currentView={extendedViews[currentViewIndex]}
              onNext={() => navigate(1)}
              onPrev={() => navigate(-1)}
              prevRanks={prevRanks}
              mode={mode}
              routeBase={routeBase}
              onOpenOptimalTeam={() => setIsOptimalTeamOpen(true)}
            />
          } />
          <Route path="user/:id" element={<UserDetail dataBase={dataBase} routeBase={routeBase} mode={mode} />} />
          <Route path="compare/:id1/:id2" element={<CompareView dataBase={dataBase} routeBase={routeBase} />} />
        </Routes>
      </div>

      {mode === 'archive' && (
        <div className="pt-10 pb-6 flex justify-center">
          <Link to="/" className="text-[10px] uppercase tracking-widest font-bold text-[#555] hover:text-[#ff5c3e] transition-colors">
            Zurück zum Ligasystem
          </Link>
        </div>
      )}

      <OptimalTeam
        isOpen={optimalTeamVisible}
        onClose={() => setIsOptimalTeamOpen(false)}
        availableMatchdays={availableViews}
        currentGlobalMatchday={latestMatchday}
        dataBase={dataBase}
      />
    </div>
  );
};

export default SeasonView;
