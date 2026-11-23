import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, ChevronDown, Users } from 'lucide-react';
import { useAuth } from './AuthContext';
import ManagerAvatar from './ui/ManagerAvatar';
import PageHeader from './ui/PageHeader';
import AnimatedPoints from './ui/AnimatedPoints';
import LiveLineupPitch from './ui/LiveLineupGrid';
import { buildLineupWithDummies, buildTeamLogoMap } from './liveLineupUtils';
import {
  diffAndSavePoints,
  buildLineupPointsMap,
  buildRankingPointsMap,
  nextAnimId,
  readCachedSnapshot,
  saveCachedSnapshot,
} from './livePointsStore';

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

const RankingList = ({ ranking, selectedUserId, onSelect, prevPointsMap, animId }) => (
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
          <AnimatedPoints
            value={r.livePoints}
            previousValue={prevPointsMap?.[String(r.userId)]}
            animKey={animId != null ? `${animId}:rank:${r.userId}` : null}
            usePointColor
            className="text-base font-black"
            deltaPlacement="left"
          />
        </button>
      );
    })}
  </div>
);

// Kompakte Auswahl-Zeile statt dauerhaft sichtbarer Liste/Raster (Owner-
// Feedback 24.11.2026: "ich finde es nicht gut wenn man alle Manager sieht
// und dann darunter noch den Kader... beim echten Team ueber einen Button
// auswaehlen, dann soll hauptsaechlich der Kader angezeigt werden") - toggelt
// die Auswahl-Ansicht auf/zu, sobald etwas ausgewaehlt ist steht nur noch
// diese eine Zeile zwischen Umschalter und Kader.
const SelectorButton = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 card-surface rounded-2xl px-4 py-3 mb-4 hover:bg-[#171717] transition-colors"
  >
    {children}
    <ChevronDown size={16} className="text-[#626978] shrink-0" />
  </button>
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
  const [rankingPrevPoints, setRankingPrevPoints] = useState(null);
  const [rankingAnimId, setRankingAnimId] = useState(null);
  const [matchday, setMatchday] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Zwischengespeicherte Stände fuer sofortige Anzeige beim Oeffnen (kein
  // "Lade Live-Daten..."-Flackern), waehrend die frischen Werte im Hintergrund
  // geladen und danach direkt ueber die Zahlen-Animation eingeblendet werden.
  const cachedOwn = useMemo(
    () => (kickbaseId ? readCachedSnapshot(`own:${kickbaseId}`) : null),
    [kickbaseId]
  );
  const cachedRanking = useMemo(() => readCachedSnapshot('ranking'), []);

  // "own": immer die Default-Ansicht (Owner-Wunsch 24.11.2026).
  const [ownData, setOwnData] = useState(null);
  const [ownPrevPoints, setOwnPrevPoints] = useState(null);
  const [ownAnimId, setOwnAnimId] = useState(null);
  const [ownLoading, setOwnLoading] = useState(true);

  // "managers": Startelf eines ANDEREN Liga-Managers, erst nach Auswahl in der RankingList.
  // managerPickerOpen: solange true, steht die RankingList da statt des Kaders
  // (Default true - noch nichts ausgewaehlt) - danach ersetzt eine kompakte
  // SelectorButton-Zeile die Liste, der Kader bekommt den Hauptplatz.
  const [selectedManagerId, setSelectedManagerId] = useState(null);
  const [managerData, setManagerData] = useState(null);
  const [managerCached, setManagerCached] = useState(null);
  const [managerPrevPoints, setManagerPrevPoints] = useState(null);
  const [managerAnimId, setManagerAnimId] = useState(null);
  const [managerLoading, setManagerLoading] = useState(false);
  const [managerRefreshing, setManagerRefreshing] = useState(false);
  const [managerPickerOpen, setManagerPickerOpen] = useState(true);
  const managerReqRef = useRef(0);

  // "teams": Wettbewerb + echtes Team waehlen. teamsPickerOpen startet
  // geschlossen (Default false) - erst ein Button oeffnet die Auswahl, nach
  // der Teamwahl schliesst sie sich wieder automatisch.
  const [competitionId, setCompetitionId] = useState('1');
  const [teamsList, setTeamsList] = useState(null);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [teamCached, setTeamCached] = useState(null);
  const [teamPrevPoints, setTeamPrevPoints] = useState(null);
  const [teamAnimId, setTeamAnimId] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamRefreshing, setTeamRefreshing] = useState(false);
  const [teamError, setTeamError] = useState(null);
  const [teamsPickerOpen, setTeamsPickerOpen] = useState(false);
  const teamReqRef = useRef(0);

  // Lineup-Daten fuer EINEN Kickbase-Manager laden (Startelf + Live-Punkte pro Spieler).
  const loadLineup = useCallback(async (league, userId) => {
    const res = await fetch(`/api/live-lineup?userId=${userId}&leagueKey=${league}`);
    if (!res.ok) throw new Error('Live-Daten konnten nicht geladen werden');
    return res.json();
  }, []);

  // Grundsetup: Liga ermitteln, Spieler-/Vereinswappen-Nachschlagewerk laden,
  // Ranking + eigenen Kader EINMAL beim Oeffnen abrufen. Bei manuellem
  // Refresh (`silent = true`) bleibt das Spielfeld stehen, sodass sich die
  // Punktzahlen direkt an Ort und Stelle hoch-/runterzaehlen koennen.
  const loadAll = useCallback(async (silent = false) => {
    if (!kickbaseId) { setOwnLoading(false); return; }
    if (!silent) setOwnLoading(true);
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
        const nextRanking = rankingJson.ranking || [];
        const prevRank = diffAndSavePoints(
          `ranking:md${rankingJson.matchday ?? 'cur'}:${league}`,
          buildRankingPointsMap(nextRanking)
        );
        setRankingPrevPoints(prevRank);
        setRankingAnimId(nextAnimId());
        setRanking(nextRanking);
        setMatchday(rankingJson.matchday);
        saveCachedSnapshot('ranking', {
          ranking: nextRanking,
          matchday: rankingJson.matchday ?? null,
        });
      }

      const lineupJson = await loadLineup(league, kickbaseId);
      const prevOwn = diffAndSavePoints(
        `own:md${lineupJson.matchday ?? 'cur'}:${kickbaseId}`,
        buildLineupPointsMap(lineupJson.players)
      );
      setOwnPrevPoints(prevOwn);
      setOwnAnimId(nextAnimId());
      setOwnData(lineupJson);
    } catch (e) {
      setSetupError(e.message || 'Unbekannter Fehler');
    } finally {
      if (!silent) setOwnLoading(false);
    }
  }, [kickbaseId, loadLineup]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectManager = useCallback(async (userId, forceRefresh = false) => {
    setManagerPickerOpen(false);
    setSelectedManagerId(userId);
    if (!leagueKey) return;
    if (!forceRefresh && userId === selectedManagerId && managerData) return;

    const reqId = ++managerReqRef.current;
    const cached = readCachedSnapshot(`mgr:${userId}`);
    if (!forceRefresh) {
      setManagerCached(cached);
      setManagerData(null);
      setManagerPrevPoints(null);
      setManagerLoading(!cached);
    }
    setManagerRefreshing(true);
    try {
      const lineupJson = await loadLineup(leagueKey, userId);
      if (managerReqRef.current !== reqId) return;
      const prevMgr = diffAndSavePoints(
        `mgr:md${lineupJson.matchday ?? 'cur'}:${userId}`,
        buildLineupPointsMap(lineupJson.players)
      );
      setManagerPrevPoints(prevMgr);
      setManagerAnimId(nextAnimId());
      setManagerData({ ...lineupJson, _userId: userId });
    } catch {
      if (managerReqRef.current !== reqId) return;
      if (!forceRefresh && !cached) setManagerData(null);
    } finally {
      if (managerReqRef.current === reqId) {
        setManagerLoading(false);
        setManagerRefreshing(false);
      }
    }
  }, [leagueKey, selectedManagerId, managerData, loadLineup]);

  // Teamliste laden, sobald der "Echte Teams"-Modus den Wettbewerb wechselt.
  useEffect(() => {
    if (mode !== 'teams') return;
    let cancelled = false;
    setTeamsLoading(true);
    setSelectedTeamId(null);
    setTeamData(null);
    setTeamCached(null);
    setTeamPrevPoints(null);
    fetch(`/api/live-teams-list?competitionId=${competitionId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((json) => { if (!cancelled) setTeamsList(json?.teams || []); })
      .catch(() => { if (!cancelled) setTeamsList([]); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
  }, [mode, competitionId]);

  const selectTeam = useCallback(async (teamId, forceRefresh = false) => {
    setSelectedTeamId(teamId);
    setTeamsPickerOpen(false);
    setTeamError(null);

    const reqId = ++teamReqRef.current;
    const cacheKey = `team:${competitionId}:${teamId}`;
    const cached = readCachedSnapshot(cacheKey);
    if (!forceRefresh) {
      setTeamCached(cached);
      setTeamData(null);
      setTeamPrevPoints(null);
      setTeamLoading(!cached);
    }
    setTeamRefreshing(true);
    try {
      const res = await fetch(`/api/live-team?competitionId=${competitionId}&teamId=${teamId}`);
      if (!res.ok) throw new Error('Team-Daten konnten nicht geladen werden');
      const json = await res.json();
      if (teamReqRef.current !== reqId) return;
      const teamScope = json.matchId
        ? `team:m:${json.matchId}:${teamId}`
        : `team:c:${competitionId}:${teamId}`;
      const prevTeam = diffAndSavePoints(teamScope, buildLineupPointsMap(json.players));
      setTeamPrevPoints(prevTeam);
      setTeamAnimId(nextAnimId());
      setTeamData({ ...json, _cacheKey: cacheKey });
    } catch (e) {
      if (teamReqRef.current !== reqId) return;
      setTeamError(e.message || 'Unbekannter Fehler');
      if (!forceRefresh && !cached) setTeamData(null);
    } finally {
      if (teamReqRef.current === reqId) {
        setTeamLoading(false);
        setTeamRefreshing(false);
      }
    }
  }, [competitionId]);

  // Aktualisiert je nach aktivem Tab die gerade sichtbaren Live-Daten im
  // Hintergrund (ohne das Spielfeld auszublenden), damit Punktaenderungen
  // sofort animiert werden.
  const handleRefresh = useCallback(async () => {
    if (refreshing || ownLoading || managerRefreshing || teamRefreshing) return;
    setRefreshing(true);
    try {
      if (mode === 'teams') {
        if (selectedTeamId) {
          await selectTeam(selectedTeamId, true);
        }
      } else if (mode === 'managers') {
        await loadAll(true);
        if (selectedManagerId) {
          await selectManager(selectedManagerId, true);
        }
      } else {
        await loadAll(true);
      }
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, ownLoading, managerRefreshing, teamRefreshing, mode, selectedTeamId, selectedManagerId, selectTeam, selectManager, loadAll]);

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
  const displayedRanking = ranking || cachedRanking?.ranking || null;
  const displayedMatchday = matchday ?? cachedOwn?.matchday ?? cachedRanking?.matchday ?? null;
  const selectedManagerName = displayedRanking?.find((r) => r.userId === selectedManagerId)?.name;
  const selectedTeam = teamsList?.find((t) => t.id === selectedTeamId);

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

  // Frische, fertig angereicherte Aufstellungen im Cache ablegen, damit beim
  // naechsten Oeffnen sofort der letzte Stand sichtbar ist.
  useEffect(() => {
    if (kickbaseId && ownLineup && ownData) {
      saveCachedSnapshot(`own:${kickbaseId}`, {
        lineup: ownLineup,
        totalPoints: ownTotalPoints,
        matchday: ownData.matchday ?? matchday ?? null,
      });
    }
  }, [kickbaseId, ownLineup, ownTotalPoints, ownData, matchday]);

  useEffect(() => {
    if (managerData?._userId && managerLineup) {
      saveCachedSnapshot(`mgr:${managerData._userId}`, {
        lineup: managerLineup,
        totalPoints: managerTotalPoints,
        matchday: managerData.matchday ?? matchday ?? null,
      });
    }
  }, [managerData, managerLineup, managerTotalPoints, matchday]);

  useEffect(() => {
    if (teamData?._cacheKey && teamLineup) {
      saveCachedSnapshot(teamData._cacheKey, {
        lineup: teamLineup,
        totalPoints: teamTotalPoints,
        score: teamData.score ?? null,
        isLive: Boolean(teamData.isLive),
        minute: teamData.minute ?? null,
      });
    }
  }, [teamData, teamLineup, teamTotalPoints]);

  const displayedOwnLineup = ownLineup || cachedOwn?.lineup || null;
  const displayedOwnTotalPoints = ownLineup ? ownTotalPoints : (cachedOwn?.totalPoints ?? null);
  const displayedManagerLineup = managerLineup || managerCached?.lineup || null;
  const displayedManagerTotalPoints = managerLineup ? managerTotalPoints : (managerCached?.totalPoints ?? null);
  const displayedTeamLineup = teamLineup || teamCached?.lineup || null;
  const displayedTeamTotalPoints = teamLineup ? teamTotalPoints : (teamCached?.totalPoints ?? null);
  const displayedTeamMeta = teamData || teamCached || null;
  const isBusy = ownLoading || refreshing || managerRefreshing || teamRefreshing;

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10 pb-28 sm:pb-28">
      <div className="max-w-[700px] mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-[#ef4444]/10 flex items-center justify-center shrink-0">
              <span className="relative flex h-3.5 w-3.5 sm:h-4 sm:w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 sm:h-4 sm:w-4 bg-[#ef4444]"></span>
              </span>
            </div>
            <PageHeader eyebrow={displayedMatchday ? `SPIELTAG ${displayedMatchday} · LIVE` : 'LIVE'} accentColor="#ef4444" title="Live Punkte" />
          </div>
          <button
            onClick={handleRefresh}
            disabled={isBusy}
            aria-label="Live-Daten aktualisieren"
            className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={13} className={isBusy ? 'animate-spin' : ''} />
          </button>
        </div>

        <ModeSwitch mode={mode} onChange={setMode} />

        {setupError && (
          <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400 mb-4">{setupError}</div>
        )}

        {mode === 'own' && (
          <>
            {!kickbaseId ? (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#8b92a5]">
                Verbinde zuerst deinen Kickbase-Account in deinem Profil.
              </div>
            ) : ownData?.players?.length === 0 ? (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#8b92a5]">
                {ownData.note || 'Keine Startelf-Daten verfügbar.'}
              </div>
            ) : displayedOwnLineup ? (
              <LiveLineupPitch
                key={`own-${kickbaseId}`}
                lineup={displayedOwnLineup}
                totalPoints={displayedOwnTotalPoints}
                prevPointsMap={ownLineup ? ownPrevPoints : null}
                animId={ownLineup ? ownAnimId : null}
              />
            ) : ownLoading ? (
              <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
            ) : null}
          </>
        )}

        {mode === 'managers' && (
          <>
            {managerPickerOpen ? (
              displayedRanking && displayedRanking.length > 0 ? (
                <RankingList
                  ranking={displayedRanking}
                  selectedUserId={selectedManagerId}
                  onSelect={selectManager}
                  prevPointsMap={ranking ? rankingPrevPoints : null}
                  animId={ranking ? rankingAnimId : null}
                />
              ) : (
                <div className="text-center text-[#8b92a5] text-sm py-6">Lade Liga-Ranking…</div>
              )
            ) : (
              <>
                <SelectorButton onClick={() => setManagerPickerOpen(true)}>
                  <ManagerAvatar name={selectedManagerName} size={28} />
                  <span className="text-sm font-bold text-gray-100 flex-1 text-left truncate">
                    {selectedManagerName || 'Manager wählen'}
                  </span>
                </SelectorButton>

                {displayedManagerLineup ? (
                  <LiveLineupPitch
                    key={`mgr-${selectedManagerId}`}
                    lineup={displayedManagerLineup}
                    totalPoints={displayedManagerTotalPoints}
                    prevPointsMap={managerLineup ? managerPrevPoints : null}
                    animId={managerLineup ? managerAnimId : null}
                  />
                ) : managerLoading ? (
                  <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
                ) : null}
              </>
            )}
          </>
        )}

        {mode === 'teams' && (
          <>
            {teamsPickerOpen ? (
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
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
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
              </>
            ) : selectedTeam ? (
              <SelectorButton onClick={() => setTeamsPickerOpen(true)}>
                {selectedTeam.logo ? (
                  <img src={selectedTeam.logo} alt="" className="w-7 h-7 object-contain shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#202020] shrink-0" />
                )}
                <span className="text-sm font-bold text-gray-100 flex-1 text-left truncate">{selectedTeam.name}</span>
              </SelectorButton>
            ) : (
              <button
                onClick={() => setTeamsPickerOpen(true)}
                className="w-full flex items-center justify-center gap-2.5 border border-dashed border-[#ff5c3e]/40 rounded-2xl p-5 mb-4 hover:border-[#ff5c3e] transition-all active:scale-[0.98] text-[#ff5c3e] font-bold text-sm"
              >
                <Users size={18} strokeWidth={2.5} />
                Team auswählen
              </button>
            )}

            {teamError && (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400 mb-4 mt-4">{teamError}</div>
            )}

            {!teamsPickerOpen && displayedTeamMeta?.score && (
              <div className="mb-3 text-sm font-bold text-gray-300">
                {displayedTeamMeta.score} {displayedTeamMeta.isLive ? `· LIVE ${displayedTeamMeta.minute}'` : ''}
              </div>
            )}

            {!teamsPickerOpen && displayedTeamLineup ? (
              <LiveLineupPitch
                key={`team-${competitionId}-${selectedTeamId}`}
                lineup={displayedTeamLineup}
                totalPoints={displayedTeamTotalPoints}
                prevPointsMap={teamLineup ? teamPrevPoints : null}
                animId={teamLineup ? teamAnimId : null}
              />
            ) : !teamsPickerOpen && teamLoading ? (
              <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default LiveLineupPage;
