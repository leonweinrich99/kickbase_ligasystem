import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Zeigt die Auswertungen des "Kickbase Trading Advisor" an (siehe
// backend/advisor/, generiert per GitHub Action aus
// frontend/public/advisor-data.json). Basiert auf dem Open-Source-Tool
// https://github.com/LennardFe/Kickbase-Trading-Advisor von LennardFe,
// angepasst auf unser 3-Ligen-System.

const LEAGUE_COLORS = {
  LIGA1: '#3b82f6',
  LIGA2: '#f97316',
  LIGA3: '#22c55e',
};

const formatMoney = (val) => {
  if (val === null || val === undefined) return '–';
  return Math.round(val).toLocaleString('de-DE') + ' €';
};

const formatSignedMoney = (val) => {
  if (val === null || val === undefined) return '–';
  const rounded = Math.round(val);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('de-DE')} €`;
};

const StatCard = ({ label, value, accent = '#22d3ee' }) => (
  <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-4 flex-1 min-w-[120px]">
    <div className="text-[9px] font-black uppercase tracking-widest text-[#8b92a5] mb-1">{label}</div>
    <div className="text-xl font-black" style={{ color: accent }}>{value}</div>
  </div>
);

const BudgetRow = ({ entry, rank, color }) => (
  <div className="flex items-center p-3 mb-2.5 bg-[#171717] border border-[#2e2e2e] rounded-[14px] shadow-sm">
    <div className="w-8 flex justify-center items-center text-xs font-bold text-[#8b92a5] shrink-0">{rank}</div>
    <div className="ml-2 flex-1 min-w-0">
      <div className="text-[15px] font-bold text-gray-100 truncate">{entry.manager}</div>
      <div className="text-[10px] text-[#8b92a5] mt-0.5">Teamwert: {formatMoney(entry.teamValue)}</div>
    </div>
    <div className="text-right ml-2 shrink-0">
      <div className="text-[15px] font-bold" style={{ color }}>{formatMoney(entry.budget)}</div>
      <div className="text-[9px] font-bold text-[#626978] tracking-widest mt-0.5 uppercase">Budget (geschätzt)</div>
      {typeof entry.availableBudget === 'number' && (
        <div className="text-[10px] text-[#8b92a5] mt-1">Verfügbar (inkl. Dispo): {formatMoney(entry.availableBudget)}</div>
      )}
    </div>
  </div>
);

const MarketRow = ({ entry }) => {
  const rising = (entry.predictedChange || 0) >= 0;
  return (
    <div className="flex items-center p-3 mb-2.5 bg-[#171717] border border-[#2e2e2e] rounded-[14px] shadow-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[15px] font-bold text-gray-100 truncate">{entry.name}</div>
          {entry.expiringToday && (
            <span className="text-[8px] font-black uppercase tracking-widest bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded-full px-1.5 py-0.5 shrink-0">Läuft heute ab</span>
          )}
        </div>
        <div className="text-[10px] text-[#8b92a5] mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{entry.team}</span>
          <span>·</span>
          <span>{formatMoney(entry.marketValue)}</span>
          {typeof entry.startElfProbability === 'number' && (
            <>
              <span>·</span>
              <span>Startelf-Wahrsch.: {Math.round(entry.startElfProbability * 100)}%</span>
            </>
          )}
          {typeof entry.hoursToExpiry === 'number' && (
            <>
              <span>·</span>
              <span>Noch {entry.hoursToExpiry}h im Angebot</span>
            </>
          )}
        </div>
      </div>
      <div className={`text-right ml-2 shrink-0 font-black text-[15px] ${rising ? 'text-green-400' : 'text-red-400'}`}>
        {rising ? '▲' : '▼'} {formatSignedMoney(entry.predictedChange)}
      </div>
    </div>
  );
};

const Advisor = () => {
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [activeLeague, setActiveLeague] = useState('LIGA1');

  useEffect(() => {
    fetch(`/advisor-data.json?t=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
        <div className="text-center bg-[#171717] border border-[#2e2e2e] rounded-2xl p-8">
          <h1 className="text-lg font-black text-white uppercase mb-3">Kein Zugriff</h1>
          <p className="text-sm text-[#8b92a5] mb-6">Diese Seite ist nur für Admins.</p>
          <Link to="/" className="text-[#ff5c3e] text-sm font-bold uppercase tracking-widest">Zurück zum Ligasystem</Link>
        </div>
      </div>
    );
  }

  const league = data?.leagues?.[activeLeague];
  const generatedAt = data?.generatedAt ? new Date(data.generatedAt) : null;

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-cyan-400 mb-1">ADMIN</div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase text-white">Trading Advisor</h1>
          </div>
          <Link
            to="/admin"
            aria-label="Schließen"
            className="w-10 h-10 shrink-0 flex items-center justify-center bg-[#171717] border border-[#2e2e2e] rounded-xl text-[#8b92a5] hover:text-white hover:border-[#404040] transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </Link>
        </div>

        <p className="text-xs text-[#8b92a5] mb-6 -mt-3">
          Budget-Schätzungen & Marktwert-Prognosen, basierend auf dem Open-Source-Tool{' '}
          <a href="https://github.com/LennardFe/Kickbase-Trading-Advisor" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Kickbase-Trading-Advisor</a>{' '}
          von LennardFe. Läuft täglich automatisch, alle Werte sind Schätzungen ohne Gewähr.
        </p>

        {error && (
          <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-6 text-center text-sm text-[#8b92a5] mb-6">
            Noch keine Auswertung vorhanden. Klicke im Admin Panel auf „Trading Advisor jetzt aktualisieren", um sie einmalig zu erzeugen.
          </div>
        )}

        {!error && !data && (
          <div className="text-center text-[#8b92a5] text-sm py-10">Lade Auswertung...</div>
        )}

        {data && (
          <>
            <div className="flex flex-wrap gap-3 mb-6">
              <StatCard
                label="Zuletzt aktualisiert"
                value={generatedAt ? generatedAt.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–'}
                accent="#8b92a5"
              />
              {data.modelStats && (
                <>
                  <StatCard label="Richtungstreffer" value={`${data.modelStats.signsCorrectPercent}%`} accent="#22d3ee" />
                  <StatCard label="Trainingsdaten" value={data.modelStats.trainSamples} accent="#8b92a5" />
                </>
              )}
            </div>

            <div className="flex gap-2 mb-6 overflow-x-auto">
              {Object.keys(data.leagues || {}).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveLeague(key)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex items-center gap-2 ${activeLeague === key ? 'bg-white text-black' : 'bg-[#171717] border border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LEAGUE_COLORS[key] }}></span>
                  {data.leagues[key].name}
                </button>
              ))}
            </div>

            {league && (
              <>
                <h2 className="text-[1.2rem] font-black text-[#f8fafc] mb-4 tracking-tight uppercase">Manager-Budgets (geschätzt)</h2>
                {league.budgets?.length ? (
                  <div className="mb-10">
                    {league.budgets.map((entry, index) => (
                      <BudgetRow key={entry.manager} entry={entry} rank={index + 1} color={LEAGUE_COLORS[activeLeague]} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-[#8b92a5] text-sm py-6 mb-10">Keine Budget-Daten für diese Liga verfügbar.</div>
                )}

                <h2 className="text-[1.2rem] font-black text-[#f8fafc] mb-4 tracking-tight uppercase">Markt-Empfehlungen</h2>
                {league.marketRecommendations?.length ? (
                  <div>
                    {league.marketRecommendations.map((entry, index) => (
                      <MarketRow key={`${entry.name}-${index}`} entry={entry} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-[#8b92a5] text-sm py-6">Aktuell keine Spieler auf dem Markt mit vielversprechender Marktwert-Prognose.</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Advisor;
