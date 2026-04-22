import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceArea 
} from 'recharts';
import { 
  ArrowLeft, TrendingUp, TrendingDown, Target, 
  Award, Wallet, Activity, Star
} from 'lucide-react';

const UserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Aktuelle Daten laden
        const latestRes = await fetch(`/data.json?t=${Date.now()}`);
        const latestData = await latestRes.json();
        
        let foundUser = null;
        latestData.leagues.forEach(l => {
          const u = l.users.find(user => user.id === id);
          if (u) foundUser = { ...u, leagueColor: l.color };
        });

        if (!foundUser) {
          setLoading(false);
          return;
        }

        setUserData(foundUser);

        // 1.1 Schwellenwerte berechnen
        const allUsers = latestData.leagues.flatMap(l => l.users).sort((a,b) => a.rank - b.rank);
        const t9 = allUsers.find(u => u.rank === 9);
        const t10 = allUsers.find(u => u.rank === 10);
        const t18 = allUsers.find(u => u.rank === 18);
        const t19 = allUsers.find(u => u.rank === 19);
        const t27 = allUsers.find(u => u.rank === 27);
        const t28 = allUsers.find(u => u.rank === 28);

        setThresholds({
          rank9: t9 ? parseInt(t9.points.replace(/\./g, '')) : null,
          rank10: t10 ? parseInt(t10.points.replace(/\./g, '')) : null,
          rank18: t18 ? parseInt(t18.points.replace(/\./g, '')) : null,
          rank19: t19 ? parseInt(t19.points.replace(/\./g, '')) : null,
          rank27: t27 ? parseInt(t27.points.replace(/\./g, '')) : null,
          rank28: t28 ? parseInt(t28.points.replace(/\./g, '')) : null
        });

        // 2. Historie laden
        const indexRes = await fetch('/history/index.json');
        const indexData = await indexRes.json();
        const matchdayList = (indexData.matchdays || []).sort((a, b) => a - b);

        const historyPromises = matchdayList.map(async (m) => {
          try {
            const res = await fetch(`/history/spieltag-${m}.json`);
            if (!res.ok) return null;
            const data = await res.json();
            
            let userAtMatchday = null;
            data.leagues.forEach(l => {
              const u = l.users.find(user => user.id === id);
              if (u) userAtMatchday = u;
            });

            if (!userAtMatchday) return null;

            return {
              matchday: m,
              points: parseInt(userAtMatchday.points.replace(/\./g, '')) || 0,
              pointsMatchday: parseInt(userAtMatchday.pointsMatchday.replace(/\./g, '')) || 0,
              rank: userAtMatchday.rank,
              budget: parseInt(userAtMatchday.estimatedBudget.replace(/[^0-9]/g, '')) || 0
            };
          } catch (e) {
            return null;
          }
        });

        const historyResults = (await Promise.all(historyPromises)).filter(Boolean);
        
        // Aktuellen Spieltag hinzufügen, falls er nicht schon drin ist
        const currentPoints = parseInt(foundUser.points.replace(/\./g, '')) || 0;
        const currentMatchdayPoints = parseInt(foundUser.pointsMatchday.replace(/\./g, '')) || 0;
        
        if (!historyResults.find(h => h.matchday === latestData.matchday)) {
            historyResults.push({
                matchday: latestData.matchday,
                points: currentPoints,
                pointsMatchday: currentMatchdayPoints,
                rank: foundUser.rank,
                budget: parseInt(foundUser.estimatedBudget.replace(/[^0-9]/g, '')) || 0
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

  const stats = useMemo(() => {
    if (history.length === 0) return null;
    
    const last = history[history.length - 1];
    const prev = history.length > 1 ? history[history.length - 2] : null;
    
    const avgPoints = history.reduce((acc, h) => acc + h.pointsMatchday, 0) / history.length;
    const bestMD = Math.max(...history.map(h => h.pointsMatchday));
    const rankChange = prev ? prev.rank - last.rank : 0; // Positiv = Aufstieg

    return {
      avgPoints: Math.round(avgPoints),
      bestMD,
      rankChange,
      totalPoints: last.points
    };
  }, [history]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1115] flex flex-col justify-center items-center gap-4">
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
    <div className="max-w-[1200px] mx-auto pb-20 px-4 sm:px-0">
      {/* Header & Back Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6">
        <button 
          onClick={() => navigate('/')}
          className="group flex items-center gap-3 bg-[#1a1d24] border border-[#2a2e37] px-4 py-2 rounded-xl text-[#8b92a5] hover:text-white transition-all"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-wider">Dashboard</span>
        </button>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#1a1d24] border border-[#2a2e37] flex items-center justify-center relative shadow-xl overflow-hidden">
             <div className="absolute inset-0 bg-[#ff5c3e] opacity-5"></div>
             <Star className="text-[#ff5c3e] opacity-20 absolute -right-2 -bottom-2 w-12 h-12 rotate-12" />
             <div className="text-2xl font-black text-[#ff5c3e] z-10">{userData.name.charAt(0)}</div>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight uppercase mb-1">{userData.name}</h1>
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#1a1d24] border border-[#2a2e37]">
                  <Target size={12} className="text-[#8b92a5]" />
                  <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Rank #{userData.rank}</span>
               </div>
               {stats?.rankChange !== 0 && (
                 <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${stats.rankChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {stats.rankChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(stats.rankChange)} {stats.rankChange > 0 ? 'Plätze rauf' : 'Plätze runter'}
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* Threshold Section */}
      <div className="grid grid-cols-1 gap-4 mb-8">
        <ThresholdCard 
          rank={userData.rank}
          points={parseInt(userData.points.replace(/\./g, ''))}
          thresholds={thresholds}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
          subValue="Punkte pro Spieltag" 
        />
        <StatCard 
          icon={<Target className="text-yellow-500" />} 
          label="Bester Spieltag" 
          value={stats?.bestMD.toLocaleString('de-DE')} 
          subValue="Saisonrekord" 
        />
        <StatCard 
          icon={<Wallet className="text-green-500" />} 
          label="Teamwert" 
          value={userData.estimatedBudget} 
          subValue="Marktwert-Schätzung" 
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rank History */}
        <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-6 shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#8b92a5]">Platzierungsverlauf</h3>
            <div className="px-2 py-1 bg-[#20242d] rounded text-[10px] text-gray-400 font-bold uppercase">Liga Zonen</div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
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

                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1d24', border: '1px solid #2a2e37', borderRadius: '12px' }}
                  itemStyle={{ color: '#eab308', fontWeight: 'bold' }}
                />
                <Line 
                  type="stepAfter" 
                  dataKey="rank" 
                  stroke="#eab308" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#eab308', strokeWidth: 2, stroke: '#1a1d24' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  animationDuration={1500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Matchday Performance */}
        <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-6 shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#8b92a5]">Spieltags-Leistung</h3>
            <div className="px-2 py-1 bg-[#20242d] rounded text-[10px] text-gray-400 font-bold uppercase">Pro Spieltag</div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history}>
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
                <Tooltip 
                  cursor={{ fill: '#2a2e37', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: '#1a1d24', border: '1px solid #2a2e37', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                  labelStyle={{ color: '#8b92a5', marginBottom: '4px' }}
                />
                <Bar 
                  dataKey="pointsMatchday" 
                  fill="#3b82f6" 
                  radius={[4, 4, 0, 0]}
                  animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
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

const StatCard = ({ icon, label, value, subValue }) => (
  <div className="bg-[#1a1d24] border border-[#2a2e37] p-5 rounded-2xl shadow-sm hover:border-[#3a3f4a] transition-all group">
    <div className="flex items-center gap-3 mb-3">
      <div className="bg-[#20242d] p-2 rounded-lg group-hover:scale-110 transition-transform">
        {React.cloneElement(icon, { size: 18 })}
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5]">{label}</span>
    </div>
    <div className="text-xl font-black mb-1">{value}</div>
    <div className="text-[9px] font-bold text-[#626978] uppercase tracking-wider">{subValue}</div>
  </div>
);

export default UserDetail;
