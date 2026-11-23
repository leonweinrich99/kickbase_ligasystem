import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import PositionRow from './ui/PositionRow';

// Live-Punkte der eigenen Startelf waehrend eines laufenden Spieltags (Owner-
// Wunsch 23.11.2026) - On-Demand ueber frontend/api/live-lineup.js, KEIN
// Hintergrund-Polling: Daten werden nur beim Oeffnen der Seite bzw. per
// manuellem "Aktualisieren" neu abgerufen.
//
// Nutzt BEWUSST dasselbe Spielfeld-Design wie die "Startelf"-Sektion im
// Mannschaftsprofil (siehe UserDetail.jsx: radialer Feld-Hintergrund +
// PositionRow/PlayerPhotoCard in ST->MF->ABW->TW-Reihen) statt einer eigenen
// Listenansicht (Owner-Feedback 23.11.2026, "Kader Übersicht als Startelf").
// Die Live-Punkte selbst kommen aus live-lineup.js, Name/Position/Foto aus
// der ohnehin schon vorhandenen globalen Spielerdatenbank (all_players.json).

const buildLineupWithDummies = (players) => {
  const lineup = [...players];
  let twCount = lineup.filter((p) => p.position === 1).length;
  let awCount = lineup.filter((p) => p.position === 2).length;
  let mfCount = lineup.filter((p) => p.position === 3).length;
  let stCount = lineup.filter((p) => p.position === 4).length;

  let dummyIndex = 1;
  while (lineup.length < 11) {
    const dummy = { id: 'dummy-' + dummyIndex++, isDummy: true, name: 'Unbekannt', lastName: 'Unbekannt', liveScore: null, imagePath: null };
    if (twCount < 1) { dummy.position = 1; twCount++; }
    else if (awCount < 3) { dummy.position = 2; awCount++; }
    else if (mfCount < 3) { dummy.position = 3; mfCount++; }
    else if (stCount < 2) { dummy.position = 4; stCount++; }
    else if (mfCount < 5) { dummy.position = 3; mfCount++; }
    else { dummy.position = 4; stCount++; }
    lineup.push(dummy);
  }
  return lineup;
};

const LiveLineupPage = () => {
  const { profile } = useAuth();
  const kickbaseId = profile?.kickbaseId;
  const goBack = useBackNavigation('/account');

  const [data, setData] = useState(null);
  const [playerMap, setPlayerMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
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
      const map = new Map(allPlayers.map((p) => [String(p.i), p]));
      setPlayerMap(map);

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
          liveScore: p.points ?? 0,
          imagePath: full?.pim || null,
        };
      });
    return buildLineupWithDummies(enriched);
  }, [data, playerMap]);

  const totalPoints = data?.players?.reduce((sum, p) => sum + (p.points || 0), 0) ?? null;

  const st = lineup?.filter((p) => p.position === 4) || [];
  const mf = lineup?.filter((p) => p.position === 3 || p.position === 0) || [];
  const aw = lineup?.filter((p) => p.position === 2) || [];
  const tw = lineup?.filter((p) => p.position === 1) || [];

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

      <div className="max-w-[1400px] w-full mx-auto pt-6 sm:pt-8 pb-8 px-4 sm:px-6">
        <div className="mb-3">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-tight">Live Punkte</h2>
          <p className="text-[#8b92a5] font-medium text-sm mt-1">
            {data ? `Spieltag ${data.matchday}${totalPoints != null ? ` · ${totalPoints} Punkte bisher` : ''}` : 'Deine Startelf im aktuellen Spieltag'}
          </p>
        </div>

        {loading && !data && (
          <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
        )}

        {error && (
          <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400 mt-4">{error}</div>
        )}

        {!loading && !error && data?.players?.length === 0 && (
          <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#8b92a5] mt-4">
            {data.note || 'Keine Startelf-Daten verfügbar.'}
          </div>
        )}

        {lineup && (
          <div
            className="rounded-2xl overflow-hidden relative min-h-[500px] sm:min-h-[600px] flex flex-col justify-center py-6 sm:py-8 mt-4 shadow-2xl"
            style={{ backgroundImage: 'radial-gradient(circle at center, #1a1a1a 0%, #050505 100%)' }}
          >
            <div className="absolute inset-0 pointer-events-none opacity-5 border border-white rounded-lg m-4 sm:m-6">
              <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-32 sm:h-32 border border-white rounded-full"></div>
            </div>

            <div className="relative z-10 w-full px-2 sm:px-4 h-full flex flex-col justify-between">
              <PositionRow players={st} />
              <PositionRow players={mf} />
              <PositionRow players={aw} />
              <PositionRow players={tw} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveLineupPage;
