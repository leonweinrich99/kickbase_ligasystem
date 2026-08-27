import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  ResponsiveContainer, ReferenceArea, Legend, LabelList 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Target, 
  Award, Wallet, Activity, Zap
} from 'lucide-react';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import ManagerAvatar from './ui/ManagerAvatar';

const calculatePerformanceScore = (points, avg, opt, max) => {
  if (points <= 0) return 1.0;
  const reference = (opt && opt > 0) ? opt : (max || 1);
  const target = reference * 0.8;
  const score = (points / target) * 10;
  return Math.min(10.0, Math.max(1.0, parseFloat(score.toFixed(1))));
};

const parsePoints = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    return parseInt(val.toString().replace(/\./g, '').replace(/[^0-9]/g, '')) || 0;
};

const CompareView = ({ dataBase = '', routeBase = '' }) => {
  const { id1, id2 } = useParams();
  const goBack = useBackNavigation(routeBase || '/');

  const [user1, setUser1] = useState(null);
  const [user2, setUser2] = useState(null);
  const [history, setHistory] = useState([]);
  // Aufgeteilt wie in UserDetail.jsx: "loading" nur fuer den schnellen ersten
  // Schritt (beide Spieler finden), "historyLoading" fuer die Charts, die auf
  // mehrere Spieltag-Dateien warten muessen.
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showAverage, setShowAverage] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setHistoryLoading(true);
      try {
        const [latestRes, indexRes] = await Promise.all([
          fetch(`${dataBase}/data.json?t=${Date.now()}`),
          fetch(`${dataBase}/history/index.json`)
        ]);
        
        const latestData = await latestRes.json();
        const indexData = await indexRes.json();
        const allUsersFlat = latestData.leagues.flatMap(l => l.users.map(u => ({...u, leagueColor: l.color})));
        const foundUser1 = allUsersFlat.find(u => u.id === id1);
        const foundUser2 = allUsersFlat.find(u => u.id === id2);

        if (!foundUser1 || !foundUser2) {
          setLoading(false);
          setHistoryLoading(false);
          return;
        }

        setUser1(foundUser1);
        setUser2(foundUser2);
        // Kopfbereich (Namen, Ranks) kann ab hier sofort stehen.
        setLoading(false);

        const matchdayList = (indexData.matchdays || []).sort((a, b) => a - b);

        const historyPromises = matchdayList.map(async (m) => {
          try {
            const res = await fetch(`${dataBase}/history/spieltag-${m}.json`);
            if (!res.ok) return null;
            const data = await res.json();
            
            let u1AtMatchday = null;
            let u2AtMatchday = null;
            let allPoints = [];
            data.leagues.forEach(l => {
              l.users.forEach(u => {
                  allPoints.push(parsePoints(u.pointsMatchday));
              });
              const u1 = l.users.find(user => user.id === id1);
              if (u1) u1AtMatchday = u1;
              const u2 = l.users.find(user => user.id === id2);
              if (u2) u2AtMatchday = u2;
            });

            if (!u1AtMatchday || !u2AtMatchday) return null;
            
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
              p1Points: parsePoints(u1AtMatchday.points),
              p1PointsMatchday: parsePoints(u1AtMatchday.pointsMatchday),
              p1Rank: u1AtMatchday.rank,
              p1Budget: parsePoints(u1AtMatchday.estimatedBudget),
              p2Points: parsePoints(u2AtMatchday.points),
              p2PointsMatchday: parsePoints(u2AtMatchday.pointsMatchday),
              p2Rank: u2AtMatchday.rank,
              p2Budget: parsePoints(u2AtMatchday.estimatedBudget),
              averagePoints,
              maxPoints,
              optimalPoints
            };
          } catch (e) {
            return null;
          }
        });

        const historyResults = (await Promise.all(historyPromises)).filter(Boolean);
        
        if (!historyResults.find(h => h.matchday === latestData.matchday)) {
            const latestPoints = allUsersFlat.map(u => parsePoints(u.pointsMatchday));
            const latestAvg = latestPoints.length ? Math.round(latestPoints.reduce((a,b) => a+b, 0) / latestPoints.length) : 0;
            const latestMax = latestPoints.length ? Math.max(...latestPoints) : 0;

            const optRes = await fetch(`${dataBase}/history/optimal-md-${latestData.matchday}-final.json`);
            let latestOptimal = 0;
            if (optRes.ok) {
              const optData = await optRes.json();
              latestOptimal = optData.totalPoints || 0;
            }

            historyResults.push({
                matchday: latestData.matchday,
                p1Points: parsePoints(foundUser1.points),
                p1PointsMatchday: parsePoints(foundUser1.pointsMatchday),
                p1Rank: foundUser1.rank,
                p1Budget: parsePoints(foundUser1.estimatedBudget),
                p2Points: parsePoints(foundUser2.points),
                p2PointsMatchday: parsePoints(foundUser2.pointsMatchday),
                p2Rank: foundUser2.rank,
                p2Budget: parsePoints(foundUser2.estimatedBudget),
                averagePoints: latestAvg,
                maxPoints: latestMax,
                optimalPoints: latestOptimal
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
  }, [id1, id2]);

  const historyWithScores = useMemo(() => {
    return history.map(h => ({
      ...h,
      p1Score: calculatePerformanceScore(h.p1PointsMatchday, h.averagePoints, h.optimalPoints, h.maxPoints),
      p2Score: calculatePerformanceScore(h.p2PointsMatchday, h.averagePoints, h.optimalPoints, h.maxPoints)
    }));
  }, [history]);

  const stats = useMemo(() => {
    if (historyWithScores.length === 0) return null;
    
    const p1Avg = historyWithScores.reduce((acc, h) => acc + h.p1PointsMatchday, 0) / historyWithScores.length;
    const p1Best = Math.max(...historyWithScores.map(h => h.p1PointsMatchday));
    const p1AvgBudget = historyWithScores.reduce((acc, h) => acc + h.p1Budget, 0) / historyWithScores.length;
    const p1PointsPerMio = p1AvgBudget > 0 ? (p1Avg / (p1AvgBudget / 1000000)).toFixed(2).replace('.', ',') : '0,00';
    const p1Score = (historyWithScores.reduce((acc, h) => acc + h.p1Score, 0) / historyWithScores.length).toFixed(1).replace('.', ',');
    
    const p2Avg = historyWithScores.reduce((acc, h) => acc + h.p2PointsMatchday, 0) / historyWithScores.length;
    const p2Best = Math.max(...historyWithScores.map(h => h.p2PointsMatchday));
    const p2AvgBudget = historyWithScores.reduce((acc, h) => acc + h.p2Budget, 0) / historyWithScores.length;
    const p2PointsPerMio = p2AvgBudget > 0 ? (p2Avg / (p2AvgBudget / 1000000)).toFixed(2).replace('.', ',') : '0,00';
    const p2Score = (historyWithScores.reduce((acc, h) => acc + h.p2Score, 0) / historyWithScores.length).toFixed(1).replace('.', ',');

    return {
      p1Avg: Math.round(p1Avg),
      p1Best,
      p1PointsPerMio,
      p1Score,
      p2Avg: Math.round(p2Avg),
      p2Best,
      p2PointsPerMio,
      p2Score
    };
  }, [historyWithScores]);

  if (loading) {
    // Bewusst schlicht: einzelne, schnelle Abfrage - keine aufwendige
    // Ladeanimation noetig.
    return <div className="min-h-screen bg-[#000000]"></div>;
  }

  if (!user1 || !user2) {
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
    <div className="max-w-[1000px] mx-auto pb-20 px-0 relative">
      
      {/* Back Button */}
      <div className="mb-6">
        <BackButton onClick={goBack} />
      </div>

      {/* Duel Header - kartenlos, wie Advisor::PlayerDetailView */}
      <div className="flex items-center justify-between mb-8 sm:mb-10 gap-2 sm:gap-6">
         <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4 w-[42%] sm:w-2/5 min-w-0">
             <ManagerAvatar name={user1.name} size={64} ringColor="#ff5c3e" />
             <div className="min-w-0 text-center sm:text-left">
                <h1 className="text-sm sm:text-2xl font-semibold tracking-tight text-white truncate">{user1.name}</h1>
                <div className="text-[10px] sm:text-sm font-medium text-[#ff5c3e] mt-0.5">Rank #{user1.rank}</div>
             </div>
         </div>
         
         <div className="text-lg sm:text-3xl font-black text-[#2e2e2e] italic shrink-0">VS</div>
         
         <div className="flex flex-col sm:flex-row-reverse items-center sm:items-center gap-2 sm:gap-4 w-[42%] sm:w-2/5 justify-end min-w-0">
             <ManagerAvatar name={user2.name} size={64} ringColor="#3b82f6" />
             <div className="min-w-0 text-center sm:text-right">
                <h1 className="text-sm sm:text-2xl font-semibold tracking-tight text-white truncate">{user2.name}</h1>
                <div className="text-[10px] sm:text-sm font-medium text-[#3b82f6] mt-0.5">Rank #{user2.rank}</div>
             </div>
         </div>
      </div>

      {/* Stats Duel View */}
      <div className="flex flex-col divide-y divide-[#2a2a2a] mb-10">
         <DuelStatRow 
            icon={<Award />} 
            label="Gesamtpunkte" 
            val1={user1.points} 
            val2={user2.points} 
         />
         <DuelStatRow 
            icon={<Zap />} 
            label="Performance Index" 
            val1={stats?.p1Score} 
            val2={stats?.p2Score}
            isScore={true}
            loading={historyLoading}
         />
         <DuelStatRow 
            icon={<Activity />} 
            label="Schnitt pro Spieltag" 
            val1={stats?.p1Avg?.toLocaleString('de-DE')} 
            val2={stats?.p2Avg?.toLocaleString('de-DE')} 
            loading={historyLoading}
         />
         <DuelStatRow 
            icon={<Target />} 
            label="Bester Spieltag" 
            val1={stats?.p1Best?.toLocaleString('de-DE')} 
            val2={stats?.p2Best?.toLocaleString('de-DE')} 
            loading={historyLoading}
         />
         <DuelStatRow 
            icon={<Wallet />} 
            label="Pkt. / Mio. (Effizienz)" 
            val1={stats?.p1PointsPerMio} 
            val2={stats?.p2PointsPerMio} 
            loading={historyLoading}
         />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-10">
        <div>
          <h3 className="text-sm font-semibold text-white mb-4">Platzierungsverlauf</h3>
          <div className="h-[200px] sm:h-[220px] w-full">
            {historyLoading ? (
              <div className="w-full h-full rounded-xl bg-[#0a0a0a] animate-pulse"></div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyWithScores} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <XAxis dataKey="matchday" stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} tickFormatter={val => `ST ${val}`} />
                <YAxis reversed stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} domain={[1, 30]} ticks={[1, 5, 10, 15, 20, 25, 30]} />
                <ReferenceArea y1={1} y2={9} fill="#4ba6ff" fillOpacity={0.1} stroke="none" />
                <ReferenceArea y1={9} y2={18} fill="#ff5c3e" fillOpacity={0.1} stroke="none" />
                <ReferenceArea y1={18} y2={30} fill="#22c55e" fillOpacity={0.1} stroke="none" />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                
                <Line type="monotone" dataKey="p1Rank" name={user1.name} stroke="#ff5c3e" strokeWidth={2.5} dot={<CustomizedDot />} activeDot={{ r: 8, strokeWidth: 0 }} animationDuration={1500} />
                <Line type="monotone" dataKey="p2Rank" name={user2.name} stroke="#3b82f6" strokeWidth={2.5} dot={<CustomizedDot />} activeDot={{ r: 8, strokeWidth: 0 }} animationDuration={1500} />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white mb-4">Performance Index</h3>
          <div className="h-[200px] sm:h-[220px] w-full">
            {historyLoading ? (
              <div className="w-full h-full rounded-xl bg-[#0a0a0a] animate-pulse"></div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyWithScores} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <XAxis dataKey="matchday" stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} tickFormatter={val => `ST ${val}`} />
                <YAxis stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} domain={[1, 10]} ticks={[1, 3, 5, 7, 10]} />
                <ReferenceArea y1={8} y2={10} fill="#22c55e" fillOpacity={0.08} stroke="none" />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                
                <Line type="monotone" dataKey="p1Score" name={user1.name} stroke="#ff5c3e" strokeWidth={2.5} dot={<CustomizedDot />} activeDot={{ r: 8, strokeWidth: 0 }} animationDuration={1500} />
                <Line type="monotone" dataKey="p2Score" name={user2.name} stroke="#3b82f6" strokeWidth={2.5} dot={<CustomizedDot />} activeDot={{ r: 8, strokeWidth: 0 }} animationDuration={1500} />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-white">Spieltags-Leistung</h3>
            <button 
              onClick={() => setShowAverage(!showAverage)}
              className={`text-[10px] font-semibold pb-0.5 border-b-2 transition-colors ${showAverage ? 'text-[#ff5c3e] border-[#ff5c3e]' : 'text-[#6b7280] border-transparent hover:text-gray-300'}`}
            >
              Ø Ligaschnitt
            </button>
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
                  tickFormatter={val => `ST ${val}`} 
                />
                <YAxis stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                
                {showAverage && (
                  <Bar 
                    dataKey="averagePoints" 
                    name="Ligaschnitt" 
                    fill="#4b5563" 
                    radius={[4, 4, 0, 0]}
                    animationDuration={1500} 
                  >
                      <LabelList dataKey="averagePoints" position="top" fill="#8b92a5" fontSize={7} fontWeight="bold" formatter={(val) => `Ø ${val}`} />
                  </Bar>
                )}
                
                <Bar dataKey="p1PointsMatchday" name={user1.name} fill="#ff5c3e" radius={[4, 4, 0, 0]} animationDuration={1500}>
                    <LabelList dataKey="p1PointsMatchday" position="top" fill="#ff5c3e" fontSize={8} fontWeight="bold" />
                </Bar>
                <Bar dataKey="p2PointsMatchday" name={user2.name} fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={1500}>
                    <LabelList dataKey="p2PointsMatchday" position="top" fill="#3b82f6" fontSize={8} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const DuelStatRow = ({ icon, label, val1, val2, isScore, loading }) => {
    const parseScore = (v) => parseFloat(v?.toString().replace(',', '.') || 0);
    
    const num1 = isScore ? parseScore(val1) : parsePoints(val1);
    const num2 = isScore ? parseScore(val2) : parsePoints(val2);
    
    const p1Wins = !loading && num1 > num2;
    const p2Wins = !loading && num2 > num1;

    return (
        <div className="flex items-center py-4">
            <div className="w-full flex justify-between items-center">
                {/* User 1 Value */}
                <div className={`w-[30%] text-left flex flex-col justify-center ${p1Wins ? 'text-green-500' : p2Wins ? 'text-gray-500' : 'text-gray-200'}`}>
                    {loading ? (
                      <div className="h-5 sm:h-7 w-10 rounded bg-[#0a0a0a] animate-pulse"></div>
                    ) : (
                      <span className="text-lg sm:text-2xl font-semibold truncate">{val1}{isScore && <span className="text-[10px] ml-1 opacity-50">/ 10</span>}</span>
                    )}
                    {p1Wins && <span className="text-[9px] font-bold uppercase tracking-widest mt-0.5 opacity-80 hidden sm:block">Führend</span>}
                </div>

                {/* Center Label */}
                <div className="w-[40%] flex flex-col items-center justify-center px-2">
                    <div className="text-[#8b92a5] mb-1.5">
                        {React.cloneElement(icon, { size: 16 })}
                    </div>
                    <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-[#8b92a5] text-center leading-tight">
                        {label}
                    </span>
                </div>

                {/* User 2 Value */}
                <div className={`w-[30%] text-right flex flex-col justify-center ${p2Wins ? 'text-green-500' : p1Wins ? 'text-gray-500' : 'text-gray-200'}`}>
                    {loading ? (
                      <div className="h-5 sm:h-7 w-10 rounded bg-[#0a0a0a] animate-pulse ml-auto"></div>
                    ) : (
                      <span className="text-lg sm:text-2xl font-semibold truncate">{val2}{isScore && <span className="text-[10px] ml-1 opacity-50">/ 10</span>}</span>
                    )}
                    {p2Wins && <span className="text-[9px] font-bold uppercase tracking-widest mt-0.5 opacity-80 hidden sm:block">Führend</span>}
                </div>
            </div>
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

export default CompareView;
