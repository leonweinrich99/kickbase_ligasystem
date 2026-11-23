import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Radio } from 'lucide-react';
import { useAuth } from './AuthContext';
import ManagerAvatar from './ui/ManagerAvatar';
import PageHeader from './ui/PageHeader';
import { pointColor } from './ui/LivePlayerCircle';
import LiveLineupPitch from './ui/LiveLineupGrid';
import { buildLineupWithDummies, buildTeamLogoMap } from './liveLineupUtils';

// Live-Punkte waehrend eines laufenden Spieltags (Owner-Wunsch 23.11.2026) -
// On-Demand ueber frontend/api/live-lineup.js + live-ranking.js + live-team.js,
// KEIN Hintergrund-Polling: Daten werden nur beim Oeffnen der Seite bzw. per
// manuellem "Aktualisieren" neu abgerufen.
//
// Eigener Haupt-Tab statt Account-Unterseite (Owner-Wunsch 24.11.2026:
// "als extra Tab unten vor der Liga machen... beim Live immer zuerst den
// eigenen Kader... ueber einen Button zu den anderen Spielern schalten
// koennen oder auch auf gesamte Teams"). Design uebernimmt bewusst exakt den
// Haupt-Seiten-Rhythmus von Account/Pokal (PageHeader, p-4 sm:p-10,
// card-surface-Listen) statt der frueheren eigenstaendigen Optik mit
// Sticky-Back-Header, damit sich der neue Tab nicht wie ein Fremdkoerper
// anfuehlt.
//
// Drei Modi ueber einen Segment-Umschalter:
// - "own": der eigene Kader - IMMER die Default-Ansicht beim Oeffnen.
// - "managers": Live-Ranking der Liga, Klick auf eine Zeile zeigt deren Startelf.
// - "teams": Wettbewerb + echtes Fussball-Team waehlen (unabhaengig von der
//   eigenen Kickbase-Liga) - produktiv gemachte Version des fruehereren
//   "Test: Live-Spiel La Liga"-Bausteins.
const COMPETITIONS = [
  { id: '1', name: 'Bundesliga' },
  { id: '3', name: 'La Liga' },
  { id: '9', name: 'MLS' },
];

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

const ModeSwitch = ({ mode, onChange }) => (
  <div className="flex gap-2 bg-[#171717] border border-[#2e2e2e] rounded-xl p-1 mb-5 overflow-x-auto no-scrollbar">
    {[
      { id: 'own', label: 'Mein Kader' },
      { id: 'managers', label: 'Liga-Manager' },
      { id: 'teams', label: 'Echte Teams' },
    ].map((opt) => (
      <button
        key={opt.id}
        onClick={() => onChange(opt.id)}
        className={`px-4 py-2 rounded-lg whitespace-nowrap text-xs font-bold transition-all flex-1 ${mode === opt.id ? 'bg-white text-black' : 'text-[#8b92a5] hover:text-white'}`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const LiveLineupPage = () => {
  const { profile } = useAuth();
  const kickbaseId = profile?.kickbaseId;

  const [mode, setMode] = useState('own');

  const [leagueKey, setLeagueKey] = useState(null);
  const [playerMap, setPlayerMap] = useState(null);
  const [teamLogoMap, setTeamLogoMap] = useState(null);
  const [setupError, setSetupError] = useState(null);

  const [ranking, setRanking] = useState(null);
  const [matchday, setMatchday] = useState(null);

  // "own": immer die Default-Ansicht (Owner-Wunsch 24.11.2026).
  const [ownData, setOwnData] = useState(null);
  const [ownLoading, setOwnLoading] = useState(true);

  // "managers": Startelf eines ANDEREN Liga-Managers, erst nach Auswahl in der RankingList.
  const [selectedManagerId, setSelectedManagerId] = useState(null);
  const [managerData, setManagerData] = useState(null);
  const [managerLoading, setManagerLoading] = useState(false);

  // "teams": Wettbewerb + echtes Team waehlen.
  const [competitionId, setCompetitionId] = useState('1');
  const [teamsList, setTeamsList] = useState(null);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState(null);

  // Lineup-Daten fuer EINEN Kickbase-Manager laden (Startelf + Live-Punkte pro Spieler).
  const loadLineup = useCallback(async (league, userId) => {
    const res = await fetch(`/api/live-lineup?userId=${userId}&leagueKey=${league}`);
    if (!res.ok) throw new Error('Live-Daten konnten nicht geladen werden');
    return res.json();
  }, []);

  // Grundsetup: Liga ermitteln, Spieler-/Vereinswappen-Nachschlagewerk laden,
  // Ranking + eigenen Kader EINMAL beim Oeffnen abrufen.
  const loadAll = useCallback(async () => {
    if (!kickbaseId) { setOwnLoading(false); return; }
    setOwnLoading(true);
    setSetupError(null);
    try {
      const [ratingsRes, playersRes] = await Promise.all([
        fetch('/history/manager-ratings.json'),
        fetch('/history/all_players.json'),
      ]);
      const ratings = await ratingsRes.json();
      const allPlayers = await playersRes.json();
      setPlayerMap(new Map(allPlayers.map((p) => [String(p.i), p])));
      setTeamLogoMap(buildTeamLogoMap(allPlayers));

      const league = ratings[kickbaseId]?.league;
      if (!league) throw new Error('Liga konnte nicht ermittelt werden');
      setLeagueKey(league);

      const rankingRes = await fetch(`/api/live-ranking?userId=${kickbaseId}&leagueKey=${league}`);
      if (rankingRes.ok) {
        const rankingJson = await rankingRes.json();
        setRanking(rankingJson.ranking || []);
        setMatchday(rankingJson.matchday);
      }

      const lineupJson = await loadLineup(league, kickbaseId);
      setOwnData(lineupJson);
    } catch (e) {
      setSetupError(e.message || 'Unbekannter Fehler');
    } finally {
      setOwnLoading(false);
    }
  }, [kickbaseId, loadLineup]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectManager = useCallback(async (userId) => {
    if (!leagueKey || (userId === selectedManagerId && managerData)) return;
    setSelectedManagerId(userId);
    setManagerLoading(true);
    try {
      const lineupJson = await loadLineup(leagueKey, userId);
      setManagerData(lineupJson);
    } catch {
      setManagerData(null);
    } finally {
      setManagerLoading(false);
    }
  }, [leagueKey, selectedManagerId, managerData, loadLineup]);

  // Teamliste laden, sobald der "Echte Teams"-Modus den Wettbewerb wechselt.
  useEffect(() => {
    if (mode !== 'teams') return;
    let cancelled = false;
    setTeamsLoading(true);
    setSelectedTeamId(null);
    setTeamData(null);
    fetch(`/api/live-teams-list?competitionId=${competitionId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((json) => { if (!cancelled) setTeamsList(json?.teams || []); })
      .catch(() => { if (!cancelled) setTeamsList([]); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
  }, [mode, competitionId]);

  const selectTeam = useCallback(async (teamId) => {
    setSelectedTeamId(teamId);
    setTeamLoading(true);
    setTeamError(null);
    try {
      const res = await fetch(`/api/live-team?competitionId=${competitionId}&teamId=${teamId}`);
      if (!res.ok) throw new Error('Team-Daten konnten nicht geladen werden');
      const json = await res.json();
      setTeamData(json);
    } catch (e) {
      setTeamError(e.message || 'Unbekannter Fehler');
      setTeamData(null);
    } finally {
      setTeamLoading(false);
    }
  }, [competitionId]);

  // Gemeinsame Anreicherung: live-lineup.js-Rohdaten -> Name/Position/Foto aus
  // all_players.json + Vereinswappen - identisch fuer "own" und "managers".
  const enrichKickbaseLineup = useCallback((data) => {
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
          teamLogo: teamLogoMap?.get(String(p.teamId)) || null,
          opponentLogo: teamLogoMap?.get(String(p.opponentTeamId)) || null,
          goalsFor: p.goalsFor,
          goalsAgainst: p.goalsAgainst,
          matchStatus: p.matchStatus,
          matchMinute: p.matchMinute,
        };
      });
    return buildLineupWithDummies(enriched);
  }, [playerMap, teamLogoMap]);

  const ownLineup = useMemo(() => enrichKickbaseLineup(ownData), [ownData, enrichKickbaseLineup]);
  const ownTotalPoints = ownData?.players?.reduce((sum, p) => sum + (p.points || 0), 0) ?? null;

  const managerLineup = useMemo(() => enrichKickbaseLineup(managerData), [managerData, enrichKickbaseLineup]);
  const managerTotalPoints = managerData?.players?.reduce((sum, p) => sum + (p.points || 0), 0) ?? null;
  const selectedManagerName = ranking?.find((r) => r.userId === selectedManagerId)?.name;

  const teamLineup = useMemo(() => {
    if (!teamData?.players?.length) return null;
    const enriched = teamData.players.map((p) => ({
      id: p.id,
      position: p.position || 3,
      name: p.name,
      lastName: p.name,
      points: p.points ?? 0,
      imagePath: p.imagePath || null,
      events: p.events || [],
      teamLogo: p.teamLogo || null,
      opponentLogo: p.opponentLogo || null,
      goalsFor: p.goalsFor,
      goalsAgainst: p.goalsAgainst,
      matchStatus: p.matchStatus,
      matchMinute: p.matchMinute,
    }));
    return buildLineupWithDummies(enriched);
  }, [teamData]);
  const teamTotalPoints = teamData?.players?.reduce((sum, p) => sum + (p.points || 0), 0) ?? null;

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-[700px] mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-[#ef4444]/10 flex items-center justify-center shrink-0">
              <Radio size={22} className="text-[#ef4444]" strokeWidth={2.5} />
            </div>
            <PageHeader eyebrow={matchday ? `SPIELTAG ${matchday} · LIVE` : 'LIVE'} accentColor="#ef4444" title="Live Punkte" />
          </div>
          <button
            onClick={loadAll}
            disabled={ownLoading}
            className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={13} className={ownLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <ModeSwitch mode={mode} onChange={setMode} />

        {setupError && (
          <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400 mb-4">{setupError}</div>
        )}

        {mode === 'own' && (
          <>
            {ownLoading ? (
              <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
            ) : !kickbaseId ? (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#8b92a5]">
                Verbinde zuerst deinen Kickbase-Account in deinem Profil.
              </div>
            ) : ownData?.players?.length === 0 ? (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#8b92a5]">
                {ownData.note || 'Keine Startelf-Daten verfügbar.'}
              </div>
            ) : ownLineup ? (
              <LiveLineupPitch lineup={ownLineup} totalPoints={ownTotalPoints} />
            ) : null}
          </>
        )}

        {mode === 'managers' && (
          <>
            {ranking && ranking.length > 0 ? (
              <RankingList ranking={ranking} selectedUserId={selectedManagerId} onSelect={selectManager} />
            ) : (
              <div className="text-center text-[#8b92a5] text-sm py-6">Lade Liga-Ranking…</div>
            )}

            {selectedManagerName && (
              <div className="mt-6 mb-3 text-sm font-bold text-gray-300">
                Startelf: <span className="text-white">{selectedManagerName}</span>
              </div>
            )}

            {managerLoading && (
              <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
            )}
            {!managerLoading && managerLineup && (
              <LiveLineupPitch lineup={managerLineup} totalPoints={managerTotalPoints} />
            )}
          </>
        )}

        {mode === 'teams' && (
          <>
            <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
              {COMPETITIONS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCompetitionId(c.id)}
                  className={`px-4 py-2 rounded-full whitespace-nowrap text-xs font-bold border transition-colors ${competitionId === c.id ? 'bg-[#ff5c3e]/15 border-[#ff5c3e] text-white' : 'border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {teamsLoading ? (
              <div className="text-center text-[#8b92a5] text-sm py-6">Lade Teams…</div>
            ) : teamsList && teamsList.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                {teamsList.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTeam(t.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors ${selectedTeamId === t.id ? 'bg-[#1e1e1e] border-[#ff5c3e]' : 'border-[#2e2e2e] hover:border-[#8b92a5]'}`}
                  >
                    {t.logo ? (
                      <img src={t.logo} alt="" className="w-7 h-7 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-[#202020]" />
                    )}
                    <span className="text-[10px] font-bold text-gray-300 text-center truncate w-full">{t.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center text-[#8b92a5] text-sm py-6">Keine Teams gefunden.</div>
            )}

            {teamError && (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400 mb-4">{teamError}</div>
            )}

            {teamData && (
              <div className="mb-3 text-sm font-bold text-gray-300">
                {teamData.teamName} · {teamData.score} {teamData.isLive ? `· LIVE ${teamData.minute}'` : ''}
              </div>
            )}

            {teamLoading && (
              <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
            )}
            {!teamLoading && teamLineup && (
              <LiveLineupPitch lineup={teamLineup} totalPoints={teamTotalPoints} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LiveLineupPage;
