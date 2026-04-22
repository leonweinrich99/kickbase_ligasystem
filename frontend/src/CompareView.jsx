import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  ResponsiveContainer, ReferenceArea, Legend, LabelList 
} from 'recharts';
import { 
  ArrowLeft, TrendingUp, TrendingDown, Target, 
  Award, Wallet, Activity, Star
} from 'lucide-react';

const parsePoints = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    return parseInt(val.toString().replace(/\./g, '').replace(/[^0-9]/g, '')) || 0;
};

const CompareView = () => {
  const { id1, id2 } = useParams();
  const navigate = useNavigate();

  const [user1, setUser1] = useState(null);
  const [user2, setUser2] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAverage, setShowAverage] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const latestRes = await fetch(`/data.json?t=${Date.now()}`);
        const latestData = await latestRes.json();
        
        const allUsersFlat = latestData.leagues.flatMap(l => l.users.map(u => ({...u, leagueColor: l.color})));
        
        const foundUser1 = allUsersFlat.find(user => user.id === id1);
        const foundUser2 = allUsersFlat.find(user => user.id === id2);

        if (!foundUser1 || !foundUser2) {
          setLoading(false);
          return;
        }

        setUser1(foundUser1);
        setUser2(foundUser2);

        const indexRes = await fetch('/history/index.json');
        const indexData = await indexRes.json();
        const matchdayList = (indexData.matchdays || []).sort((a, b) => a - b);

        const historyPromises = matchdayList.map(async (m) => {
          try {
            const res = await fetch(`/history/spieltag-${m}.json`);
            if (!res.ok) return null;
            const data = await res.json();
            
            let u1AtMatchday = null;
            let u2AtMatchday = null;
            let allPoints = [];
            data.leagues.forEach(l => {
              l.users.forEach(u => {
                  allPoints.push(parseInt(u.pointsMatchday.replace(/\./g, '')) || 0);
              });
              const u1 = l.users.find(user => user.id === id1);
              if (u1) u1AtMatchday = u1;
              const u2 = l.users.find(user => user.id === id2);
              if (u2) u2AtMatchday = u2;
            });

            if (!u1AtMatchday || !u2AtMatchday) return null;
            
            const averagePoints = allPoints.length ? Math.round(allPoints.reduce((a, b) => a + b, 0) / allPoints.length) : 0;

            return {
              matchday: m,
              p1Points: parseInt(u1AtMatchday.points.replace(/\./g, '')) || 0,
              p1PointsMatchday: parseInt(u1AtMatchday.pointsMatchday.replace(/\./g, '')) || 0,
              p1Rank: u1AtMatchday.rank,
              p1Budget: parseInt(u1AtMatchday.estimatedBudget.replace(/[^0-9]/g, '')) || 0,
              p2Points: parseInt(u2AtMatchday.points.replace(/\./g, '')) || 0,
              p2PointsMatchday: parseInt(u2AtMatchday.pointsMatchday.replace(/\./g, '')) || 0,
              p2Rank: u2AtMatchday.rank,
              p2Budget: parseInt(u2AtMatchday.estimatedBudget.replace(/[^0-9]/g, '')) || 0,
              averagePoints
            };
          } catch (e) {
            return null;
          }
        });

        const historyResults = (await Promise.all(historyPromises)).filter(Boolean);
        
        if (!historyResults.find(h => h.matchday === latestData.matchday)) {
            const latestPoints = allUsersFlat.map(u => parseInt(u.pointsMatchday.replace(/\./g, '')) || 0);
            const latestAvg = latestPoints.length ? Math.round(latestPoints.reduce((a,b) => a+b, 0) / latestPoints.length) : 0;

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
                averagePoints: latestAvg
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
  }, [id1, id2]);

  const stats = useMemo(() => {
    if (history.length === 0) return null;
    
    const p1Avg = history.reduce((acc, h) => acc + h.p1PointsMatchday, 0) / history.length;
    const p1Best = Math.max(...history.map(h => h.p1PointsMatchday));
    const p1AvgBudget = history.reduce((acc, h) => acc + h.p1Budget, 0) / history.length;
    const p1PointsPerMio = p1AvgBudget > 0 ? (p1Avg / (p1AvgBudget / 1000000)).toFixed(2).replace('.', ',') : '0,00';
    
    const p2Avg = history.reduce((acc, h) => acc + h.p2PointsMatchday, 0) / history.length;
    const p2Best = Math.max(...history.map(h => h.p2PointsMatchday));
    const p2AvgBudget = history.reduce((acc, h) => acc + h.p2Budget, 0) / history.length;
    const p2PointsPerMio = p2AvgBudget > 0 ? (p2Avg / (p2AvgBudget / 1000000)).toFixed(2).replace('.', ',') : '0,00';

    return {
      p1Avg: Math.round(p1Avg),
      p1Best,
      p1PointsPerMio,
      p2Avg: Math.round(p2Avg),
      p2Best,
      p2PointsPerMio
    };
  }, [history]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1115] flex flex-col justify-center items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#ff5c3e] border-t-transparent rounded-full animate-spin"></div>
        <div className="text-gray-500 font-bold tracking-widest uppercase text-xs">Lade Duell...</div>
      </div>
    );
  }

  if (!user1 || !user2) {
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
      
      {/* Back Button */}
      <div className="mb-8">
        <button 
          onClick={() => navigate(`/user/${id1}`)}
          className="group flex items-center gap-3 bg-[#1a1d24] border border-[#2a2e37] px-4 py-2 rounded-xl text-[#8b92a5] hover:text-white transition-all w-fit"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-wider">Zurück zur Detailseite</span>
        </button>
      </div>

      {/* Duel Header Desktop */}
      <div className="hidden sm:flex justify-between items-center bg-[#1a1d24] border border-[#2a2e37] rounded-3xl p-8 mb-10 shadow-lg relative overflow-hidden">
         <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#2a2e37] px-6 py-1 rounded-b-xl text-xs font-black tracking-widest uppercase text-gray-300 z-10">
            Head to Head
         </div>
         <div className="absolute inset-0 bg-gradient-to-r from-[#ff5c3e]/10 via-transparent to-[#3b82f6]/10 opacity-30"></div>
         
         <div className="flex items-center gap-6 z-10 w-2/5">
             <div className="w-20 h-20 rounded-2xl bg-[#0f1115] border-2 border-[#ff5c3e] flex items-center justify-center relative shadow-xl overflow-hidden shrink-0">
                <Star className="text-[#ff5c3e] opacity-20 absolute -right-3 -bottom-3 w-16 h-16 rotate-12" />
                <div className="text-3xl font-black text-[#ff5c3e] z-10">{user1.name.charAt(0)}</div>
             </div>
             <div>
                <h1 className="text-2xl font-black tracking-tight uppercase text-white">{user1.name}</h1>
                <div className="text-sm font-bold text-[#ff5c3e] uppercase tracking-widest mt-1">Rank #{user1.rank}</div>
             </div>
         </div>
         
         <div className="text-4xl font-black text-[#2a2e37] opacity-50 italic z-10">VS</div>
         
         <div className="flex items-center gap-6 z-10 w-2/5 justify-end text-right">
             <div>
                <h1 className="text-2xl font-black tracking-tight uppercase text-white">{user2.name}</h1>
                <div className="text-sm font-bold text-[#3b82f6] uppercase tracking-widest mt-1">Rank #{user2.rank}</div>
             </div>
             <div className="w-20 h-20 rounded-2xl bg-[#0f1115] border-2 border-[#3b82f6] flex items-center justify-center relative shadow-xl overflow-hidden shrink-0">
                <Star className="text-[#3b82f6] opacity-20 absolute -left-3 -bottom-3 w-16 h-16 -rotate-12" />
                <div className="text-3xl font-black text-[#3b82f6] z-10">{user2.name.charAt(0)}</div>
             </div>
         </div>
      </div>

      {/* Duel Header Mobile */}
      <div className="sm:hidden flex flex-col items-center bg-[#1a1d24] border border-[#2a2e37] rounded-3xl p-5 mb-8 shadow-lg relative overflow-hidden text-center gap-4">
         <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#2a2e37] px-4 py-0.5 rounded-b-lg text-[9px] font-black tracking-widest uppercase text-gray-300 z-10">
            Head to Head
         </div>
         <div className="absolute inset-0 bg-gradient-to-b from-[#ff5c3e]/10 via-transparent to-[#3b82f6]/10 opacity-30"></div>

         <div className="flex justify-between items-center w-full z-10 mt-3">
             <div className="flex flex-col items-center w-[40%] gap-2">
                 <div className="w-14 h-14 rounded-xl bg-[#0f1115] border-2 border-[#ff5c3e] flex items-center justify-center relative shadow-xl overflow-hidden shrink-0">
                    <div className="text-xl font-black text-[#ff5c3e] z-10">{user1.name.charAt(0)}</div>
                 </div>
                 <div>
                    <h1 className="text-[13px] font-black tracking-tight uppercase text-white leading-tight break-all">{user1.name}</h1>
                    <div className="text-[10px] font-bold text-[#ff5c3e] uppercase tracking-widest mt-0.5">Rank #{user1.rank}</div>
                 </div>
             </div>
             
             <div className="text-2xl font-black text-[#2a2e37] opacity-60 italic shrink-0 w-[20%]">VS</div>
             
             <div className="flex flex-col items-center w-[40%] gap-2">
                 <div className="w-14 h-14 rounded-xl bg-[#0f1115] border-2 border-[#3b82f6] flex items-center justify-center relative shadow-xl overflow-hidden shrink-0">
                    <div className="text-xl font-black text-[#3b82f6] z-10">{user2.name.charAt(0)}</div>
                 </div>
                 <div>
                    <h1 className="text-[13px] font-black tracking-tight uppercase text-white leading-tight break-all">{user2.name}</h1>
                    <div className="text-[10px] font-bold text-[#3b82f6] uppercase tracking-widest mt-0.5">Rank #{user2.rank}</div>
                 </div>
             </div>
         </div>
      </div>

      {/* Stats Duel View */}
      <div className="flex flex-col gap-3 sm:gap-4 mb-8">
         <DuelStatRow 
            icon={<Award />} 
            label="Gesamtpunkte" 
            val1={user1.points} 
            val2={user2.points} 
         />
         <DuelStatRow 
            icon={<Activity />} 
            label="Schnitt pro Spieltag" 
            val1={stats?.p1Avg.toLocaleString('de-DE')} 
            val2={stats?.p2Avg.toLocaleString('de-DE')} 
         />
         <DuelStatRow 
            icon={<Target />} 
            label="Bester Spieltag" 
            val1={stats?.p1Best.toLocaleString('de-DE')} 
            val2={stats?.p2Best.toLocaleString('de-DE')} 
         />
         <DuelStatRow 
            icon={<Wallet />} 
            label="Pkt. / Mio. (Effizienz)" 
            val1={stats?.p1PointsPerMio} 
            val2={stats?.p2PointsPerMio} 
         />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-4 sm:p-6 shadow-lg">
          <div className="flex justify-between items-center mb-4 sm:mb-6">
            <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-[#8b92a5]">Platzierungsverlauf</h3>
          </div>
          <div className="h-[200px] sm:h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e37" vertical={false} />
                <XAxis dataKey="matchday" stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} tickFormatter={val => `ST ${val}`} />
                <YAxis reversed stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} domain={[1, 30]} ticks={[1, 5, 10, 15, 20, 25, 30]} />
                <ReferenceArea y1={1} y2={9} fill="#4ba6ff" fillOpacity={0.12} stroke="none" />
                <ReferenceArea y1={9} y2={18} fill="#ff5c3e" fillOpacity={0.12} stroke="none" />
                <ReferenceArea y1={18} y2={30} fill="#22c55e" fillOpacity={0.12} stroke="none" />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                
                <Line type="monotone" dataKey="p1Rank" name={user1.name} stroke="#ff5c3e" strokeWidth={3} dot={<CustomizedDot />} activeDot={{ r: 8, strokeWidth: 0 }} animationDuration={1500} />
                <Line type="monotone" dataKey="p2Rank" name={user2.name} stroke="#3b82f6" strokeWidth={3} dot={<CustomizedDot />} activeDot={{ r: 8, strokeWidth: 0 }} animationDuration={1500} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-4 sm:p-6 shadow-lg">
          <div className="flex justify-between items-center mb-4 sm:mb-6">
            <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-[#8b92a5]">Spieltags-Leistung</h3>
            <div className="flex items-center">
                <button 
                  onClick={() => setShowAverage(!showAverage)}
                  className={`px-3 py-1.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase transition-all border shadow-lg ${showAverage ? 'bg-[#ff5c3e]/20 border-[#ff5c3e] text-[#ff5c3e]' : 'bg-[#20242d] border-[#2a2e37] text-[#8b92a5]'}`}
                >
                  Ø Ligaschnitt
                </button>
            </div>
          </div>
          <div className="h-[200px] sm:h-[250px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} margin={{ top: 20, right: 5, left: -25, bottom: 5 }}>
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
          </div>
        </div>
      </div>
    </div>
  );
};

const DuelStatRow = ({ icon, label, val1, val2 }) => {
    const num1 = parsePoints(val1);
    const num2 = parsePoints(val2);
    
    const p1Wins = num1 > num2;
    const p2Wins = num2 > num1;
    const isTie = num1 === num2;

    return (
        <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-4 flex items-center shadow-sm relative overflow-hidden group hover:border-[#3a3f4a] transition-all">
            
            {/* Background Color Indication (Subtle) */}
            <div className={`absolute top-0 left-0 bottom-0 w-1/2 opacity-10 transition-colors ${p1Wins ? 'bg-green-500' : p2Wins ? 'bg-red-500' : ''}`}></div>
            <div className={`absolute top-0 right-0 bottom-0 w-1/2 opacity-10 transition-colors ${p2Wins ? 'bg-green-500' : p1Wins ? 'bg-red-500' : ''}`}></div>

            <div className="w-full flex justify-between items-center relative z-10">
                {/* User 1 Value */}
                <div className={`w-[30%] text-left flex flex-col justify-center ${p1Wins ? 'text-green-500' : p2Wins ? 'text-gray-400' : 'text-gray-200'}`}>
                    <span className="text-sm sm:text-2xl font-black truncate">{val1}</span>
                    {p1Wins && <span className="text-[9px] font-bold uppercase tracking-widest mt-0.5 opacity-80 hidden sm:block">Führend</span>}
                </div>

                {/* Center Label */}
                <div className="w-[40%] flex flex-col items-center justify-center border-x border-[#2a2e37] px-2 border-opacity-50">
                    <div className="bg-[#20242d] p-1.5 rounded-lg mb-1.5 text-gray-400 group-hover:scale-110 transition-transform group-hover:text-white">
                        {React.cloneElement(icon, { size: 16 })}
                    </div>
                    <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-[#8b92a5] text-center leading-tight">
                        {label}
                    </span>
                </div>

                {/* User 2 Value */}
                <div className={`w-[30%] text-right flex flex-col justify-center ${p2Wins ? 'text-green-500' : p1Wins ? 'text-gray-400' : 'text-gray-200'}`}>
                    <span className="text-sm sm:text-2xl font-black truncate">{val2}</span>
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
      <circle cx={cx} cy={cy} r={7} fill={stroke} stroke="#1a1d24" strokeWidth={2} />
      <text x={cx} y={cy} textAnchor="middle" dy=".35em" fill="#1a1d24" fontSize={8} fontWeight="black">
        {value}
      </text>
    </g>
  );
};

export default CompareView;
