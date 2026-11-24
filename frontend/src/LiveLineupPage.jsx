import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';
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

const LEAGUE_COLORS = {
  L1: '#4ba6ff',
  L2: '#ff5c3e',
  L3: '#22c55e',
};

// Einheitliche Karten-Darstellung fuer das Live-Ranking, identisch zur
// UserRow im Liga-Tab (Dashboard.jsx): einzelne card-surface-Kacheln mit
// Rang, 40px Avatar, Manager-Name und rechts Punktzahl + "PUNKTE"-Untertitel.
const RankingList = ({ ranking, selectedUserId, onSelect, prevPointsMap, animId, accentColor = '#ff5c3e' }) => (
  <div className="flex flex-col">
    {ranking.map((r, i) => {
      const isSelected = r.userId === selectedUserId;
      return (
        <button
          key={r.userId}
          type="button"
          onClick={() => onSelect(r.userId)}
          className={`w-full flex items-center p-3 mb-2.5 card-surface rounded-[14px] shadow-sm text-left relative overflow-hidden transition-all active:scale-[0.99] cursor-pointer ${
            isSelected ? 'border-[#ff5c3e]/60 bg-[#1e1e1e]' : 'hover:border-[#ff5c3e]/50 hover:bg-[#202020]'
          }`}
        >
          <div className="w-8 flex justify-center items-center text-xs font-semibold text-[#8b92a5] shrink-0">
            {i + 1}
          </div>
          <div className="w-10 h-10 rounded-full ml-2 overflow-hidden border border-white/10 shrink-0">
            <ManagerAvatar name={r.name} size={40} ringColor={isSelected ? '#ff5c3e' : undefined} />
          </div>
          <div className="ml-3 flex-1 flex flex-col justify-center min-w-0">
            <div className="text-[15px] font-semibold tracking-wide text-gray-100 truncate">{r.name}</div>
          </div>
          <div className="text-right mr-2 shrink-0">
            <div className="text-[17px] font-bold leading-none" style={{ color: accentColor }}>
              <AnimatedPoints
                value={r.livePoints}
                previousValue={prevPointsMap?.[String(r.userId)]}
                animKey={animId != null ? `${animId}:rank:${r.userId}` : null}
                format={(n) => n.toLocaleString('de-DE')}
                className="text-[17px] font-bold"
                deltaPlacement="left"
              />
            </div>
            <div className="text-[10px] font-semibold text-[#626978] tracking-widest mt-1 uppercase">Punkte</div>
          </div>
        </button>
      );
    })}
  </div>
);

// Kompakte Auswahl-Zeile statt dauerhaft sichtbarer Liste (Owner-Feedback
// 24.11.2026) - toggelt die Manager-Liste auf/zu, im selben Karten-Stil.
const SelectorButton = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-3 card-surface rounded-[14px] px-4 py-3 mb-4 hover:border-[#ff5c3e]/50 hover:bg-[#1a1a1a] transition-colors"
  >
    {children}
    <ChevronDown size={16} className="text-[#626978] shrink-0" />
  </button>
);

const ModeSwitch = ({ mode, onChange }) => (
  <div className="flex gap-1.5 bg-[#171717] border border-[#2e2e2e] rounded-xl p-1 overflow-x-auto no-scrollbar">
    {[
      { id: 'own', label: 'Mein Kader' },
      { id: 'managers', label: 'Liga-Manager' },
      { id: 'teams', label: 'Echte Teams' },
    ].map((opt) => (
      <button
        key={opt.id}
        type="button"
        onClick={() => onChange(opt.id)}
        className={`px-3 py-2 rounded-lg whitespace-nowrap text-xs tracking-wide transition-all flex-1 ${
          mode === opt.id
            ? 'bg-white text-black font-semibold shadow-sm'
            : 'text-[#8b92a5] font-medium hover:text-white'
        }`}
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

  // "teams": Wettbewerb + horizontale Durchscroll-Kacheln mit Vereinslogos.
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
  const leagueAccentColor = LEAGUE_COLORS[leagueKey] || '#4ba6ff';

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10 pb-28 sm:pb-28">
      <div className="max-w-[700px] mx-auto">
        <div className="flex flex-col mb-5 border-b border-[#2e2e2e] pb-4 gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-6 min-w-0">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-[#ef4444]/10 flex items-center justify-center shrink-0">
                <span className="relative flex h-3.5 w-3.5 sm:h-4 sm:w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 sm:h-4 sm:w-4 bg-[#ef4444]"></span>
                </span>
              </div>
              <PageHeader eyebrow={displayedMatchday ? `SPIELTAG ${displayedMatchday} · LIVE` : 'LIVE'} accentColor="#ef4444" title="Live Punkte" />
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isBusy}
              aria-label="Live-Daten aktualisieren"
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors disabled:opacity-50 shrink-0"
            >
              <RefreshCw size={14} className={isBusy ? 'animate-spin' : ''} />
            </button>
          </div>

          <ModeSwitch mode={mode} onChange={setMode} />
        </div>

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
                  accentColor={leagueAccentColor}
                />
              ) : (
                <div className="text-center text-[#8b92a5] text-sm py-6">Lade Liga-Ranking…</div>
              )
            ) : (
              <>
                <SelectorButton onClick={() => setManagerPickerOpen(true)}>
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 shrink-0">
                    <ManagerAvatar name={selectedManagerName} size={32} />
                  </div>
                  <span className="text-[15px] font-semibold text-gray-100 flex-1 text-left truncate">
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
            <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar">
              {COMPETITIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCompetitionId(c.id)}
                  className={`px-3.5 py-1.5 rounded-full whitespace-nowrap text-xs border transition-colors ${
                    competitionId === c.id
                      ? 'bg-[#ff5c3e]/15 border-[#ff5c3e] text-white font-semibold'
                      : 'border-[#2e2e2e] text-[#8b92a5] font-medium hover:text-white'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Horizontale Durchscroll-Kacheln mit Mannschafts-Logos */}
            {teamsLoading ? (
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 mb-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    className="w-[84px] h-[82px] shrink-0 rounded-2xl card-surface animate-pulse"
                  />
                ))}
              </div>
            ) : teamsList && teamsList.length > 0 ? (
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 mb-4">
                {teamsList.map((t) => {
                  const isActive = selectedTeamId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectTeam(t.id)}
                      className={`w-[84px] shrink-0 flex flex-col items-center justify-center gap-1.5 px-2 py-2.5 rounded-2xl border transition-all active:scale-95 ${
                        isActive
                          ? 'bg-[#ff5c3e]/12 border-[#ff5c3e] shadow-md'
                          : 'card-surface hover:border-white/25'
                      }`}
                    >
                      {t.logo ? (
                        <img
                          src={t.logo}
                          alt={t.name}
                          className="w-9 h-9 object-contain"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#202020] flex items-center justify-center text-[10px] font-semibold text-[#8b92a5]">
                          {t.name?.substring(0, 2)}
                        </div>
                      )}
                      <span className={`text-[10px] text-center truncate w-full ${isActive ? 'text-white font-semibold' : 'text-gray-300 font-medium'}`}>
                        {t.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-[#8b92a5] text-sm py-6">Keine Teams gefunden.</div>
            )}

            {teamError && (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400 mb-4">{teamError}</div>
            )}

            {selectedTeam && displayedTeamMeta?.score && (
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-200">
                <span>{selectedTeam.name}</span>
                <span className="text-[#626978]">·</span>
                <span className="tabular-nums">{displayedTeamMeta.score}</span>
                {displayedTeamMeta.isLive && (
                  <span className="text-xs font-semibold text-[#ef4444]">LIVE {displayedTeamMeta.minute}'</span>
                )}
              </div>
            )}

            {displayedTeamLineup ? (
              <LiveLineupPitch
                key={`team-${competitionId}-${selectedTeamId}`}
                lineup={displayedTeamLineup}
                totalPoints={displayedTeamTotalPoints}
                prevPointsMap={teamLineup ? teamPrevPoints : null}
                animId={teamLineup ? teamAnimId : null}
              />
            ) : teamLoading ? (
              <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
            ) : !selectedTeamId && teamsList?.length > 0 ? (
              <div className="card-surface rounded-2xl p-6 text-center text-xs text-[#8b92a5]">
                Tippe oben auf ein Vereinslogo, um die Live-Startelf des Teams zu sehen.
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default LiveLineupPage;
