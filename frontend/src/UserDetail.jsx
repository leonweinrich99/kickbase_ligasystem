import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  ResponsiveContainer, ReferenceArea, Legend, LabelList 
} from 'recharts';
import { 
  ArrowLeft, TrendingUp, TrendingDown, Target, 
  Award, Wallet, Activity, Star, Users, Search, X, Zap
} from 'lucide-react';

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

const UserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [userData, setUserData] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState(null);
  const [showAverage, setShowAverage] = useState(false);
  const [showOptimal, setShowOptimal] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Parallelize initial fetches
        const [latestRes, indexRes] = await Promise.all([
          fetch(`/data.json?t=${Date.now()}`),
          fetch('/history/index.json')
        ]);
        
        const latestData = await latestRes.json();
        const indexData = await indexRes.json();
        
        const allUsersFlat = latestData.leagues.flatMap(l => l.users.map(u => ({...u, leagueColor: l.color}))).sort((a,b) => a.rank - b.rank);
        setAllUsers(allUsersFlat);

        const foundUser = allUsersFlat.find(user => user.id === id);
        if (!foundUser) {
          setLoading(false);
          return;
        }

        setUserData(foundUser);

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

        const matchdayList = (indexData.matchdays || []).sort((a, b) => a - b);

        const historyPromises = matchdayList.map(async (m) => {
          try {
            const res = await fetch(`/history/spieltag-${m}.json`);
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

            const optRes = await fetch(`/history/optimal-md-${m}-final.json`);
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

            const optRes = await fetch(`/history/optimal-md-${latestData.matchday}-final.json`);
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
        setLoading(false);
      } catch (err) {
        console.error("Error fetching user details:", err);
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

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
    return (
      <div className="text-white font-sans pb-8">
        <div className="w-12 h-12 border-4 border-[#ff5c3e] border-t-transparent rounded-full animate-spin"></div>
        <div className="text-gray-500 font-bold tracking-widest uppercase text-xs">Lade Statistiken...</div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-[#0f1115] flex flex-col justify-center items-center gap-6">
        <div className="text-gray-400 text-lg font-bold">Spieler nicht gefunden</div>
        <button 
          onClick={() => navigate('/')}
          className="bg-[#1a1d24] border border-[#2a2e37] px-6 py-3 rounded-xl text-gray-300 hover:text-white hover:border-[#ff5c3e] transition-all"
        >
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-20 px-0 relative">
      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl w-full max-w-md flex flex-col max-h-[80vh] shadow-2xl">
             <div className="p-4 border-b border-[#2a2e37] flex justify-between items-center">
               <h3 className="text-lg font-bold text-gray-200">Gegner auswählen</h3>
               <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                 <X size={20} />
               </button>
             </div>
             <div className="p-4 border-b border-[#2a2e37]">
               <div className="bg-[#0f1115] rounded-xl flex items-center px-3 py-2 border border-[#2a2e37]">
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
                     navigate(`/compare/${id}/${u.id}`);
                     setIsModalOpen(false);
                     setSearchQuery('');
                   }}
                   className="w-full text-left p-3 hover:bg-[#20242d] rounded-xl flex items-center gap-3 transition-colors"
                 >
                   <div className="w-8 h-8 rounded-full bg-[#2a2e37] flex items-center justify-center font-bold text-xs text-gray-300">
                     {u.name.charAt(0)}
                   </div>
                   <div className="flex-1">
                     <div className="font-bold text-sm text-gray-200">{u.name}</div>
                     <div className="text-[10px] text-gray-500 uppercase tracking-widest">Rank #{u.rank}</div>
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 sm:mb-10 gap-6">
        
        {/* Top bar on mobile (Back + Compare buttons) */}
        <div className="flex items-center justify-between w-full sm:w-auto">
            <button 
              onClick={() => navigate('/')}
              className="group flex items-center gap-3 bg-[#1a1d24] border border-[#2a2e37] px-4 py-2 rounded-xl text-[#8b92a5] hover:text-white transition-all shrink-0"
            >
              <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-wider">Dashboard</span>
            </button>

            {/* Compare Buttons on mobile */}
            <div className="flex sm:hidden items-center gap-2">
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="group flex items-center gap-2 bg-[#1a1d24] border border-[#2a2e37] px-4 py-2 rounded-xl text-[#8b92a5] hover:text-white hover:border-[#ff5c3e] transition-all"
                >
                  <Users size={16} className="group-hover:text-[#ff5c3e] transition-colors" />
                  <span className="text-xs font-bold uppercase tracking-wider">VS</span>
                </button>
            </div>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto">
          {/* Compare Buttons on desktop */}
          <div className="hidden sm:flex items-center gap-2">
              <button 
                onClick={() => setIsModalOpen(true)}
                className="group flex items-center gap-2 bg-[#1a1d24] border border-[#2a2e37] px-4 py-2 rounded-xl text-[#8b92a5] hover:text-white hover:border-[#ff5c3e] transition-all"
              >
                <Users size={16} className="group-hover:text-[#ff5c3e] transition-colors" />
                <span className="text-xs font-bold uppercase tracking-wider">Vergleichen</span>
              </button>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center">
                   <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#1a1d24] border border-[#2a2e37] flex items-center justify-center relative shadow-xl overflow-hidden shrink-0 z-10">
                      <div className="absolute inset-0 bg-[#ff5c3e] opacity-5"></div>
                      <Star className="text-[#ff5c3e] opacity-20 absolute -right-2 -bottom-2 w-12 h-12 rotate-12" />
                      <div className="text-2xl font-black text-[#ff5c3e] z-10">{userData.name.charAt(0)}</div>
                   </div>
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <h1 className="text-lg sm:text-3xl font-black tracking-tight uppercase flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-2 leading-tight">
                  <span className="truncate">{userData.name}</span>
                </h1>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5 sm:mt-1">
                   <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#1a1d24] border border-[#2a2e37]">
                      <Target size={12} className="text-[#8b92a5]" />
                      <span className="text-[9px] sm:text-[10px] font-bold text-gray-300 uppercase tracking-widest">Rank #{userData.rank}</span>
                   </div>
                   {stats?.rankChange !== 0 && (
                     <div className={`flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest ${stats.rankChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {stats.rankChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Math.abs(stats.rankChange)} {stats.rankChange > 0 ? 'auf' : 'ab'}
                     </div>
                   )}
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* Threshold Section */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:mb-8">
        <ThresholdCard 
          rank={userData.rank}
          points={parseInt(userData.points.replace(/\./g, ''))}
          thresholds={thresholds}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatCard 
          icon={<Award className="text-[#ff5c3e]" />} 
          label="Gesamtpunkte" 
          value={userData.points} 
          subValue="Alle Spieltage" 
        />
        <StatCard 
          icon={<Activity className="text-blue-400" />} 
          label="Schnitt / Spieltag" 
          value={stats?.avgPoints.toLocaleString('de-DE')} 
          subValue="Pkt. pro Spieltag" 
        />
        <StatCard 
          icon={<Target className="text-yellow-500" />} 
          label="Bester Spieltag" 
          value={stats?.bestMD.toLocaleString('de-DE')} 
          subValue="Saisonrekord" 
        />
        <StatCard 
          icon={<Zap className="text-purple-400" />} 
          label="Performance Index" 
          value={stats?.performanceScore} 
          subValue="Saison-Rating (1-10)" 
          isRating={true}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Rank History */}
        <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-4 sm:p-6 shadow-lg">
          <div className="flex justify-between items-center mb-4 sm:mb-6">
            <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-[#8b92a5]">Platzierungsverlauf</h3>
            <div className="px-2 py-1 bg-[#20242d] rounded text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase">Liga Zonen</div>
          </div>
          <div className="h-[200px] sm:h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyWithScores} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e37" vertical={false} />
                <XAxis 
                  dataKey="matchday" 
                  stroke="#4b5563" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={val => `ST ${val}`}
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
                
                {/* League Background Zones with increased visibility */}
                <ReferenceArea y1={1} y2={9} fill="#4ba6ff" fillOpacity={0.12} stroke="none" />
                <ReferenceArea y1={9} y2={18} fill="#ff5c3e" fillOpacity={0.12} stroke="none" />
                <ReferenceArea y1={18} y2={30} fill="#22c55e" fillOpacity={0.12} stroke="none" />

                
                <Line 
                  type="monotone" 
                  dataKey="rank" 
                  name={userData.name}
                  stroke="#eab308" 
                  strokeWidth={3} 
                  dot={<CustomizedDot />}
                  activeDot={{ r: 8, strokeWidth: 0 }}
                  animationDuration={1500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Matchday Performance */}
        <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-4 sm:p-6 shadow-lg">
          <div className="flex justify-between items-center mb-4 sm:mb-6">
            <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-[#8b92a5]">Spieltags-Leistung</h3>
            <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowAverage(!showAverage)}
                  className={`px-2.5 py-1.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase transition-all border shadow-lg ${showAverage ? 'bg-[#ff5c3e]/20 border-[#ff5c3e] text-[#ff5c3e]' : 'bg-[#20242d] border-[#2a2e37] text-[#8b92a5]'}`}
                >
                  Ø Schnitt
                </button>
                <button 
                  onClick={() => setShowOptimal(!showOptimal)}
                  className={`px-2.5 py-1.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase transition-all border shadow-lg ${showOptimal ? 'bg-green-500/20 border-green-500 text-green-500' : 'bg-[#20242d] border-[#2a2e37] text-[#8b92a5]'}`}
                >
                  Beste Elf
                </button>
            </div>
          </div>
          <div className="h-[200px] sm:h-[250px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historyWithScores} margin={{ top: 20, right: 5, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e37" vertical={false} />
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
          </div>
        </div>
      </div>
      
      {/* Performance Rating History */}
      <div className="mt-4 sm:mt-6 bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-[#8b92a5]">Performance Index</h3>
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Performance Index (1-10) pro Spieltag</p>
          </div>
          <div className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[9px] text-green-400 font-bold uppercase tracking-widest">Ø {stats?.performanceScore}</div>
        </div>
        <div className="h-[200px] sm:h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyWithScores} margin={{ top: 20, right: 5, left: -25, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e37" vertical={false} />
              <XAxis 
                dataKey="matchday" 
                stroke="#4b5563" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={val => `ST ${val}`}
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
                strokeWidth={3} 
                dot={<CustomizedDot />}
                activeDot={{ r: 8, strokeWidth: 0 }}
                animationDuration={1500}
              />
              
              {/* Ligaschnitt Reference Line */}
              <ReferenceArea y1={4.95} y2={5.05} fill="#8b92a5" fillOpacity={0.5} label={{ value: 'Ø SCHNITT', position: 'right', fill: '#8b92a5', fontSize: 8, fontWeight: 'bold' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const ThresholdCard = ({ rank, points, thresholds }) => {
  if (!thresholds) return null;

  const getLigaInfo = () => {
    if (rank <= 9) {
      const diffToDown = thresholds.rank10 !== null ? points - thresholds.rank10 : null;
      return {
        current: "LIGA 1",
        primary: diffToDown !== null ? `${diffToDown.toLocaleString('de-DE')} Pkt Vorsprung auf Liga 2` : "An der Spitze!",
        secondary: null,
        type: "success"
      };
    } else if (rank <= 18) {
      const diffToUp = thresholds.rank9 ? thresholds.rank9 - points : 0;
      const diffToDown = thresholds.rank19 ? points - thresholds.rank19 : 0;
      return {
        current: "LIGA 2",
        primary: `${diffToUp.toLocaleString('de-DE')} Pkt bis Liga 1`,
        secondary: `${diffToDown.toLocaleString('de-DE')} Pkt Vorsprung auf Liga 3`,
        type: "warning"
      };
    } else {
      const diffToUp = thresholds.rank18 ? thresholds.rank18 - points : 0;
      return {
        current: "LIGA 3",
        primary: `${diffToUp.toLocaleString('de-DE')} Pkt bis Liga 2`,
        secondary: null,
        type: "info"
      };
    }
  };

  const info = getLigaInfo();

  return (
    <div className={`bg-[#1a1d24] border ${info.type === 'success' ? 'border-green-500/30' : info.type === 'warning' ? 'border-yellow-500/30' : 'border-blue-500/30'} rounded-2xl px-4 py-3 flex items-center gap-4 shadow-sm relative overflow-hidden`}>
      <div className={`p-2 rounded-lg ${info.type === 'success' ? 'bg-green-500/10 text-green-500' : info.type === 'warning' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-500'}`}>
        <TrendingUp size={20} />
      </div>
      
      <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${info.type === 'success' ? 'bg-green-500/20 text-green-500' : info.type === 'warning' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-blue-500/20 text-blue-500'}`}>
            {info.current}
          </span>
          <span className="text-sm font-black text-gray-100">{info.primary}</span>
        </div>
        
        {info.secondary && (
          <div className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5">
             <span className="hidden sm:inline w-1 h-1 rounded-full bg-gray-600"></span>
             {info.secondary}
          </div>
        )}
      </div>

      <div className={`absolute right-0 top-0 bottom-0 w-1 ${info.type === 'success' ? 'bg-green-500' : info.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'}`}></div>
    </div>
  );
};

const StatCard = ({ icon, label, value, subValue, isRating }) => {
  const getRatingColor = (val) => {
    if (!val) return 'text-gray-400';
    const num = parseFloat(val.toString().replace(',', '.'));
    if (num >= 8) return 'text-green-400';
    if (num >= 6) return 'text-green-500/80';
    if (num >= 4) return 'text-yellow-500';
    if (num >= 2) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="bg-[#1a1d24] border border-[#2a2e37] p-3 sm:p-5 rounded-2xl shadow-sm hover:border-[#3a3f4a] transition-all group relative overflow-hidden flex flex-col justify-between">
      <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
        <div className="bg-[#20242d] p-1.5 sm:p-2 rounded-lg group-hover:scale-110 transition-transform shrink-0">
          {React.cloneElement(icon, { size: 16, className: "sm:w-[18px] sm:h-[18px]" })}
        </div>
        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-[#8b92a5] leading-tight">{label}</span>
      </div>
      
      <div className="flex flex-col mb-1 gap-1">
          <div className={`text-[17px] sm:text-xl font-black leading-none ${isRating ? getRatingColor(value) : ''}`}>
            {value}
            {isRating && <span className="text-[10px] text-gray-500 ml-1">/ 10</span>}
          </div>
      </div>
      <div className="text-[8px] sm:text-[9px] font-bold text-[#626978] uppercase tracking-wider mt-1">{subValue}</div>
    </div>
  );
};

const CustomizedDot = (props) => {
  const { cx, cy, stroke, value } = props;
  if (!cx || !cy) return null;

  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={stroke} stroke="#1a1d24" strokeWidth={2} />
      <text x={cx} y={cy} textAnchor="middle" dy=".35em" fill="#1a1d24" fontSize={8} fontWeight="black">
        {value}
      </text>
    </g>
  );
};

export default UserDetail;
