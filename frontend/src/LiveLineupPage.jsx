import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, ChevronDown, Radio } from 'lucide-react';
import { useAuth } from './AuthContext';
import ManagerAvatar from './ui/ManagerAvatar';
import PageHeader from './ui/PageHeader';
import AnimatedPoints from './ui/AnimatedPoints';
import LiveLineupPitch from './ui/LiveLineupGrid';
import BundesligaMatchesSection, { SelectedTeamMatchBanner } from './ui/BundesligaMatchesSection';
import { buildLineupWithDummies, buildTeamLogoMap } from './liveLineupUtils';
import {
  fetchBundesligaMatches,
  fetchBundesligaLastChange,
  findOpenLigaMatchForKickbaseTeam,
  diffBundesligaMatches,
  buildKickbaseTeamsFromPlayers,
  mergeKickbaseTeams,
  matchTriggeredEventsToTeamIds,
  formatTriggerSummary,
} from './openLigaDb';
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
// ergaenzt um einen gezielten, schonenden OpenLigaDB-Event-Trigger (Owner-Wunsch
// 24.11.2026): statt eines blinden Kickbase-Polling-Loops lauscht die App bei
// laufenden Bundesliga-Partien alle 30s auf die freie OpenLigaDB-API und loest
// nur bei einem echten Ereignis (Tor, Elfmeter, Eigentor, Halbzeit, Abpfiff)
// fuer ein BETEILIGTES Team EIN zeitversetztes Kickbase-Update aus (5-14s
// Zufalls-Jitter, harter 75s-Cooldown, max. 1 Nachcheck nach 45s falls Punkte
// noch unveraendert, plus Server-Token-Cache & 15s Vercel-Edge-Caching).
//
// Drei Modi ueber einen Segment-Umschalter:
// - "own": der eigene Kader - IMMER die Default-Ansicht beim Oeffnen.
// - "managers": Live-Ranking der Liga, Klick auf eine Zeile zeigt deren Startelf.
// - "teams": Wettbewerb + echtes Fussball-Team waehlen + Bundesliga-Partien
//   (OpenLigaDB mit Live-Ergebnissen & Spielereignissen).
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

const AUTO_SYNC_COOLDOWN_MS = 75 * 1000;
const AUTO_SYNC_JITTER_MIN_MS = 5 * 1000;
const AUTO_SYNC_JITTER_MAX_MS = 14 * 1000;
const AUTO_SYNC_FOLLOWUP_DELAY_MS = 45 * 1000;
const OPENLIGA_POLL_INTERVAL_MS = 30 * 1000;

const sumPlayersPoints = (players) => {
  if (!Array.isArray(players) || players.length === 0) return null;
  return players.reduce((sum, p) => sum + (p?.points || 0), 0);
};

const collectLineupTeamIds = (players, playerMap) => {
  const ids = new Set();
  for (const p of players || []) {
    if (!p || p.error) continue;
    if (p.teamId != null) ids.add(String(p.teamId));
    if (p.opponentTeamId != null) ids.add(String(p.opponentTeamId));
    const fallbackTid = playerMap?.get(String(p.playerId))?.tid;
    if (fallbackTid != null) ids.add(String(fallbackTid));
  }
  return ids;
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
  const [blKickbaseTeams, setBlKickbaseTeams] = useState([]);
  const [setupError, setSetupError] = useState(null);

  const [ranking, setRanking] = useState(null);
  const [rankingPrevPoints, setRankingPrevPoints] = useState(null);
  const [rankingAnimId, setRankingAnimId] = useState(null);
  const [matchday, setMatchday] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Zwischengespeicherte Staende fuer sofortige Anzeige beim Oeffnen (kein
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

  // OpenLigaDB Bundesliga-Partien + Live-Ergebnisse/-Ereignisse
  const cachedBlMatches = useMemo(() => readCachedSnapshot('openliga:bl1:current'), []);
  const [blMatchday, setBlMatchday] = useState(null);
  const [blCurrentMatchday, setBlCurrentMatchday] = useState(
    cachedBlMatches?.currentMatchday ?? cachedBlMatches?.matchday ?? null
  );
  const [blMatchesData, setBlMatchesData] = useState(null);
  const [blMatchesLoading, setBlMatchesLoading] = useState(false);
  const [blMatchesRefreshing, setBlMatchesRefreshing] = useState(false);
  const [blMatchesError, setBlMatchesError] = useState(null);
  const [blChangedMatchIds, setBlChangedMatchIds] = useState(() => new Set());
  const [blNewEventIds, setBlNewEventIds] = useState(() => new Set());
  const [blLiveWatcherMeta, setBlLiveWatcherMeta] = useState(() => ({
    hasLiveMatch: Boolean(cachedBlMatches?.hasLiveMatch),
    hasImminentMatch: Boolean(cachedBlMatches?.hasImminentMatch),
  }));
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoSyncBanner, setAutoSyncBanner] = useState(null);

  const blMatchesReqRef = useRef(0);
  const blMatchesDataRef = useRef(null);
  const blHighlightTimerRef = useRef(null);

  // Aktueller Bundesliga-Live-Stand fuer den Hintergrund-Event-Watcher (unabhaengig
  // davon, ob der Nutzer gerade auf Mein Kader, Liga-Manager oder einem anderen Spieltag ist).
  const liveWatcherRef = useRef({
    season: cachedBlMatches?.season ?? null,
    matchday: cachedBlMatches?.currentMatchday ?? cachedBlMatches?.matchday ?? null,
    matches: cachedBlMatches?.matches ?? null,
    lastChange: cachedBlMatches?.lastChange ?? null,
    hasLiveMatch: Boolean(cachedBlMatches?.hasLiveMatch),
    hasImminentMatch: Boolean(cachedBlMatches?.hasImminentMatch),
  });
  const liveWatcherReqRef = useRef(0);
  const lastAutoKickbaseSyncRef = useRef(0);
  const jitterTimerRef = useRef(null);
  const followUpTimerRef = useRef(null);
  const bannerTimerRef = useRef(null);

  const allBlKickbaseTeams = useMemo(
    () => mergeKickbaseTeams(competitionId === '1' ? teamsList : null, blKickbaseTeams),
    [competitionId, teamsList, blKickbaseTeams]
  );

  // Aktueller View-Snapshot als Ref fuer zeitversetzte Event-Trigger-Callbacks.
  const viewStateRef = useRef({});
  useEffect(() => {
    viewStateRef.current = {
      mode,
      competitionId,
      blMatchday,
      blCurrentMatchday,
      selectedTeamId,
      selectedManagerId,
      managerPickerOpen,
      leagueKey,
      kickbaseId,
      ownData,
      managerData,
      teamData,
      playerMap,
      allBlKickbaseTeams,
      autoSyncEnabled,
    };
  }, [
    mode,
    competitionId,
    blMatchday,
    blCurrentMatchday,
    selectedTeamId,
    selectedManagerId,
    managerPickerOpen,
    leagueKey,
    kickbaseId,
    ownData,
    managerData,
    teamData,
    playerMap,
    allBlKickbaseTeams,
    autoSyncEnabled,
  ]);

  const cancelPendingAutoSyncTimers = useCallback(() => {
    if (jitterTimerRef.current) {
      window.clearTimeout(jitterTimerRef.current);
      jitterTimerRef.current = null;
    }
    if (followUpTimerRef.current) {
      window.clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
  }, []);

  // Lineup-Daten fuer EINEN Kickbase-Manager laden (Startelf + Live-Punkte pro Spieler).
  const loadLineup = useCallback(async (league, userId, { nocache = false } = {}) => {
    const res = await fetch(
      `/api/live-lineup?userId=${userId}&leagueKey=${league}${nocache ? '&nocache=1' : ''}`
    );
    if (!res.ok) throw new Error('Live-Daten konnten nicht geladen werden');
    return res.json();
  }, []);

  // Nur das Liga-Ranking neu laden (1 guenstiger teamcenter-Call, 15s Edge-Cache).
  const refreshRankingOnly = useCallback(async (league, { nocache = false } = {}) => {
    if (!kickbaseId || !league) return null;
    const rankingRes = await fetch(
      `/api/live-ranking?userId=${kickbaseId}&leagueKey=${league}${nocache ? '&nocache=1' : ''}`
    );
    if (!rankingRes.ok) return null;
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
    return nextRanking;
  }, [kickbaseId]);

  // Nur die eigene Startelf neu laden (ohne all_players.json erneut zu laden).
  const refreshOwnOnly = useCallback(async (league, { nocache = false } = {}) => {
    if (!kickbaseId || !league) return null;
    const lineupJson = await loadLineup(league, kickbaseId, { nocache });
    const prevOwn = diffAndSavePoints(
      `own:md${lineupJson.matchday ?? 'cur'}:${kickbaseId}`,
      buildLineupPointsMap(lineupJson.players)
    );
    setOwnPrevPoints(prevOwn);
    setOwnAnimId(nextAnimId());
    setOwnData(lineupJson);
    return sumPlayersPoints(lineupJson.players);
  }, [kickbaseId, loadLineup]);

  // Grundsetup: Liga ermitteln, Spieler-/Vereinswappen-Nachschlagewerk laden,
  // Ranking + eigenen Kader EINMAL beim Oeffnen abrufen. Bei manuellem
  // Refresh (`silent = true`) wird bei bereits bekannter Liga kein statisches
  // JSON mehr neu geladen.
  const loadAll = useCallback(async (silent = false, { nocache = false } = {}) => {
    if (!kickbaseId) { setOwnLoading(false); return; }
    if (!silent) setOwnLoading(true);
    setSetupError(null);
    try {
      let resolvedLeague = leagueKey;
      if (!resolvedLeague || !playerMap) {
        const [ratingsRes, playersRes] = await Promise.all([
          fetch('/history/manager-ratings.json'),
          fetch('/history/all_players.json'),
        ]);
        const ratings = await ratingsRes.json();
        const allPlayers = await playersRes.json();
        setPlayerMap(new Map(allPlayers.map((p) => [String(p.i), p])));
        setTeamLogoMap(buildTeamLogoMap(allPlayers));
        setBlKickbaseTeams(buildKickbaseTeamsFromPlayers(allPlayers));

        resolvedLeague = ratings[kickbaseId]?.league;
        if (!resolvedLeague) throw new Error('Liga konnte nicht ermittelt werden');
        setLeagueKey(resolvedLeague);
      }

      await Promise.all([
        refreshRankingOnly(resolvedLeague, { nocache }),
        refreshOwnOnly(resolvedLeague, { nocache }),
      ]);
    } catch (e) {
      setSetupError(e.message || 'Unbekannter Fehler');
    } finally {
      if (!silent) setOwnLoading(false);
    }
  }, [kickbaseId, leagueKey, playerMap, refreshRankingOnly, refreshOwnOnly]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectManager = useCallback(async (userId, forceRefresh = false, { nocache = false } = {}) => {
    setManagerPickerOpen(false);
    setSelectedManagerId(userId);
    if (!leagueKey) return null;
    if (!forceRefresh && userId === selectedManagerId && managerData) {
      return sumPlayersPoints(managerData.players);
    }

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
      const lineupJson = await loadLineup(leagueKey, userId, { nocache });
      if (managerReqRef.current !== reqId) return null;
      const prevMgr = diffAndSavePoints(
        `mgr:md${lineupJson.matchday ?? 'cur'}:${userId}`,
        buildLineupPointsMap(lineupJson.players)
      );
      setManagerPrevPoints(prevMgr);
      setManagerAnimId(nextAnimId());
      setManagerData({ ...lineupJson, _userId: userId });
      return sumPlayersPoints(lineupJson.players);
    } catch {
      if (managerReqRef.current !== reqId) return null;
      if (!forceRefresh && !cached) setManagerData(null);
      return null;
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
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (!cancelled) setTeamsList(json?.teams || []); })
      .catch(() => { if (!cancelled) setTeamsList([]); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
  }, [mode, competitionId]);

  const selectTeam = useCallback(async (teamId, forceRefresh = false, { nocache = false } = {}) => {
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
      const res = await fetch(
        `/api/live-team?competitionId=${competitionId}&teamId=${teamId}${nocache ? '&nocache=1' : ''}`
      );
      if (!res.ok) throw new Error('Team-Daten konnten nicht geladen werden');
      const json = await res.json();
      if (teamReqRef.current !== reqId) return null;
      const teamScope = json.matchId
        ? `team:m:${json.matchId}:${teamId}`
        : `team:c:${competitionId}:${teamId}`;
      const prevTeam = diffAndSavePoints(teamScope, buildLineupPointsMap(json.players));
      setTeamPrevPoints(prevTeam);
      setTeamAnimId(nextAnimId());
      setTeamData({ ...json, _cacheKey: cacheKey });
      return sumPlayersPoints(json.players);
    } catch (e) {
      if (teamReqRef.current !== reqId) return null;
      setTeamError(e.message || 'Unbekannter Fehler');
      if (!forceRefresh && !cached) setTeamData(null);
      return null;
    } finally {
      if (teamReqRef.current === reqId) {
        setTeamLoading(false);
        setTeamRefreshing(false);
      }
    }
  }, [competitionId]);

  const clearSelectedTeam = useCallback(() => {
    teamReqRef.current += 1;
    setSelectedTeamId(null);
    setTeamData(null);
    setTeamCached(null);
    setTeamPrevPoints(null);
    setTeamError(null);
    setTeamLoading(false);
    setTeamRefreshing(false);
  }, []);

  const flashMatchHighlights = useCallback((changedMatchIds, newEventIds) => {
    if (changedMatchIds.size === 0 && newEventIds.size === 0) return;
    setBlChangedMatchIds(changedMatchIds);
    setBlNewEventIds(newEventIds);
    if (blHighlightTimerRef.current) {
      window.clearTimeout(blHighlightTimerRef.current);
    }
    blHighlightTimerRef.current = window.setTimeout(() => {
      setBlChangedMatchIds(new Set());
      setBlNewEventIds(new Set());
      blHighlightTimerRef.current = null;
    }, 15000);
  }, []);

  const showTransientBanner = useCallback((banner, autoClearMs = null) => {
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
    setAutoSyncBanner(banner);
    if (banner && autoClearMs) {
      bannerTimerRef.current = window.setTimeout(() => {
        setAutoSyncBanner(null);
        bannerTimerRef.current = null;
      }, autoClearMs);
    }
  }, []);

  // Gezielter, schonender Kickbase-Trigger bei OpenLigaDB-Live-Ereignissen:
  // 1) Team-Filter prueft, ob die aktuell angezeigte Ansicht betroffen ist.
  // 2) Harter 75s-Cooldown verhindert Mehrfach-Trigger bei schnellen Torfolgen.
  // 3) 5-14s Zufalls-Jitter verteilt Last + gibt Kickbase/Opta Zeit zum Verbuchen.
  // 4) Maximal 1 Nachcheck nach 45s, falls sich die Punkte beim ersten Check noch
  //    nicht geaendert haben - danach garantiert Pause (kein Dauer-Loop).
  const scheduleAutoKickbaseSync = useCallback((triggeredMatches) => {
    if (!Array.isArray(triggeredMatches) || triggeredMatches.length === 0) return;
    const state = viewStateRef.current;
    if (!state.autoSyncEnabled) return;
    if (document.visibilityState !== 'visible') return;

    let action = null; // 'own' | 'manager_lineup' | 'ranking_only' | 'team'
    let primaryTrigger = triggeredMatches[0];

    if (state.mode === 'own') {
      if (!state.leagueKey || !state.kickbaseId || !state.ownData?.players?.length) return;
      const relevantIds = collectLineupTeamIds(state.ownData.players, state.playerMap);
      const hits = matchTriggeredEventsToTeamIds(triggeredMatches, relevantIds, state.allBlKickbaseTeams);
      if (hits.length === 0) return;
      primaryTrigger = hits[0];
      action = 'own';
    } else if (state.mode === 'managers') {
      if (!state.leagueKey) return;
      if (!state.managerPickerOpen && state.selectedManagerId && state.managerData?.players?.length) {
        const relevantIds = collectLineupTeamIds(state.managerData.players, state.playerMap);
        const hits = matchTriggeredEventsToTeamIds(triggeredMatches, relevantIds, state.allBlKickbaseTeams);
        if (hits.length > 0) {
          primaryTrigger = hits[0];
          action = 'manager_lineup';
        } else {
          action = 'ranking_only';
        }
      } else {
        action = 'ranking_only';
      }
    } else if (state.mode === 'teams') {
      if (state.competitionId !== '1' || !state.selectedTeamId) return;
      const relevantIds = new Set([String(state.selectedTeamId)]);
      const hits = matchTriggeredEventsToTeamIds(triggeredMatches, relevantIds, state.allBlKickbaseTeams);
      if (hits.length === 0) return;
      primaryTrigger = hits[0];
      action = 'team';
    }

    if (!action) return;

    const now = Date.now();
    if (now - lastAutoKickbaseSyncRef.current < AUTO_SYNC_COOLDOWN_MS) return;

    cancelPendingAutoSyncTimers();
    lastAutoKickbaseSyncRef.current = now;

    const triggerSummary = formatTriggerSummary(primaryTrigger);
    const jitterMs =
      AUTO_SYNC_JITTER_MIN_MS +
      Math.floor(Math.random() * (AUTO_SYNC_JITTER_MAX_MS - AUTO_SYNC_JITTER_MIN_MS));

    showTransientBanner({ text: triggerSummary, subtext: 'Live-Punkte werden abgeglichen…', status: 'pending' });

    const runAction = async () => {
      const current = viewStateRef.current;
      if (!current.autoSyncEnabled || document.visibilityState !== 'visible') {
        showTransientBanner(null);
        return { performed: false, beforePoints: null, afterPoints: null };
      }

      showTransientBanner({ text: triggerSummary, subtext: 'Aktualisiere Kickbase-Punkte…', status: 'syncing' });

      if (action === 'own' && current.mode === 'own' && current.leagueKey) {
        const beforePoints = sumPlayersPoints(current.ownData?.players);
        const [afterPoints] = await Promise.all([
          refreshOwnOnly(current.leagueKey, { nocache: false }),
          refreshRankingOnly(current.leagueKey, { nocache: false }),
        ]);
        return { performed: true, beforePoints, afterPoints };
      }

      if (action === 'manager_lineup' && current.mode === 'managers' && current.selectedManagerId && current.leagueKey) {
        const beforePoints = sumPlayersPoints(current.managerData?.players);
        const [afterPoints] = await Promise.all([
          selectManager(current.selectedManagerId, true, { nocache: false }),
          refreshRankingOnly(current.leagueKey, { nocache: false }),
        ]);
        return { performed: true, beforePoints, afterPoints };
      }

      if (action === 'ranking_only' && current.mode === 'managers' && current.leagueKey) {
        await refreshRankingOnly(current.leagueKey, { nocache: false });
        return { performed: true, beforePoints: null, afterPoints: null };
      }

      if (action === 'team' && current.mode === 'teams' && current.competitionId === '1' && current.selectedTeamId) {
        const beforePoints = sumPlayersPoints(current.teamData?.players);
        const afterPoints = await selectTeam(current.selectedTeamId, true, { nocache: false });
        return { performed: true, beforePoints, afterPoints };
      }

      return { performed: false, beforePoints: null, afterPoints: null };
    };

    jitterTimerRef.current = window.setTimeout(async () => {
      jitterTimerRef.current = null;
      try {
        const { performed, beforePoints, afterPoints } = await runAction();
        if (!performed) {
          showTransientBanner(null);
          return;
        }

        const pointsChanged =
          beforePoints != null && afterPoints != null && afterPoints !== beforePoints;

        if (pointsChanged || action === 'ranking_only') {
          showTransientBanner(
            { text: triggerSummary, subtext: 'Live-Punkte aktualisiert', status: 'done' },
            4500
          );
          return;
        }

        // Punkte waren noch unveraendert (Kickbase/Opta bucht manchmal 20-40s spaeter):
        // genau EIN einzelner Nachcheck nach 45s, danach garantiert Ende.
        showTransientBanner(
          { text: triggerSummary, subtext: 'Warte auf Kickbase-Buchung (Nachcheck in 45s)…', status: 'pending' },
          AUTO_SYNC_FOLLOWUP_DELAY_MS + 2000
        );

        followUpTimerRef.current = window.setTimeout(async () => {
          followUpTimerRef.current = null;
          try {
            const res = await runAction();
            if (res.performed) {
              showTransientBanner(
                { text: triggerSummary, subtext: 'Live-Punkte aktualisiert', status: 'done' },
                4000
              );
            } else {
              showTransientBanner(null);
            }
          } catch {
            showTransientBanner(null);
          }
        }, AUTO_SYNC_FOLLOWUP_DELAY_MS);
      } catch {
        showTransientBanner(null);
      }
    }, jitterMs);
  }, [
    cancelPendingAutoSyncTimers,
    showTransientBanner,
    refreshOwnOnly,
    refreshRankingOnly,
    selectManager,
    selectTeam,
  ]);

  // Aktualisiert den zentralen OpenLigaDB-Watcher-State (aktueller Bundesliga-Spieltag)
  // und loest bei neuen Live-Ereignissen den Kickbase-Trigger aus.
  const applyCurrentMatchdaySnapshot = useCallback((data, { allowTrigger = true } = {}) => {
    if (!data?.matches) return;
    const prevWatcher = liveWatcherRef.current;
    let diff = { changedMatchIds: new Set(), newEventIds: new Set(), triggeredMatches: [] };

    if (prevWatcher.matches && prevWatcher.matchday === data.matchday) {
      diff = diffBundesligaMatches(prevWatcher.matches, data.matches);
      if (diff.changedMatchIds.size > 0 || diff.newEventIds.size > 0) {
        flashMatchHighlights(diff.changedMatchIds, diff.newEventIds);
      }
    }

    liveWatcherRef.current = {
      season: data.season ?? prevWatcher.season,
      matchday: data.matchday ?? prevWatcher.matchday,
      matches: data.matches,
      lastChange: data.lastChange ?? null,
      hasLiveMatch: Boolean(data.hasLiveMatch),
      hasImminentMatch: Boolean(data.hasImminentMatch),
    };
    setBlLiveWatcherMeta({
      hasLiveMatch: Boolean(data.hasLiveMatch),
      hasImminentMatch: Boolean(data.hasImminentMatch),
    });
    if (data.currentMatchday != null) {
      setBlCurrentMatchday(data.currentMatchday);
    }
    saveCachedSnapshot('openliga:bl1:current', data);

    // Wenn der Nutzer im "Echte Teams"-Tab den aktuellen Spieltag ansieht,
    // die UI-Liste direkt mit demselben Snapshot synchron halten (kein Doppel-Fetch).
    const view = viewStateRef.current;
    const isViewingCurrentDay =
      view.blMatchday == null || view.blMatchday === data.matchday || view.blMatchday === data.currentMatchday;
    if (isViewingCurrentDay) {
      blMatchesDataRef.current = data;
      setBlMatchesData(data);
    }

    if (allowTrigger && diff.triggeredMatches.length > 0) {
      scheduleAutoKickbaseSync(diff.triggeredMatches);
    }
  }, [flashMatchHighlights, scheduleAutoKickbaseSync]);

  // Bundesliga-Partien fuer den im "Echte Teams"-Tab gewaehlten Spieltag laden.
  const loadBundesligaMatches = useCallback(async (
    targetMatchday = null,
    { silent = false, nocache = false } = {}
  ) => {
    const reqId = ++blMatchesReqRef.current;
    const currentSnapshot = blMatchesDataRef.current;
    const isDefaultDay = targetMatchday == null || (blCurrentMatchday != null && targetMatchday === blCurrentMatchday);

    if (!silent) {
      setBlMatchesLoading(!(isDefaultDay && cachedBlMatches?.matches?.length));
    }
    setBlMatchesRefreshing(true);
    setBlMatchesError(null);

    try {
      const data = await fetchBundesligaMatches({
        matchday: targetMatchday,
        season: currentSnapshot?.season ?? cachedBlMatches?.season ?? null,
        nocache,
      });
      if (blMatchesReqRef.current !== reqId) return;

      const isCurrentDayResponse =
        targetMatchday == null ||
        (data.currentMatchday != null && data.matchday === data.currentMatchday);

      if (isCurrentDayResponse) {
        applyCurrentMatchdaySnapshot(data, { allowTrigger: silent });
      } else {
        const prevData = blMatchesDataRef.current;
        if (prevData && prevData.matchday === data.matchday) {
          const { changedMatchIds, newEventIds } = diffBundesligaMatches(prevData.matches, data.matches);
          flashMatchHighlights(changedMatchIds, newEventIds);
        }
        blMatchesDataRef.current = data;
        setBlMatchesData(data);
        if (data.currentMatchday != null) {
          setBlCurrentMatchday(data.currentMatchday);
        }
      }
    } catch (e) {
      if (blMatchesReqRef.current !== reqId) return;
      setBlMatchesError(e.message || 'Bundesliga-Partien konnten nicht geladen werden');
    } finally {
      if (blMatchesReqRef.current === reqId) {
        setBlMatchesLoading(false);
        setBlMatchesRefreshing(false);
      }
    }
  }, [blCurrentMatchday, cachedBlMatches, applyCurrentMatchdaySnapshot, flashMatchHighlights]);

  // Hintergrund-Poll des AKTUELLEN Bundesliga-Spieltags via OpenLigaDB (alle Tabs).
  const pollCurrentBundesliga = useCallback(async ({ checkLastChangeOnly = true, allowTrigger = true } = {}) => {
    const reqId = ++liveWatcherReqRef.current;
    const watcher = liveWatcherRef.current;

    if (checkLastChangeOnly && watcher.season && watcher.matchday && watcher.lastChange) {
      const remoteLastChange = await fetchBundesligaLastChange({
        season: watcher.season,
        matchday: watcher.matchday,
      });
      if (liveWatcherReqRef.current !== reqId) return;

      const justKickedOff = (watcher.matches || []).some(
        (m) => !m.isFinished && !m.isLive && m.kickoffUtc && Date.now() >= Date.parse(m.kickoffUtc)
      );
      if (remoteLastChange && remoteLastChange === watcher.lastChange && !watcher.hasLiveMatch && !justKickedOff) {
        return;
      }
    }

    try {
      const data = await fetchBundesligaMatches({ nocache: true });
      if (liveWatcherReqRef.current !== reqId) return;
      applyCurrentMatchdaySnapshot(data, { allowTrigger });
    } catch {
      // Stiller Hintergrund-Check: Fehler nicht als Vollbild-Fehler anzeigen.
    }
  }, [applyCurrentMatchdaySnapshot]);

  // Einmaliger Initial-Check des aktuellen Bundesliga-Spieltags beim Oeffnen des Live-Tabs,
  // damit der Event-Watcher sofort weiss, ob gerade Bundesliga-Partien laufen.
  useEffect(() => {
    pollCurrentBundesliga({ checkLastChangeOnly: false, allowTrigger: false });
  }, [pollCurrentBundesliga]);

  // OpenLigaDB-Partien nachladen, sobald im "Echte Teams"-Tab der Spieltag gewechselt wird.
  useEffect(() => {
    if (mode !== 'teams' || competitionId !== '1') return;
    if (blMatchday == null && blMatchesDataRef.current) return;
    loadBundesligaMatches(blMatchday, { silent: false, nocache: false });
  }, [mode, competitionId, blMatchday, loadBundesligaMatches]);

  // Zentrales 30s-OpenLigaDB-Live-Polling ueber den gesamten Live-Tab,
  // sobald mindestens eine Bundesliga-Partie laeuft oder kurz vor Anpfiff steht.
  const blLiveActive = Boolean(blLiveWatcherMeta.hasLiveMatch || blLiveWatcherMeta.hasImminentMatch);

  useEffect(() => {
    if (!blLiveActive) return undefined;

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      pollCurrentBundesliga({ checkLastChangeOnly: true, allowTrigger: true });
    };

    const intervalId = window.setInterval(tick, OPENLIGA_POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollCurrentBundesliga({ checkLastChangeOnly: false, allowTrigger: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [blLiveActive, pollCurrentBundesliga]);

  useEffect(() => {
    if (!autoSyncEnabled) {
      cancelPendingAutoSyncTimers();
      showTransientBanner(null);
    }
  }, [autoSyncEnabled, cancelPendingAutoSyncTimers, showTransientBanner]);

  useEffect(() => () => {
    cancelPendingAutoSyncTimers();
    if (blHighlightTimerRef.current) window.clearTimeout(blHighlightTimerRef.current);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
  }, [cancelPendingAutoSyncTimers]);

  // Aktualisiert je nach aktivem Tab die gerade sichtbaren Live-Daten sofort
  // (mit nocache=1, bricht ausstehende Auto-Sync-Timer sauber ab).
  const handleRefresh = useCallback(async () => {
    if (refreshing || ownLoading || managerRefreshing || teamRefreshing || blMatchesRefreshing) return;
    cancelPendingAutoSyncTimers();
    showTransientBanner(null);
    setRefreshing(true);
    try {
      if (mode === 'teams') {
        const tasks = [];
        if (competitionId === '1') {
          tasks.push(loadBundesligaMatches(blMatchday, { silent: true, nocache: true }));
        }
        if (selectedTeamId) {
          tasks.push(selectTeam(selectedTeamId, true, { nocache: true }));
        }
        await Promise.all(tasks);
      } else if (mode === 'managers') {
        await Promise.all([
          loadAll(true, { nocache: true }),
          selectedManagerId ? selectManager(selectedManagerId, true, { nocache: true }) : Promise.resolve(),
        ]);
      } else {
        await loadAll(true, { nocache: true });
      }
    } finally {
      setRefreshing(false);
    }
  }, [
    refreshing,
    ownLoading,
    managerRefreshing,
    teamRefreshing,
    blMatchesRefreshing,
    cancelPendingAutoSyncTimers,
    showTransientBanner,
    mode,
    competitionId,
    blMatchday,
    selectedTeamId,
    selectedManagerId,
    loadBundesligaMatches,
    selectTeam,
    selectManager,
    loadAll,
  ]);

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
  const ownTotalPoints = sumPlayersPoints(ownData?.players);

  const managerLineup = useMemo(() => enrichKickbaseLineup(managerData), [managerData, enrichKickbaseLineup]);
  const managerTotalPoints = sumPlayersPoints(managerData?.players);
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
  const teamTotalPoints = sumPlayersPoints(teamData?.players);

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
  const displayedBlMatches = useMemo(() => {
    if (blMatchesData) return blMatchesData;
    if (blMatchday == null || blMatchday === cachedBlMatches?.matchday) {
      return cachedBlMatches || null;
    }
    return null;
  }, [blMatchesData, blMatchday, cachedBlMatches]);
  const selectedTeamOpenLigaMatch = useMemo(() => {
    if (competitionId !== '1' || !selectedTeam || !displayedBlMatches?.matches) return null;
    return findOpenLigaMatchForKickbaseTeam(displayedBlMatches.matches, selectedTeam);
  }, [competitionId, selectedTeam, displayedBlMatches]);
  const isBusy = ownLoading || refreshing || managerRefreshing || teamRefreshing || blMatchesRefreshing;
  const leagueAccentColor = LEAGUE_COLORS[leagueKey] || '#4ba6ff';
  const blAutoPollingActive = Boolean(
    mode === 'teams' &&
    competitionId === '1' &&
    blLiveActive &&
    (blMatchday == null || blMatchday === blCurrentMatchday)
  );

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
            <div className="flex items-center gap-2 shrink-0">
              {blLiveActive && (
                <button
                  type="button"
                  onClick={() => setAutoSyncEnabled((v) => !v)}
                  title={autoSyncEnabled ? 'Event-Auto-Sync aktiv (klicken zum Pausieren)' : 'Event-Auto-Sync pausiert (klicken zum Aktivieren)'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    autoSyncEnabled
                      ? 'bg-[#ef4444]/15 border-[#ef4444]/40 text-[#ef4444]'
                      : 'bg-[#171717] border-[#2e2e2e] text-[#626978] hover:text-gray-300'
                  }`}
                >
                  <Radio size={11} className={autoSyncEnabled ? 'animate-pulse' : ''} />
                  <span>{autoSyncEnabled ? 'Auto' : 'Aus'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isBusy}
                aria-label="Live-Daten aktualisieren"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
              >
                <RefreshCw size={14} className={isBusy ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <ModeSwitch mode={mode} onChange={setMode} />
        </div>

        {autoSyncBanner && (
          <div
            className={`card-surface rounded-2xl px-3.5 py-2.5 mb-4 flex items-center justify-between gap-3 border transition-all ${
              autoSyncBanner.status === 'done'
                ? 'border-emerald-400/50 bg-emerald-500/10'
                : 'border-[#ff5c3e]/45 bg-[#ff5c3e]/10'
            }`}
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{autoSyncBanner.text}</div>
              <div className={`text-[11px] font-medium truncate mt-0.5 ${
                autoSyncBanner.status === 'done' ? 'text-emerald-300' : 'text-[#8b92a5]'
              }`}>
                {autoSyncBanner.subtext}
              </div>
            </div>
            {autoSyncBanner.status !== 'done' && (
              <RefreshCw size={13} className="text-[#ff5c3e] animate-spin shrink-0" />
            )}
          </div>
        )}

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
                      onClick={() => (isActive && competitionId === '1' ? clearSelectedTeam() : selectTeam(t.id))}
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
            ) : competitionId !== '1' ? (
              <div className="text-center text-[#8b92a5] text-sm py-6">Keine Teams gefunden.</div>
            ) : null}

            {teamError && (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400 mb-4">{teamError}</div>
            )}

            {competitionId === '1' && selectedTeamId && selectedTeamOpenLigaMatch ? (
              <SelectedTeamMatchBanner
                key={`banner-${selectedTeamOpenLigaMatch.match.matchId}-${selectedTeamOpenLigaMatch.side}`}
                match={selectedTeamOpenLigaMatch.match}
                selectedSide={selectedTeamOpenLigaMatch.side}
                teamsList={teamsList}
                onSelectTeam={selectTeam}
                onShowAllMatches={clearSelectedTeam}
                isUpdated={blChangedMatchIds.has(selectedTeamOpenLigaMatch.match.matchId)}
                newEventIds={blNewEventIds}
              />
            ) : selectedTeam && displayedTeamMeta?.score ? (
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-200">
                <span>{selectedTeam.name}</span>
                <span className="text-[#626978]">·</span>
                <span className="tabular-nums">{displayedTeamMeta.score}</span>
                {displayedTeamMeta.isLive && (
                  <span className="text-xs font-semibold text-[#ef4444]">LIVE {displayedTeamMeta.minute}'</span>
                )}
              </div>
            ) : null}

            {selectedTeamId ? (
              displayedTeamLineup ? (
                <LiveLineupPitch
                  key={`team-${competitionId}-${selectedTeamId}`}
                  lineup={displayedTeamLineup}
                  totalPoints={displayedTeamTotalPoints}
                  prevPointsMap={teamLineup ? teamPrevPoints : null}
                  animId={teamLineup ? teamAnimId : null}
                />
              ) : teamLoading ? (
                <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
              ) : null
            ) : competitionId === '1' ? (
              <BundesligaMatchesSection
                matchesData={displayedBlMatches}
                loading={blMatchesLoading}
                error={blMatchesError}
                activeMatchday={blMatchday ?? displayedBlMatches?.matchday ?? null}
                currentMatchday={blCurrentMatchday}
                onChangeMatchday={setBlMatchday}
                onRetry={() => loadBundesligaMatches(blMatchday, { silent: false, nocache: true })}
                teamsList={teamsList}
                onSelectKickbaseTeam={selectTeam}
                changedMatchIds={blChangedMatchIds}
                newEventIds={blNewEventIds}
                autoPollingActive={blAutoPollingActive}
              />
            ) : teamsList?.length > 0 ? (
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
