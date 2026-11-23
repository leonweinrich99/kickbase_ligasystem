import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import StatusPill from './ui/StatusPill';

// Live-Punkte der eigenen Startelf waehrend eines laufenden Spieltags (Owner-
// Wunsch 23.11.2026) - On-Demand ueber frontend/api/live-lineup.js, KEIN
// Hintergrund-Polling: Daten werden nur beim Oeffnen der Seite bzw. per
// manuellem "Aktualisieren" neu abgerufen, genau wie in der echten
// Kickbase-App unter Matches -> Aufstellungen -> Spieler.

const POSITION_LABEL = { 1: 'TW', 2: 'ABW', 3: 'MF', 4: 'ST' };

// Gleiche 3er-Klassifizierung wie der match-status-Code aus der Kickbase-API
// (0 = noch nicht gestartet, 1/8 = laeuft, 2 = beendet).
const matchPhase = (mst) => {
  if (mst === 2) return 'finished';
  if (mst === 1 || mst === 8) return 'running';
  return 'pending';
};

const PHASE_PILL = {
  running: { variant: 'green', label: 'Live' },
  finished: { variant: 'gray', label: 'Beendet' },
  pending: { variant: 'yellow', label: 'Vor Anpfiff' },
};

const KEY_EVENT_LABEL = { 1: '⚽ Tor', 4: '🟨 Gelb', 5: '🟨 2. Gelb', 6: '🟥 Rot', 8: '🔄 Eingewechselt', 9: '🔄 Ausgewechselt' };

const PlayerRow = ({ player, isOpen, onToggle }) => {
  const phase = matchPhase(player.matchStatus);
  const pill = PHASE_PILL[phase];
  const pointsPositive = (player.points ?? 0) >= 0;

  return (
    <div className="card-surface rounded-2xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#1e1e1e] transition-colors">
        <div className="w-9 h-9 rounded-lg bg-[#1f1f1f] border border-[#2e2e2e] flex items-center justify-center text-[10px] font-black text-[#8b92a5] shrink-0">
          {POSITION_LABEL[player.position] || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-100 truncate">{player.name || `Spieler ${player.playerId}`}</div>
          <div className="flex items-center gap-2 mt-1">
            <StatusPill variant={pill.variant}>{pill.label}</StatusPill>
            {phase !== 'pending' && <span className="text-[10px] text-[#8b92a5] font-bold">{player.matchDisplay}'</span>}
          </div>
        </div>
        <div className={`text-lg font-black shrink-0 ${pointsPositive ? 'text-green-400' : 'text-red-400'}`}>
          {pointsPositive ? '+' : ''}{player.points ?? 0}
        </div>
        <ChevronDown size={16} className={`text-[#4b5563] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-[#2a2a2a]">
          {player.events?.length ? (
            <div className="flex flex-col gap-1.5 mt-2">
              {player.events.map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-[#8b92a5]">
                    {e.minute}' {KEY_EVENT_LABEL[e.keyEvent] || ''}
                  </span>
                  <span className={`font-bold ${e.points >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {e.points >= 0 ? '+' : ''}{e.points}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[#626978] mt-2">Noch keine punkterelevanten Aktionen.</div>
          )}
        </div>
      )}
    </div>
  );
};

const LiveLineupPage = () => {
  const { profile } = useAuth();
  const kickbaseId = profile?.kickbaseId;
  const goBack = useBackNavigation('/account');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openPlayerId, setOpenPlayerId] = useState(null);

  const load = useCallback(async () => {
    if (!kickbaseId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const ratingsRes = await fetch('/history/manager-ratings.json');
      const ratings = await ratingsRes.json();
      const leagueKey = ratings[kickbaseId]?.league;
      if (!leagueKey) throw new Error('Liga konnte nicht ermittelt werden');

      const res = await fetch(`/api/live-lineup?userId=${kickbaseId}&leagueKey=${leagueKey}`);
      if (!res.ok) throw new Error('Live-Daten konnten nicht geladen werden');
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message || 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, [kickbaseId]);

  useEffect(() => { load(); }, [load]);

  const totalPoints = data?.players?.reduce((sum, p) => sum + (p.points || 0), 0) ?? null;

  return (
    <div className="w-full bg-[#000000] min-h-screen relative flex flex-col pb-10">
      <div className="sticky top-0 z-40 bg-[#000000]/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#2e2e2e]/50">
        <BackButton onClick={goBack} />
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
      </div>

      <div className="max-w-[600px] w-full mx-auto pt-6 pb-8 px-4 sm:px-6 flex flex-col gap-4">
        <div>
          <h2 className="text-[17px] sm:text-3xl font-black tracking-tight uppercase leading-[1.1] break-words">Live Punkte</h2>
          <p className="text-sm text-[#8b92a5] mt-1">
            {data ? `Spieltag ${data.matchday}${totalPoints != null ? ` · ${totalPoints} Punkte bisher` : ''}` : 'Deine Startelf im aktuellen Spieltag'}
          </p>
        </div>

        {loading && !data && (
          <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
        )}

        {error && (
          <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400">{error}</div>
        )}

        {!loading && !error && data?.players?.length === 0 && (
          <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#8b92a5]">
            {data.note || 'Keine Startelf-Daten verfügbar.'}
          </div>
        )}

        {data?.players?.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {data.players.map((p) => (
              <PlayerRow
                key={p.playerId}
                player={p}
                isOpen={openPlayerId === p.playerId}
                onToggle={() => setOpenPlayerId(openPlayerId === p.playerId ? null : p.playerId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveLineupPage;
