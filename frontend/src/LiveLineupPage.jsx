import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import ManagerAvatar from './ui/ManagerAvatar';
import { pointColor } from './ui/LivePlayerCircle';
import LiveLineupPitch from './ui/LiveLineupGrid';
import { buildLineupWithDummies } from './liveLineupUtils';

// Live-Punkte waehrend eines laufenden Spieltags (Owner-Wunsch 23.11.2026) -
// On-Demand ueber frontend/api/live-lineup.js + live-ranking.js, KEIN
// Hintergrund-Polling: Daten werden nur beim Oeffnen der Seite bzw. per
// manuellem "Aktualisieren" neu abgerufen.
//
// Zwei Teile:
// 1. Live-Ranking der ganzen Liga (analog "LEADERBOARD LIVE" in der echten
//    App) - EIN guenstiger teamcenter-Call liefert alle Manager auf einmal
//    (siehe live-ranking.js), kein Playercenter-Call pro Spieler noetig.
// 2. Startelf-Ansicht des gerade ausgewaehlten Managers (Klick auf eine
//    Ranking-Zeile wechselt die Auswahl) - Darstellung aus ui/LiveLineupGrid.jsx
//    (gemeinsam mit UserDetail.jsx genutzt, damit Design UND Zahlen an
//    beiden Stellen immer identisch sind).

const RankingList = ({ ranking, selectedUserId, onSelect }) => (
  <div className="card-surface rounded-2xl overflow-hidden divide-y divide-[#2a2a2a]">
    {ranking.map((r, i) => {
      const isSelected = r.userId === selectedUserId;
      return (
        <button
          key={r.userId}
          onClick={() => onSelect(r.userId)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected ? 'bg-[#1e1e1e]' : 'hover:bg-[#171717]'}`}
        >
          <span className="text-xs font-black text-[#626978] w-5 shrink-0">{i + 1}</span>
          <ManagerAvatar name={r.name} size={32} ringColor={isSelected ? '#ff5c3e' : undefined} />
          <span className="text-sm font-bold text-gray-100 flex-1 truncate">{r.name}</span>
          <span className={`text-base font-black ${pointColor(r.livePoints)}`}>{r.livePoints}</span>
        </button>
      );
    })}
  </div>
);

const LiveLineupPage = () => {
  const { profile } = useAuth();
  const kickbaseId = profile?.kickbaseId;
  const goBack = useBackNavigation('/account');

  const [leagueKey, setLeagueKey] = useState(null);
  const [playerMap, setPlayerMap] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [data, setData] = useState(null);
  const [matchday, setMatchday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // TEST-Baustein (Owner-Wunsch 23.11.2026, "Test mit Live-Daten zum
  // aktuellen Spiel in der La Liga... baue das kurz in die App ein um das zu
  // ueberpruefen"): zeigt statt eines weiteren Kickbase-Managers den Kader
  // eines ECHTEN Fussball-Teams mit Live-Punkten - beweist, dass derselbe
  // Mechanismus auch ausserhalb Bundesliga/Kickbase-Fantasy funktioniert
  // (siehe frontend/api/live-team.js). Bewusst deutlich als Test markiert,
  // kein fester Bestandteil der normalen Ansicht.
  const [testTeam, setTestTeam] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState(null);

  const loadTestTeam = useCallback(async () => {
    setTestLoading(true);
    setTestError(null);
    try {
      const res = await fetch('/api/live-team?competitionId=3');
      if (!res.ok) throw new Error('Test-Daten konnten nicht geladen werden');
      const json = await res.json();
      setTestTeam(json);
    } catch (e) {
      setTestError(e.message || 'Unbekannter Fehler');
    } finally {
      setTestLoading(false);
    }
  }, []);

  const testLineup = useMemo(() => {
    if (!testTeam?.players?.length) return null;
    const enriched = testTeam.players.map((p) => ({
      id: p.id,
      position: p.position || 3,
      name: p.name,
      lastName: p.name,
      points: p.points ?? 0,
      imagePath: p.imagePath || null,
      events: p.events || [],
    }));
    return buildLineupWithDummies(enriched);
  }, [testTeam]);
  const testTotalPoints = testTeam?.players?.reduce((sum, p) => sum + (p.points || 0), 0) ?? null;

  // Lineup-Daten fuer EINEN Manager laden (Startelf + Live-Punkte pro Spieler).
  const loadLineup = useCallback(async (league, userId) => {
    const res = await fetch(`/api/live-lineup?userId=${userId}&leagueKey=${league}`);
    if (!res.ok) throw new Error('Live-Daten konnten nicht geladen werden');
    return res.json();
  }, []);

  const loadAll = useCallback(async () => {
    if (!kickbaseId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [ratingsRes, playersRes] = await Promise.all([
        fetch('/history/manager-ratings.json'),
        fetch('/history/all_players.json'),
      ]);
      const ratings = await ratingsRes.json();
      const allPlayers = await playersRes.json();
      setPlayerMap(new Map(allPlayers.map((p) => [String(p.i), p])));

      const league = ratings[kickbaseId]?.league;
      if (!league) throw new Error('Liga konnte nicht ermittelt werden');
      setLeagueKey(league);

      const rankingRes = await fetch(`/api/live-ranking?userId=${kickbaseId}&leagueKey=${league}`);
      if (!rankingRes.ok) throw new Error('Live-Ranking konnte nicht geladen werden');
      const rankingJson = await rankingRes.json();
      setRanking(rankingJson.ranking || []);
      setMatchday(rankingJson.matchday);

      const target = selectedUserId || kickbaseId;
      setSelectedUserId(target);
      const lineupJson = await loadLineup(league, target);
      setData(lineupJson);
    } catch (e) {
      setError(e.message || 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kickbaseId, loadLineup]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectManager = useCallback(async (userId) => {
    if (!leagueKey || userId === selectedUserId) return;
    setSelectedUserId(userId);
    setLoading(true);
    setError(null);
    try {
      const lineupJson = await loadLineup(leagueKey, userId);
      setData(lineupJson);
    } catch (e) {
      setError(e.message || 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, [leagueKey, selectedUserId, loadLineup]);

  const lineup = useMemo(() => {
    if (!data?.players?.length || !playerMap) return null;
    const enriched = data.players
      .filter((p) => !p.error)
      .map((p) => {
        const full = playerMap.get(String(p.playerId));
        return {
          id: p.playerId,
          position: full?.pos || 3,
          name: full ? `${full.fn || ''} ${full.ln || ''}`.trim() : p.name,
          lastName: full?.ln || p.name,
          points: p.points ?? 0,
          imagePath: full?.pim || null,
          events: p.events || [],
        };
      });
    return buildLineupWithDummies(enriched);
  }, [data, playerMap]);

  const totalPoints = data?.players?.reduce((sum, p) => sum + (p.points || 0), 0) ?? null;
  const selectedName = ranking?.find((r) => r.userId === selectedUserId)?.name;

  return (
    <div className="w-full bg-[#000000] min-h-screen relative flex flex-col pb-10">
      <div className="sticky top-0 z-40 bg-[#000000]/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#2e2e2e]/50">
        <BackButton onClick={goBack} />
        <button
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
      </div>

      <div className="max-w-[1400px] w-full mx-auto pt-6 sm:pt-8 pb-8 px-4 sm:px-6">
        <div className="mb-3">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-tight">Live Punkte</h2>
          <p className="text-[#8b92a5] font-medium text-sm mt-1">
            {matchday ? `Spieltag ${matchday} · Liga-Ranking live` : 'Live-Ranking deiner Liga'}
          </p>
        </div>

        {loading && !ranking && (
          <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
        )}

        {error && (
          <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400 mt-4">{error}</div>
        )}

        {ranking && ranking.length > 0 && (
          <RankingList ranking={ranking} selectedUserId={selectedUserId} onSelect={selectManager} />
        )}

        {selectedName && (
          <div className="mt-6 mb-3 text-sm font-bold text-gray-300">
            Startelf: <span className="text-white">{selectedName}</span>
          </div>
        )}

        {!loading && !error && data?.players?.length === 0 && (
          <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#8b92a5] mt-4">
            {data.note || 'Keine Startelf-Daten verfügbar.'}
          </div>
        )}

        {lineup && <LiveLineupPitch lineup={lineup} totalPoints={totalPoints} />}

        {/* TEST-Baustein, siehe Kommentar oben bei testTeam/loadTestTeam */}
        <div className="mt-10 pt-6 border-t border-dashed border-[#2e2e2e]">
          <button
            onClick={loadTestTeam}
            disabled={testLoading}
            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={testLoading ? 'animate-spin' : ''} />
            🧪 Test: Live-Spiel La Liga laden
          </button>
          <p className="text-[#626978] text-xs mt-1">
            Testet denselben Live-Mechanismus fuer ein echtes Fussball-Team statt eines Kickbase-Managers.
          </p>

          {testError && (
            <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400 mt-4">{testError}</div>
          )}

          {testTeam && (
            <>
              <div className="mt-4 mb-3 text-sm font-bold text-gray-300">
                {testTeam.teamName} · {testTeam.score} {testTeam.isLive ? `· LIVE ${testTeam.minute}'` : ''}
              </div>
              {testLineup && <LiveLineupPitch lineup={testLineup} totalPoints={testTotalPoints} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveLineupPage;
