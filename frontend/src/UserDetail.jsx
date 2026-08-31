import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  ResponsiveContainer, ReferenceArea, Legend, LabelList
} from 'recharts';
import {
  TrendingUp, TrendingDown, Target,
  Users, Search, X, Zap
} from 'lucide-react';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import ManagerAvatar from './ui/ManagerAvatar';
import PlayerPhotoCard from './ui/PlayerPhotoCard';
import PositionRow from './ui/PositionRow';

// Gleiche Positions-Labels/Reihenfolge wie AccountStats.jsx/Advisor.jsx.
const POSITION_LABELS = { TW: 'Torwart', ABW: 'Abwehr', MF: 'Mittelfeld', ST: 'Sturm' };

const calculatePerformanceScore = (points, avg, opt, max) => {
  if (points <= 0) return 1.0;

  // Referenz ist 80% der "Besten Elf"
  const reference = (opt && opt > 0) ? opt : (max || 1);
  const target = reference * 0.8;

  // Rein lineare Skalierung ohne Einbezug des Ligaschnitts
  const score = (points / target) * 10;

  // Rückgabe zwischen 1,0 und 10,0
  return Math.min(10.0, Math.max(1.0, parseFloat(score.toFixed(1))));
};

const formatShortMD = (val) => `ST ${val}`;

const UserDetail = ({ dataBase = '', routeBase = '', mode = 'live' }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useBackNavigation(routeBase || '/');

  const [userData, setUserData] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [history, setHistory] = useState([]);
  // "loading" deckt nur den schnellen ersten Schritt ab (Nutzer finden) - die
  // Kopfzeile mit Name/Rang/Statistik-Kacheln kann sofort stehen, sobald das
  // da ist. "historyLoading" ist fuer die Charts, die auf mehrere
  // Spieltag-Dateien warten muessen und deutlich laenger brauchen koennen.
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [thresholds, setThresholds] = useState(null);
  const [showAverage, setShowAverage] = useState(false);
  const [showOptimal, setShowOptimal] = useState(false);
  const [currentMatchday, setCurrentMatchday] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setHistoryLoading(true);
      try {
        // Parallelize initial fetches
        const [latestRes, indexRes] = await Promise.all([
          fetch(`${dataBase}/data.json?t=${Date.now()}`),
          fetch(`${dataBase}/history/index.json`)
        ]);

        const latestData = await latestRes.json();
        const indexData = await indexRes.json();
        setCurrentMatchday(latestData.matchday);

        const allUsersFlat = latestData.leagues.flatMap(l => l.users.map(u => ({...u, leagueColor: l.color, leagueName: l.name}))).sort((a,b) => a.rank - b.rank);
        setAllUsers(allUsersFlat);

        const foundUser = allUsersFlat.find(user => user.id === id);
        if (!foundUser) {
          setLoading(false);
          setHistoryLoading(false);
          return;
        }

        setUserData(foundUser);
        // Kopfzeile ist ab hier vollstaendig darstellbar - der Rest (Charts)
        // laedt im Hintergrund weiter, ohne die ganze Seite zu blockieren.
        setLoading(false);

        if (mode === 'archive') {
          const allUsersSorted = [...allUsersFlat].sort((a,b) => a.rank - b.rank);
          const t9 = allUsersSorted.find(u => u.rank === 9);
          const t10 = allUsersSorted.find(u => u.rank === 10);
          const t18 = allUsersSorted.find(u => u.rank === 18);
          const t19 = allUsersSorted.find(u => u.rank === 19);
          const t27 = allUsersSorted.find(u => u.rank === 27);
          const t28 = allUsersSorted.find(u => u.rank === 28);

          setThresholds({
            rank9: t9 ? parseInt(t9.points.replace(/\./g, '')) : null,
            rank10: t10 ? parseInt(t10.points.replace(/\./g, '')) : null,
            rank18: t18 ? parseInt(t18.points.replace(/\./g, '')) : null,
            rank19: t19 ? parseInt(t19.points.replace(/\./g, '')) : null,
            rank27: t27 ? parseInt(t27.points.replace(/\./g, '')) : null,
            rank28: t28 ? parseInt(t28.points.replace(/\./g, '')) : null
          });
        }

        const matchdayList = (indexData.matchdays || []).sort((a, b) => a - b);

        const historyPromises = matchdayList.map(async (m) => {
          try {
            const res = await fetch(`${dataBase}/history/spieltag-${m}.json`);
            if (!res.ok) return null;
            const data = await res.json();

            let userAtMatchday = null;
            let allPoints = [];
            data.leagues.forEach(l => {
              l.users.forEach(u => {
                  allPoints.push(parseInt(u.pointsMatchday.replace(/\./g, '')) || 0);
              });
              const u = l.users.find(user => user.id === id);
              if (u) userAtMatchday = u;
            });

            if (!userAtMatchday) return null;
            const averagePoints = allPoints.length ? Math.round(allPoints.reduce((a, b) => a + b, 0) / allPoints.length) : 0;
            const maxPoints = allPoints.length ? Math.max(...allPoints) : 0;

            const optRes = await fetch(`${dataBase}/history/optimal-md-${m}-final.json`);
            let optimalPoints = 0;
            if (optRes.ok) {
              const optData = await optRes.json();
              optimalPoints = optData.totalPoints || 0;
            }

            return {
              matchday: m,
              points: parseInt(userAtMatchday.points.replace(/\./g, '')) || 0,
              pointsMatchday: parseInt(userAtMatchday.pointsMatchday.replace(/\./g, '')) || 0,
              rank: userAtMatchday.rank,
              budget: parseInt(userAtMatchday.estimatedBudget.replace(/[^0-9]/g, '')) || 0,
              averagePoints,
              maxPoints,
              optimalPoints
            };
          } catch (e) {
            return null;
          }
        });

        const historyResults = (await Promise.all(historyPromises)).filter(Boolean);

        const currentPoints = parseInt(foundUser.points.replace(/\./g, '')) || 0;
        const currentMatchdayPoints = parseInt(foundUser.pointsMatchday.replace(/\./g, '')) || 0;

        if (!historyResults.find(h => h.matchday === latestData.matchday)) {
            const latestPoints = allUsersFlat.map(u => parseInt(u.pointsMatchday.replace(/\./g, '')) || 0);
            const latestAvg = latestPoints.length ? Math.round(latestPoints.reduce((a,b) => a+b, 0) / latestPoints.length) : 0;
            const latestMax = latestPoints.length ? Math.max(...latestPoints) : 0;

            const optRes = await fetch(`${dataBase}/history/optimal-md-${latestData.matchday}-final.json`);
            let optimalPoints = 0;
            if (optRes.ok) {
              const optData = await optRes.json();
              optimalPoints = optData.totalPoints || 0;
            }

            historyResults.push({
              matchday: latestData.matchday,
              points: currentPoints,
              pointsMatchday: currentMatchdayPoints,
              rank: foundUser.rank,
              budget: parseInt(foundUser.estimatedBudget.replace(/[^0-9]/g, '')) || 0,
              averagePoints: latestAvg,
              maxPoints: latestMax,
              optimalPoints
            });
        }

        setHistory(historyResults.sort((a, b) => a.matchday - b.matchday));
        setHistoryLoading(false);
      } catch (err) {
        console.error("Error fetching user details:", err);
        setLoading(false);
        setHistoryLoading(false);
      }
    };

    fetchData();
  }, [id, dataBase, mode]);

  const [advisorData, setAdvisorData] = useState(null);
  const [startelfData, setStartelfData] = useState(null);
  
  useEffect(() => {
    if (mode === 'archive') return;
    fetch(`${dataBase}/advisor-data.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((json) => setAdvisorData(json))
      .catch(() => setAdvisorData(null));
  }, [dataBase, mode]);

  useEffect(() => {
    if (mode === 'archive' || !currentMatchday) return;
    fetch(`${dataBase}/history/startelf-md${currentMatchday}.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((json) => setStartelfData(json))
      .catch(() => setStartelfData(null));
  }, [dataBase, mode, currentMatchday]);

  // Gleiches Join-Muster wie AccountStats.jsx::KaderTab: managerId (userData.id)
  // entspricht 1:1 dem Key in managerSquads, unabhaengig davon in welcher der
  // 3 Ligen der Manager spielt - deshalb ueber alle Ligen suchen statt eine
  // feste Liga anzunehmen.
  const squad = useMemo(() => {
    if (!advisorData || !userData) return null;
    for (const league of Object.values(advisorData.leagues || {})) {
      const found = league.managerSquads?.[userData.id];
      if (found?.length) return found;
    }
    return null;
  }, [advisorData, userData]);

  // Nach Position gruppiert (TW -> ABW -> MF -> ST, wie auf dem Spielfeld),
  // aber mit variabler Spielerzahl pro Reihe statt der festen 11er-Aufstellung
  // der Optimalen Elf - ein Kader hat i.d.R. 15-20 Spieler, keine feste Formation.
  const squadByPosition = useMemo(() => {
    if (!squad) return [];
    const order = ['TW', 'ABW', 'MF', 'ST'];
    return order
      .map((pos) => ({
        position: pos,
        players: squad
          .filter((p) => p.position === pos)
          .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0)),
      }))
      .filter((g) => g.players.length > 0);
  }, [squad]);

  const historyWithScores = useMemo(() => {
    return history.map(h => ({
      ...h,
      performanceScore: parseFloat(calculatePerformanceScore(h.pointsMatchday, h.averagePoints, h.optimalPoints, h.maxPoints).toFixed(1))
    }));
  }, [history]);

  const stats = useMemo(() => {
    if (historyWithScores.length === 0) return null;

    const last = historyWithScores[historyWithScores.length - 1];
    const prev = historyWithScores.length > 1 ? historyWithScores[historyWithScores.length - 2] : null;

    const avgPoints = historyWithScores.reduce((acc, h) => acc + h.pointsMatchday, 0) / historyWithScores.length;
    const bestMD = Math.max(...historyWithScores.map(h => h.pointsMatchday));
    const rankChange = prev ? prev.rank - last.rank : 0;

    // Performance Rating (1-10)
    const scores = historyWithScores.map(h => h.performanceScore);
    const performanceScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1).replace('.', ',') : '0,0';

    return {
      avgPoints: Math.round(avgPoints),
      bestMD,
      rankChange,
      totalPoints: last.points,
      performanceScore
    };
  }, [historyWithScores]);

  if (loading) {
    // Bewusst schlicht gehalten: Dieser Schritt ist eine einzelne, schnelle
    // Abfrage - keine aufwendige Ladeanimation noetig, ein kurzer dunkler
    // Zwischenzustand reicht.
    return <div className="min-h-screen bg-[#000000]"></div>;
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-[#000000] flex flex-col justify-center items-center gap-6">
        <div className="text-gray-400 text-lg font-bold">Spieler nicht gefunden</div>
        <button
          onClick={goBack}
          className="bg-[#171717] border border-[#2e2e2e] px-6 py-3 rounded-xl text-gray-300 hover:text-white hover:border-[#ff5c3e] transition-all"
        >
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#000000] min-h-screen relative flex flex-col pb-10">
      {/* Modal: Gegner fuer Head-to-Head auswaehlen */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="card-surface rounded-2xl w-full max-w-md flex flex-col max-h-[80vh] shadow-2xl">
             <div className="p-4 border-b border-[#2e2e2e] flex justify-between items-center">
               <h3 className="text-lg font-bold text-gray-200">Gegner auswählen</h3>
               <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                 <X size={20} />
               </button>
             </div>
             <div className="p-4 border-b border-[#2e2e2e]">
               <div className="bg-[#000000] rounded-xl flex items-center px-3 py-2 border border-[#2e2e2e]">
                 <Search size={16} className="text-gray-500 mr-2" />
                 <input
                   type="text"
                   placeholder="Spieler suchen..."
                   className="bg-transparent border-none outline-none text-sm text-gray-200 w-full"
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   autoFocus
                 />
               </div>
             </div>
             <div className="overflow-y-auto p-2">
               {allUsers
                 .filter(u => u.id !== id && u.name.toLowerCase().includes(searchQuery.toLowerCase()))
                 .map(u => (
                 <button
                   key={u.id}
                   onClick={() => {
                     navigate(`${routeBase}/compare/${id}/${u.id}`);
                     setIsModalOpen(false);
                     setSearchQuery('');
                   }}
                   className="w-full text-left p-3 hover:bg-[#1f1f1f] rounded-xl flex items-center gap-3 transition-colors"
                 >
                   <ManagerAvatar name={u.name} size={32} />
                   <div className="flex-1">
                     <div className="font-bold text-sm text-gray-200">{u.name}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">Platz #{u.rank}</div>
                   </div>
                 </button>
               ))}
               {allUsers.filter(u => u.id !== id && u.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                 <div className="p-4 text-center text-gray-500 text-sm">Keine Spieler gefunden</div>
               )}
             </div>
          </div>
        </div>
      )}

      {/* Header mit Zurueck-Button (Page-Look, wie Advisor::PlayerDetailView) */}
      <div className="sticky top-0 z-40 bg-[#000000]/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#2e2e2e]/50">
        <BackButton onClick={goBack} />
        <button
          onClick={() => setIsModalOpen(true)}
          className="group flex items-center gap-2 text-[#8b92a5] hover:text-white transition-colors"
        >
          <Users size={16} className="group-hover:text-[#ff5c3e] transition-colors" />
          <span className="text-xs font-bold uppercase tracking-wider">Vergleichen</span>
        </button>
      </div>

      <div className="max-w-[1400px] w-full mx-auto pt-6 sm:pt-8 pb-8 px-4 sm:px-6">

        {/* Name, Platz & grosses rundes Foto-Medaillon rechts (wie im
            Trading Advisor) - extra Abstand nach oben (pt-6/pt-8), damit das
            groessere Bild nicht direkt am Sticky-Header klebt. Foto ist
            IMMER vollstaendig sichtbar (nie angeschnitten, das wuerde eine
            harte, gerade Kante erzeugen statt eines sauberen Fades). */}
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="min-w-0">
            {mode !== 'archive' && userData.leagueName && (
              <span
                className="inline-flex text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 mb-1.5 w-fit"
                style={{ backgroundColor: `${userData.leagueColor}26`, color: userData.leagueColor }}
              >
                {userData.leagueName}
              </span>
            )}
            <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-tight truncate">
              {userData.name}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[#8b92a5] font-medium text-sm">Platz #{userData.rank}</span>
              {stats && stats.rankChange !== 0 && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${stats.rankChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {stats.rankChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {Math.abs(stats.rankChange)} {stats.rankChange > 0 ? 'auf' : 'ab'}
                </span>
              )}
            </div>
          </div>

          <ManagerAvatar name={userData.name} ringColor={userData.leagueColor || '#ff5c3e'} size={140} />
        </div>

        {/* Gesamtpunkte (Scalable Style, wie Marktwert im Advisor) */}
        <div className="mb-6">
          <div className="text-3xl sm:text-[40px] font-semibold text-white leading-none tracking-tight mb-2">
            {userData.points}
            <span className="text-base sm:text-lg text-[#8b92a5] font-medium ml-2">Punkte</span>
          </div>
          {stats && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:text-base font-medium">
              <span className="text-[#8b92a5]">Ø {stats.avgPoints.toLocaleString('de-DE')} Pkt./Spieltag</span>
              <span className="text-[#4b5563]">|</span>
              <span className="text-[#8b92a5]">Bester ST: {stats.bestMD.toLocaleString('de-DE')}</span>
            </div>
          )}
        </div>

        {startelfData?.managers?.[userData.id] ? (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold text-white">Startelf</h3>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full">
                Verifiziert
              </span>
            </div>
            <div
              className="rounded-2xl overflow-hidden relative min-h-[400px] flex flex-col justify-center py-8"
              style={{ backgroundImage: 'radial-gradient(circle at center, #171717 0%, #0a0a0a 100%)' }}
            >
              <div className="w-full max-w-md mx-auto relative flex flex-col justify-between h-full">
                {/* Pitch lines background - rein dekorativ */}
                <div className="absolute inset-0 pointer-events-none opacity-5 border-2 border-white rounded-lg m-4">
                  <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white"></div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border border-white rounded-full"></div>
                </div>

                <div className="relative z-10 w-full px-2 h-full flex flex-col justify-between">
                  {(() => {
                    const lineup = startelfData.managers[userData.id].lineup;
                    const st = lineup.filter(p => p.position === 4);
                    const mf = lineup.filter(p => p.position === 3);
                    const aw = lineup.filter(p => p.position === 2);
                    const tw = lineup.filter(p => p.position === 1);

                    return (
                      <>
                        <PositionRow players={st} />
                        <PositionRow players={mf} />
                        <PositionRow players={aw} />
                        <PositionRow players={tw} />
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        ) : squadByPosition.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Kader</h3>
            <div
              className="rounded-2xl overflow-hidden relative min-h-[400px] py-8"
              style={{ backgroundImage: 'radial-gradient(circle at center, #171717 0%, #0a0a0a 100%)' }}
            >
              <div className="w-full max-w-md mx-auto relative">
                {/* Pitch lines background - rein dekorativ, keine neuen Daten */}
                <div className="absolute inset-0 pointer-events-none opacity-5 border-2 border-white rounded-lg m-4">
                  <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white"></div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border border-white rounded-full"></div>
                </div>

                <div className="space-y-5 relative z-10 px-4">
                  {squadByPosition.map((group) => (
                    <div key={group.position}>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#8b92a5] mb-2.5">
                        {POSITION_LABELS[group.position] || group.position}
                      </div>
                      <div className="flex flex-wrap gap-x-2 gap-y-4">
                        {group.players.map((p) => (
                          <PlayerPhotoCard
                            key={p.playerId}
                            imagePath={p.imagePath}
                            name={p.name}
                            displayName={p.name}
                            badgeValue={p.lastPoints != null ? Math.round(p.lastPoints) : null}
                            marketValue={p.marketValue}
                            highlighted={p.startElfProbability != null && p.startElfProbability >= 0.5}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Liga-Zonen-Info (Archiv) bzw. schlichte Liga-Zeile - kein Card-Rahmen mehr, nur ein Akzentstreifen */}
        {mode === 'archive' ? (
          <ThresholdLine rank={userData.rank} points={parseInt(userData.points.replace(/\./g, ''))} thresholds={thresholds} />
        ) : null}

        {/* Kennzahlen (Scalable Style, wie Advisor::PlayerDetailView) */}
        <div className="mt-6 mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Kennzahlen</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-6 gap-x-4">
            <div className="flex flex-col">
              <span className="text-[#8b92a5] text-xs font-medium mb-1">Gesamtpunkte</span>
              <span className="text-white font-semibold text-lg">{userData.points}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[#8b92a5] text-xs font-medium mb-1">Schnitt / Spieltag</span>
              <span className="text-white font-semibold text-lg">{historyLoading ? '–' : stats?.avgPoints?.toLocaleString('de-DE')}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[#8b92a5] text-xs font-medium mb-1">Bester Spieltag</span>
              <span className="text-white font-semibold text-lg">{historyLoading ? '–' : stats?.bestMD?.toLocaleString('de-DE')}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[#8b92a5] text-xs font-medium mb-1 flex items-center gap-1"><Zap size={12} className="text-purple-400" /> Performance Index</span>
              <span className="text-white font-semibold text-lg">{historyLoading ? '–' : `${stats?.performanceScore} / 10`}</span>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-10">
          {/* Rank History */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-white">Platzierungsverlauf</h3>
              <span className="text-[9px] sm:text-[10px] text-[#6b7280] font-bold uppercase tracking-widest">Liga-Zonen</span>
            </div>
            <div className="h-[200px] sm:h-[220px] w-full">
              {historyLoading ? (
                <div className="w-full h-full rounded-xl bg-[#0a0a0a] animate-pulse"></div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyWithScores} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <XAxis
                    dataKey="matchday"
                    stroke="#4b5563"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatShortMD}
                  />
                  <YAxis
                    reversed
                    stroke="#4b5563"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    domain={[1, 30]}
                    ticks={[1, 5, 10, 15, 20, 25, 30]}
                  />

                  {/* League Background Zones */}
                  <ReferenceArea y1={1} y2={9} fill="#4ba6ff" fillOpacity={0.1} stroke="none" />
                  <ReferenceArea y1={9} y2={18} fill="#ff5c3e" fillOpacity={0.1} stroke="none" />
                  <ReferenceArea y1={18} y2={30} fill="#22c55e" fillOpacity={0.1} stroke="none" />

                  <Line
                    type="monotone"
                    dataKey="rank"
                    name={userData.name}
                    stroke="#eab308"
                    strokeWidth={2.5}
                    dot={<CustomizedDot />}
                    activeDot={{ r: 8, strokeWidth: 0 }}
                    animationDuration={1500}
                  />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Matchday Performance */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-white">Spieltags-Leistung</h3>
              <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAverage(!showAverage)}
                    className={`text-[10px] font-semibold pb-0.5 border-b-2 transition-colors ${showAverage ? 'text-[#ff5c3e] border-[#ff5c3e]' : 'text-[#6b7280] border-transparent hover:text-gray-300'}`}
                  >
                    Ø Schnitt
                  </button>
                  <button
                    onClick={() => setShowOptimal(!showOptimal)}
                    className={`text-[10px] font-semibold pb-0.5 border-b-2 transition-colors ${showOptimal ? 'text-green-500 border-green-500' : 'text-[#6b7280] border-transparent hover:text-gray-300'}`}
                  >
                    Beste Elf
                  </button>
              </div>
            </div>
            <div className="h-[200px] sm:h-[220px] w-full mt-4">
              {historyLoading ? (
                <div className="w-full h-full rounded-xl bg-[#0a0a0a] animate-pulse"></div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historyWithScores} margin={{ top: 20, right: 5, left: -25, bottom: 5 }}>
                  <XAxis
                    dataKey="matchday"
                    stroke="#4b5563"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatShortMD}
                  />
                  <YAxis stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />

                  {/* Durchschnitts-Balken */}
                  {showAverage && (
                    <Bar
                      dataKey="averagePoints"
                      name="Ligaschnitt"
                      fill="#4b5563"
                      radius={[4, 4, 0, 0]}
                      animationDuration={1500}
                    >
                        <LabelList dataKey="averagePoints" position="top" fill="#8b92a5" fontSize={8} fontWeight="bold" formatter={(val) => `Ø ${val}`} />
                    </Bar>
                  )}

                  {/* Spieler-Balken */}
                  <Bar
                    dataKey="pointsMatchday"
                    name={userData.name}
                    fill="#ff5c3e"
                    radius={[4, 4, 0, 0]}
                    animationDuration={1500}
                  >
                      <LabelList dataKey="pointsMatchday" position="top" fill="#ff5c3e" fontSize={8} fontWeight="bold" />
                  </Bar>

                  {/* Optimale Elf Balken */}
                  {showOptimal && (
                    <Bar
                      dataKey="optimalPoints"
                      name="Beste Elf"
                      fill="#22c55e"
                      radius={[4, 4, 0, 0]}
                      animationDuration={1500}
                    >
                        <LabelList dataKey="optimalPoints" position="top" fill="#22c55e" fontSize={8} fontWeight="bold" formatter={(val) => `★ ${val}`} />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Performance Rating History */}
        <div className="mt-8 sm:mt-10">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Performance Index</h3>
              <p className="text-[10px] text-[#6b7280] font-medium mt-0.5">Rating 1-10 pro Spieltag</p>
            </div>
            <span className="text-[10px] text-green-400 font-bold uppercase tracking-widest">Ø {stats?.performanceScore ?? '–'}</span>
          </div>
          <div className="h-[200px] sm:h-[220px] w-full">
            {historyLoading ? (
              <div className="w-full h-full rounded-xl bg-[#0a0a0a] animate-pulse"></div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyWithScores} margin={{ top: 20, right: 5, left: -25, bottom: 5 }}>
                <XAxis
                  dataKey="matchday"
                  stroke="#4b5563"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatShortMD}
                />
                <YAxis
                  stroke="#4b5563"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={[1, 10]}
                  ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                />

                {/* Reference Area for "Good" performance */}
                <ReferenceArea y1={5} y2={10} fill="#22c55e" fillOpacity={0.03} stroke="none" />

                <Line
                  type="monotone"
                  dataKey="performanceScore"
                  name="Performance Index"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={<CustomizedDot />}
                  activeDot={{ r: 8, strokeWidth: 0 }}
                  animationDuration={1500}
                />

                {/* Ligaschnitt Reference Line */}
                <ReferenceArea y1={4.95} y2={5.05} fill="#8b92a5" fillOpacity={0.5} label={{ value: 'Ø SCHNITT', position: 'right', fill: '#8b92a5', fontSize: 8, fontWeight: 'bold' }} />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ThresholdLine = ({ rank, points, thresholds }) => {
  if (!thresholds) return null;

  const getLigaInfo = () => {
    if (rank <= 9) {
      const diffToDown = thresholds.rank10 !== null ? points - thresholds.rank10 : null;
      return {
        current: "LIGA 1",
        primary: diffToDown !== null ? `${diffToDown.toLocaleString('de-DE')} Pkt Vorsprung auf Liga 2` : "An der Spitze!",
        secondary: null,
        color: '#22c55e'
      };
    } else if (rank <= 18) {
      const diffToUp = thresholds.rank9 ? thresholds.rank9 - points : 0;
      const diffToDown = thresholds.rank19 ? points - thresholds.rank19 : 0;
      return {
        current: "LIGA 2",
        primary: `${diffToUp.toLocaleString('de-DE')} Pkt bis Liga 1`,
        secondary: `${diffToDown.toLocaleString('de-DE')} Pkt Vorsprung auf Liga 3`,
        color: '#eab308'
      };
    } else {
      const diffToUp = thresholds.rank18 ? thresholds.rank18 - points : 0;
      return {
        current: "LIGA 3",
        primary: `${diffToUp.toLocaleString('de-DE')} Pkt bis Liga 2`,
        secondary: null,
        color: '#3b82f6'
      };
    }
  };

  const info = getLigaInfo();

  return (
    <div className="border-l-2 pl-3 py-1 mb-2 flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-1" style={{ borderColor: info.color }}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded" style={{ backgroundColor: `${info.color}26`, color: info.color }}>
          {info.current}
        </span>
        <span className="text-sm font-semibold text-gray-100">{info.primary}</span>
      </div>
      {info.secondary && (
        <span className="text-[11px] font-medium text-gray-500">{info.secondary}</span>
      )}
    </div>
  );
};

const CustomizedDot = (props) => {
  const { cx, cy, stroke, value } = props;
  if (!cx || !cy) return null;

  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={stroke} stroke="#171717" strokeWidth={2} />
      <text x={cx} y={cy} textAnchor="middle" dy=".35em" fill="#171717" fontSize={8} fontWeight="black">
        {value}
      </text>
    </g>
  );
};

export default UserDetail;
