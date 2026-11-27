import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, ChevronDown, Radio } from './ui/icons';
import { useAuth } from './AuthContext';
import ManagerAvatar from './ui/ManagerAvatar';
import TabPageHeader from './ui/TabPageHeader';
import kaderLogo from './assets/kader_logo.png';
import spielplanLogo from './assets/spielplan_logo.png';
import AnimatedPoints from './ui/AnimatedPoints';
import LiveLineupPitch from './ui/LiveLineupGrid';
import CurrentSquadView from './ui/CurrentSquadView';
import BundesligaMatchesSection, { SelectedTeamMatchBanner } from './ui/BundesligaMatchesSection';
import { buildLineupWithDummies } from './liveLineupUtils';
import { loadPlayerCatalogBundle } from './playerDetailData';
import {
  fetchBundesligaMatches,
  fetchBundesligaLastChange,
  findOpenLigaMatchForKickbaseTeam,
  diffBundesligaMatches,
  buildKickbaseTeamsFromPlayers,
  mergeKickbaseTeams,
  matchTriggeredEventsToTeamIds,
  getActiveBundesligaKickbaseTeamIds,
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
import { isMatchdayWindowBerlin } from './matchdaySchedule';

// Live-Tab Struktur (Owner-Wunsch 24.11.2026):
// - "own" ("Mein Kader"): aktueller Kader mit Startelf auf dem Fussballfeld
//   (Marktwert & 5-stufiges Startelf-Icon) + nach Positionen gruppierte Liste
//   darunter mit Marktwert, 24h-Marktwert-Tendenz & Startelfwahrscheinlichkeit.
// - "live" ("Live"): Spieltagself mit Live-Punkten (Standard: eigene
//   Spieltagself + kompakter Umschalter zum Liga-Ranking / anderen Managern).
// - "teams" ("Spieltag"): reine Bundesliga-Spieltags-Partien via OpenLigaDB
//   (Live-Ergebnisse & Spielereignisse, aus den Partien direkter Sprung in die
//   Live-Startelf beider Teams).
//
// Alle Kickbase-Live-Abfragen laufen gesteuert ueber das Backend im 60s-Takt
// (Partial-Refresh `onlyPlayerIds` fuer laufende Partien) + 30s-OpenLigaDB-
// Event-Trigger + Server-/Edge-Caches + 429-Backoff (kein manueller Refresh).
const BUNDESLIGA_COMPETITION_ID = '1';

const LEAGUE_COLORS = {
  L1: '#4ba6ff',
  L2: '#ff5c3e',
  L3: '#22c55e',
};

const KICKBASE_POLL_INTERVAL_MS = 60 * 1000;
const KICKBASE_MIN_GAP_MS = 25 * 1000;
const OPENLIGA_POLL_INTERVAL_MS = 30 * 1000;
const EVENT_TRIGGER_COOLDOWN_MS = 60 * 1000;
const EVENT_TRIGGER_JITTER_MIN_MS = 5 * 1000;
const EVENT_TRIGGER_JITTER_MAX_MS = 14 * 1000;
const EVENT_TRIGGER_FOLLOWUP_DELAY_MS = 45 * 1000;
const DEFAULT_RATE_LIMIT_MS = 5 * 60 * 1000;

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

// Waehlt nur diejenigen Spieler eines Kaders aus, deren Bundesliga-Partie
// gerade aktiv ist (laeuft, steht unmittelbar vor Anpfiff oder endete vor
// <= 12 Min.). So spart der 60s-Takt bei Einzelspielen ~70-85% der Calls.
const getActivePlayerIdsForLineup = (players, playerMap, blMatches, allBlTeams) => {
  if (!Array.isArray(players) || players.length === 0) return [];
  const activeTeamIds = getActiveBundesligaKickbaseTeamIds(blMatches, allBlTeams);
  const hasOpenLiga = Array.isArray(blMatches) && blMatches.length > 0 && allBlTeams.length > 0;

  const ids = [];
  for (const p of players) {
    if (!p || p.playerId == null) continue;
    const isKickbaseLive = p.matchStatus !== 2 && typeof p.matchMinute === 'number' && p.matchMinute > 0;
    if (hasOpenLiga) {
      const tid = p.teamId != null ? String(p.teamId) : playerMap?.get(String(p.playerId))?.tid != null ? String(playerMap.get(String(p.playerId)).tid) : null;
      const oppTid = p.opponentTeamId != null ? String(p.opponentTeamId) : null;
      const teamActive = (tid && activeTeamIds.has(tid)) || (oppTid && activeTeamIds.has(oppTid));
      if (teamActive || isKickbaseLive) {
        ids.push(String(p.playerId));
      }
    } else if (p.matchStatus !== 2) {
      ids.push(String(p.playerId));
    }
  }
  return ids;
};

const mergePartialLineupPlayers = (existingPlayers, updatedPlayers) => {
  if (!Array.isArray(existingPlayers) || existingPlayers.length === 0) return updatedPlayers || [];
  const byId = new Map();
  for (const u of updatedPlayers || []) {
    if (u && !u.error && u.playerId != null) {
      byId.set(String(u.playerId), u);
    }
  }
  return existingPlayers.map((p) => byId.get(String(p.playerId)) || p);
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

// Kompakte Auswahl-Zeile fuer die Manager-Auswahl im Liga-Ranking.
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
      { id: 'live', label: 'Live' },
      { id: 'teams', label: 'Spieltag' },
    ].map((opt) => (
      <button
        key={opt.id}
        type="button"
        onClick={() => onChange(opt.id)}
        className={`px-3 py-2 rounded-lg whitespace-nowrap text-xs tracking-wide transition-all flex-1 cursor-pointer ${
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

  // Zeitgesteuerter Standard-Tab (Europe/Berlin):
  // - Dienstag 00:00 bis Freitag 17:59 -> "Mein Kader" ('own')
  // - Freitag 18:00 bis Montag 23:59   -> "Live" ('live')
  const [mode, setMode] = useState(() => (isMatchdayWindowBerlin() ? 'live' : 'own'));
  const [liveSubView, setLiveSubView] = useState('own'); // 'own' (Spieltagself) | 'ranking' (Liga-Ranking)

  const [leagueKey, setLeagueKey] = useState(null);
  const [playerMap, setPlayerMap] = useState(null);
  const [teamLogoMap, setTeamLogoMap] = useState(null);
  const [blKickbaseTeams, setBlKickbaseTeams] = useState([]);
  const [setupError, setSetupError] = useState(null);

  const [ranking, setRanking] = useState(null);
  const [rankingPrevPoints, setRankingPrevPoints] = useState(null);
  const [rankingAnimId, setRankingAnimId] = useState(null);
  const [matchday, setMatchday] = useState(null);

  // Zwischengespeicherte Staende fuer sofortige Anzeige beim Oeffnen.
  const cachedOwn = useMemo(
    () => (kickbaseId ? readCachedSnapshot(`own:${kickbaseId}`) : null),
    [kickbaseId]
  );
  const cachedRanking = useMemo(() => readCachedSnapshot('ranking'), []);
  const cachedSquad = useMemo(
    () => (kickbaseId ? readCachedSnapshot(`squad:${kickbaseId}`) : null),
    [kickbaseId]
  );

  // "own" ("Mein Kader"): aktueller Kader inkl. Auswechselspieler (Marktwert, Tendenz & Startelf-Prognose).
  const [currentSquadRaw, setCurrentSquadRaw] = useState(null);
  const [squadLoading, setSquadLoading] = useState(true);

  // "live" ("Live"): eigene Spieltagself mit Live-Punkten.
  const [ownData, setOwnData] = useState(null);
  const [ownPrevPoints, setOwnPrevPoints] = useState(null);
  const [ownAnimId, setOwnAnimId] = useState(null);
  const [ownLoading, setOwnLoading] = useState(true);

  // Optional im "Live"-Tab: Liga-Ranking & Startelf eines anderen Managers.
  const [selectedManagerId, setSelectedManagerId] = useState(null);
  const [managerData, setManagerData] = useState(null);
  const [managerCached, setManagerCached] = useState(null);
  const [managerPrevPoints, setManagerPrevPoints] = useState(null);
  const [managerAnimId, setManagerAnimId] = useState(null);
  const [managerLoading, setManagerLoading] = useState(false);
  const [managerPickerOpen, setManagerPickerOpen] = useState(true);
  const managerReqRef = useRef(0);

  // "teams" ("Spieltag"): Bundesliga-Partien (OpenLigaDB) + optionale Team-Startelf aus einer Partie.
  const [teamsList, setTeamsList] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [teamCached, setTeamCached] = useState(null);
  const [teamPrevPoints, setTeamPrevPoints] = useState(null);
  const [teamAnimId, setTeamAnimId] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState(null);
  const teamReqRef = useRef(0);

  // OpenLigaDB Bundesliga-Partien + Backend-gesteuerter 60s-Live-Sync
  const cachedBlMatches = useMemo(() => readCachedSnapshot('openliga:bl1:current'), []);
  const [blMatchday, setBlMatchday] = useState(null);
  const [blCurrentMatchday, setBlCurrentMatchday] = useState(
    cachedBlMatches?.currentMatchday ?? cachedBlMatches?.matchday ?? null
  );
  const [blMatchesData, setBlMatchesData] = useState(null);
  const [blMatchesLoading, setBlMatchesLoading] = useState(false);
  const [blMatchesError, setBlMatchesError] = useState(null);
  const [blChangedMatchIds, setBlChangedMatchIds] = useState(() => new Set());
  const [blNewEventIds, setBlNewEventIds] = useState(() => new Set());
  const [blLiveWatcherMeta, setBlLiveWatcherMeta] = useState(() => ({
    hasLiveMatch: Boolean(cachedBlMatches?.hasLiveMatch),
    hasImminentMatch: Boolean(cachedBlMatches?.hasImminentMatch),
  }));
  const [bgSyncing, setBgSyncing] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [autoSyncBanner, setAutoSyncBanner] = useState(null);

  const blMatchesReqRef = useRef(0);
  const blMatchesDataRef = useRef(null);
  const blHighlightTimerRef = useRef(null);
  const rateLimitUntilRef = useRef(0);
  const rateLimitTimerRef = useRef(null);
  const lastKickbaseTickAtRef = useRef(0);
  const lastEventTriggerAtRef = useRef(0);
  const jitterTimerRef = useRef(null);
  const followUpTimerRef = useRef(null);
  const bannerTimerRef = useRef(null);

  // Aktueller Bundesliga-Live-Stand fuer den Hintergrund-Event-Watcher.
  const liveWatcherRef = useRef({
    season: cachedBlMatches?.season ?? null,
    matchday: cachedBlMatches?.currentMatchday ?? cachedBlMatches?.matchday ?? null,
    matches: cachedBlMatches?.matches ?? null,
    lastChange: cachedBlMatches?.lastChange ?? null,
    hasLiveMatch: Boolean(cachedBlMatches?.hasLiveMatch),
    hasImminentMatch: Boolean(cachedBlMatches?.hasImminentMatch),
  });
  const liveWatcherReqRef = useRef(0);

  const allBlKickbaseTeams = useMemo(
    () => mergeKickbaseTeams(teamsList, blKickbaseTeams),
    [teamsList, blKickbaseTeams]
  );

  // Aktueller View-Snapshot als Ref fuer zeitversetzte Live-Sync-Callbacks.
  const viewStateRef = useRef({});
  useEffect(() => {
    viewStateRef.current = {
      mode,
      liveSubView,
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
    };
  }, [
    mode,
    liveSubView,
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
  ]);

  const handleRateLimitResponse = useCallback((res) => {
    if (res?.status !== 429) return false;
    const retryHeader = res.headers?.get?.('retry-after');
    const parsedSec = retryHeader ? parseInt(retryHeader, 10) : NaN;
    const backoffMs =
      Number.isFinite(parsedSec) && parsedSec > 0
        ? Math.min(15 * 60 * 1000, parsedSec * 1000)
        : DEFAULT_RATE_LIMIT_MS;
    rateLimitUntilRef.current = Math.max(rateLimitUntilRef.current, Date.now() + backoffMs);
    setRateLimited(true);
    if (rateLimitTimerRef.current) window.clearTimeout(rateLimitTimerRef.current);
    rateLimitTimerRef.current = window.setTimeout(() => {
      setRateLimited(false);
      rateLimitTimerRef.current = null;
    }, backoffMs);
    return true;
  }, []);

  const isClientRateLimited = useCallback(() => Date.now() < rateLimitUntilRef.current, []);

  const cancelPendingEventTimers = useCallback(() => {
    if (jitterTimerRef.current) {
      window.clearTimeout(jitterTimerRef.current);
      jitterTimerRef.current = null;
    }
    if (followUpTimerRef.current) {
      window.clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
  }, []);

  // Lineup-Daten fuer EINEN Kickbase-Manager laden (vollstaendig oder nur
  // fuer `onlyPlayerIds` aus aktuell laufenden Partien).
  const loadLineup = useCallback(async (league, userId, { onlyPlayerIds = null } = {}) => {
    if (isClientRateLimited()) return null;
    const params = new URLSearchParams({ userId: String(userId), leagueKey: String(league) });
    if (Array.isArray(onlyPlayerIds) && onlyPlayerIds.length > 0) {
      params.set('onlyPlayerIds', onlyPlayerIds.join(','));
    }
    const res = await fetch(`/api/live-lineup?${params.toString()}`);
    if (handleRateLimitResponse(res)) return null;
    if (!res.ok) throw new Error('Live-Daten konnten nicht geladen werden');
    return res.json();
  }, [isClientRateLimited, handleRateLimitResponse]);

  // Liga-weites Ranking laden (ohne nutzerspezifische userId im Query-Key,
  // damit alle Manager derselben Liga 1 gemeinsamen Edge-Cache teilen).
  const refreshRankingOnly = useCallback(async (league) => {
    if (!league || isClientRateLimited()) return null;
    const rankingRes = await fetch(`/api/live-ranking?leagueKey=${encodeURIComponent(league)}`);
    if (handleRateLimitResponse(rankingRes)) return null;
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
  }, [isClientRateLimited, handleRateLimitResponse]);

  // Eigene Spieltagself neu laden (vollstaendig oder nur fuer `onlyPlayerIds`).
  const refreshOwnOnly = useCallback(async (league, { onlyPlayerIds = null } = {}) => {
    if (!kickbaseId || !league || isClientRateLimited()) return null;
    const lineupJson = await loadLineup(league, kickbaseId, { onlyPlayerIds });
    if (!lineupJson) return null;

    const currentOwn = viewStateRef.current.ownData;
    const mergedPlayers =
      lineupJson.partial && currentOwn?.players?.length
        ? mergePartialLineupPlayers(currentOwn.players, lineupJson.players)
        : lineupJson.players;
    const nextOwnData = {
      ...(currentOwn || {}),
      ...lineupJson,
      players: mergedPlayers,
    };

    const prevOwn = diffAndSavePoints(
      `own:md${nextOwnData.matchday ?? 'cur'}:${kickbaseId}`,
      buildLineupPointsMap(mergedPlayers)
    );
    setOwnPrevPoints(prevOwn);
    setOwnAnimId(nextAnimId());
    setOwnData(nextOwnData);
    return sumPlayersPoints(mergedPlayers);
  }, [kickbaseId, isClientRateLimited, loadLineup]);

  // Aktuellen Kader (inkl. Auswechselspieler) laden: primaer live ueber
  // /api/live-squad (1 Call, 60s Edge-Cache), Fallback auf advisor-data.json.
  const loadCurrentSquad = useCallback(async (league) => {
    if (!kickbaseId) {
      setSquadLoading(false);
      return;
    }
    setSquadLoading(true);
    try {
      if (league && !isClientRateLimited()) {
        try {
          const res = await fetch(
            `/api/live-squad?userId=${encodeURIComponent(kickbaseId)}&leagueKey=${encodeURIComponent(league)}`
          );
          if (!handleRateLimitResponse(res) && res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const json = await res.json();
              if (Array.isArray(json?.players) && json.players.length > 0) {
                setCurrentSquadRaw(json.players);
                return;
              }
            }
          }
        } catch {
          // Fallback auf advisor-data.json
        }
      }

      const advRes = await fetch('/advisor-data.json', { cache: 'no-cache' });
      if (advRes.ok) {
        const advJson = await advRes.json();
        for (const lg of Object.values(advJson?.leagues || {})) {
          const found = lg?.managerSquads?.[String(kickbaseId)];
          if (Array.isArray(found) && found.length > 0) {
            setCurrentSquadRaw(found);
            return;
          }
        }
      }
      setCurrentSquadRaw([]);
    } catch {
      setCurrentSquadRaw([]);
    } finally {
      setSquadLoading(false);
    }
  }, [kickbaseId, isClientRateLimited, handleRateLimitResponse]);

  // Grundsetup beim Oeffnen: Liga ermitteln, Spieler-/Vereinswappen laden,
  // aktuellen Kader + Live-Ranking + eigene Spieltagself abrufen.
  const loadAll = useCallback(async () => {
    if (!kickbaseId) {
      setOwnLoading(false);
      setSquadLoading(false);
      return;
    }
    setOwnLoading(true);
    setSetupError(null);
    try {
      const [ratingsRes, catalogBundle] = await Promise.all([
        fetch('/history/manager-ratings.json'),
        loadPlayerCatalogBundle(),
      ]);
      const ratings = await ratingsRes.json();
      setPlayerMap(catalogBundle.catalogMap);
      setTeamLogoMap(catalogBundle.teamLogosById);
      setBlKickbaseTeams(buildKickbaseTeamsFromPlayers(catalogBundle.allPlayersRaw));

      const resolvedLeague = ratings[kickbaseId]?.league;
      if (!resolvedLeague) throw new Error('Liga konnte nicht ermittelt werden');
      setLeagueKey(resolvedLeague);

      await Promise.all([
        loadCurrentSquad(resolvedLeague),
        refreshRankingOnly(resolvedLeague),
        refreshOwnOnly(resolvedLeague),
      ]);
    } catch (e) {
      setSetupError(e.message || 'Unbekannter Fehler');
    } finally {
      setOwnLoading(false);
    }
  }, [kickbaseId, loadCurrentSquad, refreshRankingOnly, refreshOwnOnly]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectManager = useCallback(async (userId, forceRefresh = false, { onlyPlayerIds = null } = {}) => {
    setManagerPickerOpen(false);
    setSelectedManagerId(userId);
    if (!leagueKey || isClientRateLimited()) return null;
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
    try {
      const lineupJson = await loadLineup(leagueKey, userId, { onlyPlayerIds });
      if (!lineupJson || managerReqRef.current !== reqId) return null;

      const currentMgr = viewStateRef.current.managerData;
      const mergedPlayers =
        lineupJson.partial && currentMgr?._userId === userId && currentMgr?.players?.length
          ? mergePartialLineupPlayers(currentMgr.players, lineupJson.players)
          : lineupJson.players;
      const nextMgrData = {
        ...(currentMgr?._userId === userId ? currentMgr : {}),
        ...lineupJson,
        players: mergedPlayers,
        _userId: userId,
      };

      const prevMgr = diffAndSavePoints(
        `mgr:md${nextMgrData.matchday ?? 'cur'}:${userId}`,
        buildLineupPointsMap(mergedPlayers)
      );
      setManagerPrevPoints(prevMgr);
      setManagerAnimId(nextAnimId());
      setManagerData(nextMgrData);
      return sumPlayersPoints(mergedPlayers);
    } catch {
      if (managerReqRef.current !== reqId) return null;
      if (!forceRefresh && !cached) setManagerData(null);
      return null;
    } finally {
      if (managerReqRef.current === reqId) {
        setManagerLoading(false);
      }
    }
  }, [leagueKey, selectedManagerId, managerData, isClientRateLimited, loadLineup]);

  // Bundesliga-Teamliste (Wappen + Team-IDs) einmalig im Hintergrund laden,
  // damit aus den Partien direkt die Kickbase-Startelf geoeffnet werden kann.
  useEffect(() => {
    if (mode !== 'teams' || teamsList !== null) return;
    let cancelled = false;
    fetch(`/api/live-teams-list?competitionId=${BUNDESLIGA_COMPETITION_ID}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (!cancelled) setTeamsList(json?.teams || []); })
      .catch(() => { if (!cancelled) setTeamsList([]); });
    return () => { cancelled = true; };
  }, [mode, teamsList]);

  const selectTeam = useCallback(async (teamId, forceRefresh = false) => {
    setSelectedTeamId(teamId);
    setTeamError(null);
    if (isClientRateLimited()) return null;

    const reqId = ++teamReqRef.current;
    const cacheKey = `team:${BUNDESLIGA_COMPETITION_ID}:${teamId}`;
    const cached = readCachedSnapshot(cacheKey);
    if (!forceRefresh) {
      setTeamCached(cached);
      setTeamData(null);
      setTeamPrevPoints(null);
      setTeamLoading(!cached);
    }
    try {
      const res = await fetch(`/api/live-team?competitionId=${BUNDESLIGA_COMPETITION_ID}&teamId=${teamId}`);
      if (handleRateLimitResponse(res)) return null;
      if (!res.ok) throw new Error('Team-Daten konnten nicht geladen werden');
      const json = await res.json();
      if (teamReqRef.current !== reqId) return null;
      const teamScope = json.matchId
        ? `team:m:${json.matchId}:${teamId}`
        : `team:c:${BUNDESLIGA_COMPETITION_ID}:${teamId}`;
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
      }
    }
  }, [isClientRateLimited, handleRateLimitResponse]);

  const clearSelectedTeam = useCallback(() => {
    teamReqRef.current += 1;
    setSelectedTeamId(null);
    setTeamData(null);
    setTeamCached(null);
    setTeamPrevPoints(null);
    setTeamError(null);
    setTeamLoading(false);
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

  // Backend-gesteuerter 60s-Live-Tick: aktualisiert NUR aktuell laufende
  // Spieler/Teams bzw. das liga-weit gecachte Ranking (im "Live"- & "Spieltag"-Tab).
  const runScheduledKickbaseTick = useCallback(async ({ ignoreMinGap = false } = {}) => {
    if (document.visibilityState !== 'visible') return;
    if (isClientRateLimited()) return;

    const now = Date.now();
    if (!ignoreMinGap && now - lastKickbaseTickAtRef.current < KICKBASE_MIN_GAP_MS) return;

    const state = viewStateRef.current;
    const blMatches = liveWatcherRef.current.matches;

    setBgSyncing(true);
    try {
      if (state.mode === 'live') {
        if (!state.leagueKey) return;
        if (state.liveSubView === 'own') {
          if (!state.kickbaseId || !state.ownData?.players?.length) return;
          const liveIds = getActivePlayerIdsForLineup(
            state.ownData.players,
            state.playerMap,
            blMatches,
            state.allBlKickbaseTeams
          );
          if (liveIds.length === 0) return;
          lastKickbaseTickAtRef.current = Date.now();
          await refreshOwnOnly(state.leagueKey, { onlyPlayerIds: liveIds });
        } else {
          lastKickbaseTickAtRef.current = Date.now();
          const tasks = [refreshRankingOnly(state.leagueKey)];
          if (!state.managerPickerOpen && state.selectedManagerId && state.managerData?.players?.length) {
            const liveIds = getActivePlayerIdsForLineup(
              state.managerData.players,
              state.playerMap,
              blMatches,
              state.allBlKickbaseTeams
            );
            if (liveIds.length > 0) {
              tasks.push(selectManager(state.selectedManagerId, true, { onlyPlayerIds: liveIds }));
            }
          }
          await Promise.all(tasks);
        }
      } else if (state.mode === 'teams') {
        if (!state.selectedTeamId) return;
        const activeTeamIds = getActiveBundesligaKickbaseTeamIds(blMatches, state.allBlKickbaseTeams);
        if (activeTeamIds.size > 0 && !activeTeamIds.has(String(state.selectedTeamId))) return;
        lastKickbaseTickAtRef.current = Date.now();
        await selectTeam(state.selectedTeamId, true);
      }
    } catch {
      // Stiller 60s-Hintergrund-Tick
    } finally {
      setBgSyncing(false);
    }
  }, [isClientRateLimited, refreshOwnOnly, refreshRankingOnly, selectManager, selectTeam]);

  // Sofort-Trigger bei OpenLigaDB-Live-Ereignissen (Tor, Elfmeter, Eigentor,
  // Halbzeit, Abpfiff) - zusaetzlich zum 60s-Takt, mit Team-Filter, Jitter,
  // Partial-Refresh (`onlyPlayerIds`) und max. 1 Nachcheck nach 45s.
  const scheduleAutoKickbaseSync = useCallback((triggeredMatches) => {
    if (!Array.isArray(triggeredMatches) || triggeredMatches.length === 0) return;
    if (document.visibilityState !== 'visible' || isClientRateLimited()) return;

    const state = viewStateRef.current;
    let action = null; // 'own_live' | 'manager_lineup' | 'ranking_only' | 'team'
    let primaryTrigger = triggeredMatches[0];

    if (state.mode === 'live') {
      if (!state.leagueKey) return;
      if (state.liveSubView === 'own') {
        if (!state.kickbaseId || !state.ownData?.players?.length) return;
        const relevantIds = collectLineupTeamIds(state.ownData.players, state.playerMap);
        const hits = matchTriggeredEventsToTeamIds(triggeredMatches, relevantIds, state.allBlKickbaseTeams);
        if (hits.length === 0) return;
        primaryTrigger = hits[0];
        action = 'own_live';
      } else if (!state.managerPickerOpen && state.selectedManagerId && state.managerData?.players?.length) {
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
      if (!state.selectedTeamId) return;
      const relevantIds = new Set([String(state.selectedTeamId)]);
      const hits = matchTriggeredEventsToTeamIds(triggeredMatches, relevantIds, state.allBlKickbaseTeams);
      if (hits.length === 0) return;
      primaryTrigger = hits[0];
      action = 'team';
    }

    if (!action) return;

    const now = Date.now();
    if (now - lastEventTriggerAtRef.current < EVENT_TRIGGER_COOLDOWN_MS) return;

    cancelPendingEventTimers();
    lastEventTriggerAtRef.current = now;

    const triggerSummary = formatTriggerSummary(primaryTrigger);
    const jitterMs =
      EVENT_TRIGGER_JITTER_MIN_MS +
      Math.floor(Math.random() * (EVENT_TRIGGER_JITTER_MAX_MS - EVENT_TRIGGER_JITTER_MIN_MS));

    showTransientBanner({ text: triggerSummary, subtext: 'Live-Punkte werden abgeglichen…', status: 'pending' });

    const runAction = async () => {
      const current = viewStateRef.current;
      if (document.visibilityState !== 'visible' || isClientRateLimited()) {
        showTransientBanner(null);
        return { performed: false, beforePoints: null, afterPoints: null };
      }

      setBgSyncing(true);
      showTransientBanner({ text: triggerSummary, subtext: 'Aktualisiere Live-Punkte…', status: 'syncing' });
      lastKickbaseTickAtRef.current = Date.now();

      try {
        const blMatches = liveWatcherRef.current.matches;

        if (action === 'own_live' && current.mode === 'live' && current.liveSubView === 'own' && current.leagueKey) {
          const beforePoints = sumPlayersPoints(current.ownData?.players);
          const liveIds = getActivePlayerIdsForLineup(
            current.ownData?.players,
            current.playerMap,
            blMatches,
            current.allBlKickbaseTeams
          );
          const afterPoints = await refreshOwnOnly(current.leagueKey, {
            onlyPlayerIds: liveIds.length > 0 ? liveIds : null,
          });
          return { performed: true, beforePoints, afterPoints };
        }

        if (action === 'manager_lineup' && current.mode === 'live' && current.liveSubView === 'ranking' && current.selectedManagerId && current.leagueKey) {
          const beforePoints = sumPlayersPoints(current.managerData?.players);
          const liveIds = getActivePlayerIdsForLineup(
            current.managerData?.players,
            current.playerMap,
            blMatches,
            current.allBlKickbaseTeams
          );
          const [afterPoints] = await Promise.all([
            selectManager(current.selectedManagerId, true, {
              onlyPlayerIds: liveIds.length > 0 ? liveIds : null,
            }),
            refreshRankingOnly(current.leagueKey),
          ]);
          return { performed: true, beforePoints, afterPoints };
        }

        if (action === 'ranking_only' && current.mode === 'live' && current.liveSubView === 'ranking' && current.leagueKey) {
          await refreshRankingOnly(current.leagueKey);
          return { performed: true, beforePoints: null, afterPoints: null };
        }

        if (action === 'team' && current.mode === 'teams' && current.selectedTeamId) {
          const beforePoints = sumPlayersPoints(current.teamData?.players);
          const afterPoints = await selectTeam(current.selectedTeamId, true);
          return { performed: true, beforePoints, afterPoints };
        }

        return { performed: false, beforePoints: null, afterPoints: null };
      } finally {
        setBgSyncing(false);
      }
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

        showTransientBanner(
          { text: triggerSummary, subtext: 'Warte auf Kickbase-Buchung (Nachcheck in 45s)…', status: 'pending' },
          EVENT_TRIGGER_FOLLOWUP_DELAY_MS + 2000
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
        }, EVENT_TRIGGER_FOLLOWUP_DELAY_MS);
      } catch {
        showTransientBanner(null);
      }
    }, jitterMs);
  }, [
    isClientRateLimited,
    cancelPendingEventTimers,
    showTransientBanner,
    refreshOwnOnly,
    refreshRankingOnly,
    selectManager,
    selectTeam,
  ]);

  // Aktualisiert den zentralen OpenLigaDB-Watcher-State (aktueller Bundesliga-Spieltag)
  // und loest bei neuen Live-Ereignissen den sofortigen Kickbase-Trigger aus.
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

  // Bundesliga-Partien fuer den im "Spieltag"-Tab gewaehlten Spieltag laden.
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
      // Stiller Hintergrund-Check
    }
  }, [applyCurrentMatchdaySnapshot]);

  // Einmaliger Initial-Check des aktuellen Bundesliga-Spieltags beim Oeffnen des Live-Tabs.
  useEffect(() => {
    pollCurrentBundesliga({ checkLastChangeOnly: false, allowTrigger: false });
  }, [pollCurrentBundesliga]);

  // OpenLigaDB-Partien nachladen, sobald im "Spieltag"-Tab der Spieltag gewechselt wird.
  useEffect(() => {
    if (mode !== 'teams') return;
    if (blMatchday == null && blMatchesDataRef.current) return;
    loadBundesligaMatches(blMatchday, { silent: false, nocache: false });
  }, [mode, blMatchday, loadBundesligaMatches]);

  // Zentrales 30s-OpenLigaDB-Live-Polling ueber den gesamten Live-Tab.
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

  // Zentraler 60s-Kickbase-Live-Takt (Backend-gesteuert, kein manueller Refresh).
  useEffect(() => {
    if (!blLiveActive) return undefined;

    let intervalId = null;
    const phaseOffsetMs = 2000 + Math.floor(Math.random() * 7000);

    const startTimer = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        runScheduledKickbaseTick();
      }, KICKBASE_POLL_INTERVAL_MS);
    }, phaseOffsetMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runScheduledKickbaseTick();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearTimeout(startTimer);
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [blLiveActive, runScheduledKickbaseTick]);

  useEffect(() => () => {
    cancelPendingEventTimers();
    if (blHighlightTimerRef.current) window.clearTimeout(blHighlightTimerRef.current);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    if (rateLimitTimerRef.current) window.clearTimeout(rateLimitTimerRef.current);
  }, [cancelPendingEventTimers]);

  // Aktuellen Kader (aus /api/live-squad oder advisor-data.json) mit
  // all_players.json (Marktwert, 24h-Tendenz `tfhmvt`/`mvt`, Startelf-Prognose
  // `prob`, Fotos, Vereinswappen) anreichern fuer den "Mein Kader"-Tab.
  const enrichedCurrentSquad = useMemo(() => {
    if (!Array.isArray(currentSquadRaw) || currentSquadRaw.length === 0) return null;
    return currentSquadRaw.map((p) => {
      const pid = String(p.playerId ?? p.id);
      const full = playerMap?.get(pid);
      const fullName = full
        ? `${full.fn || ''} ${full.ln || ''}`.trim()
        : p.firstName
          ? `${p.firstName} ${p.name || ''}`.trim()
          : (p.name || `Spieler ${pid}`);
      const tid = p.teamId != null ? String(p.teamId) : (full?.tid != null ? String(full.tid) : null);
      const mvTrendAmount =
        typeof p.mvTrendAmount === 'number'
          ? p.mvTrendAmount
          : typeof full?.tfhmvt === 'number'
            ? full.tfhmvt
            : typeof p.changeYesterday === 'number'
              ? p.changeYesterday
              : null;
      const mvTrendDir =
        typeof p.mvTrendDir === 'number'
          ? p.mvTrendDir
          : typeof full?.mvt === 'number'
            ? full.mvt
            : null;
      return {
        id: pid,
        position: full?.pos || p.position || 3,
        name: fullName,
        lastName: full?.ln || p.name || fullName,
        teamName: full?.tn || p.team || null,
        teamLogo: (tid && teamLogoMap?.get(tid)) || (full?.tim ? `https://kickbase.b-cdn.net/${full.tim}` : null),
        imagePath: full?.pim || p.imagePath || null,
        marketValue: typeof full?.mv === 'number' && full.mv > 0 ? full.mv : (p.marketValue ?? 0),
        mvTrendAmount,
        mvTrendDir,
        prob: typeof full?.prob === 'number' ? full.prob : (p.prob ?? p.startElfProbability ?? null),
        status: typeof full?.st === 'number' ? full.st : (p.status ?? 0),
        lineupOrder: typeof p.lineupOrder === 'number' ? p.lineupOrder : null,
      };
    });
  }, [currentSquadRaw, playerMap, teamLogoMap]);

  useEffect(() => {
    if (kickbaseId && enrichedCurrentSquad && enrichedCurrentSquad.length > 0) {
      saveCachedSnapshot(`squad:${kickbaseId}`, enrichedCurrentSquad);
    }
  }, [kickbaseId, enrichedCurrentSquad]);

  const displayedCurrentSquad = enrichedCurrentSquad || cachedSquad || null;

  const liveStartingIds = useMemo(() => {
    const ids = new Set();
    for (const p of ownData?.players || []) {
      if (p?.playerId != null && !p.error) ids.add(String(p.playerId));
    }
    return ids;
  }, [ownData]);

  // Gemeinsame Anreicherung: live-lineup.js-Rohdaten -> Name/Position/Foto aus
  // all_players.json + Vereinswappen - identisch fuer eigene Spieltagself & Liga-Manager.
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
  const selectedTeam = allBlKickbaseTeams.find((t) => String(t.id) === String(selectedTeamId));

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

  // Frische, fertig angereicherte Aufstellungen im Cache ablegen.
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
    if (!selectedTeam || !displayedBlMatches?.matches) return null;
    return findOpenLigaMatchForKickbaseTeam(displayedBlMatches.matches, selectedTeam);
  }, [selectedTeam, displayedBlMatches]);
  const leagueAccentColor = LEAGUE_COLORS[leagueKey] || '#4ba6ff';
  const blAutoPollingActive = Boolean(
    mode === 'teams' &&
    blLiveActive &&
    (blMatchday == null || blMatchday === blCurrentMatchday)
  );

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10 pb-28 sm:pb-28">
      <div className="max-w-[700px] mx-auto">
        <TabPageHeader
          className="mb-5"
          logo={
            mode === 'own' ? (
              <img src={kaderLogo} alt="Mein Kader Logo" className="w-full h-full object-contain p-0.5" />
            ) : mode === 'teams' ? (
              <img src={spielplanLogo} alt="Spieltag Logo" className="w-full h-full object-contain p-0.5" />
            ) : (
              <div className="w-full h-full rounded-2xl bg-[#ef4444]/10 flex items-center justify-center">
                <span className="relative flex h-3.5 w-3.5 sm:h-4 sm:w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 sm:h-4 sm:w-4 bg-[#ef4444]"></span>
                </span>
              </div>
            )
          }
          eyebrow={displayedMatchday ? `SPIELTAG ${displayedMatchday} · LIVE` : 'LIVE'}
          accentColor="#ef4444"
          title="Live Punkte"
          right={(
            <div className="flex items-center gap-2 shrink-0">
              {rateLimited ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-amber-500/10 border-amber-400/35 text-[10px] font-bold uppercase tracking-wider text-amber-300 whitespace-nowrap">
                  <span>Pause</span>
                </span>
              ) : blLiveActive ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-[#ef4444]/15 border-[#ef4444]/40 text-[10px] font-bold uppercase tracking-wider text-[#ef4444] whitespace-nowrap">
                  {bgSyncing ? (
                    <RefreshCw size={11} className="animate-spin" />
                  ) : (
                    <Radio size={11} className="animate-pulse" />
                  )}
                  <span>Live · 60s</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-[#171717] border-[#2e2e2e] text-[10px] font-semibold uppercase tracking-wider text-[#626978] whitespace-nowrap">
                  <span>Auto-Live</span>
                </span>
              )}
            </div>
          )}
        >
          <ModeSwitch mode={mode} onChange={setMode} />
        </TabPageHeader>

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

        {/* TAB 1: MEIN KADER (aktueller Kader auf dem Feld + nach Positionen gruppierte Liste darunter) */}
        {mode === 'own' && (
          <>
            {!kickbaseId ? (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#8b92a5]">
                Verbinde zuerst deinen Kickbase-Account in deinem Profil.
              </div>
            ) : (
              <CurrentSquadView
                players={displayedCurrentSquad}
                liveStartingIds={liveStartingIds}
                loading={squadLoading}
              />
            )}
          </>
        )}

        {/* TAB 2: LIVE (Spieltagself mit Live-Punkten + optionales Liga-Ranking) */}
        {mode === 'live' && (
          <>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setLiveSubView('own')}
                className={`px-3.5 py-1.5 rounded-full whitespace-nowrap text-xs border transition-colors cursor-pointer ${
                  liveSubView === 'own'
                    ? 'bg-[#ef4444]/15 border-[#ef4444] text-white font-semibold'
                    : 'border-[#2e2e2e] text-[#8b92a5] font-medium hover:text-white'
                }`}
              >
                Meine Spieltagself
              </button>
              <button
                type="button"
                onClick={() => setLiveSubView('ranking')}
                className={`px-3.5 py-1.5 rounded-full whitespace-nowrap text-xs border transition-colors cursor-pointer ${
                  liveSubView === 'ranking'
                    ? 'bg-[#ef4444]/15 border-[#ef4444] text-white font-semibold'
                    : 'border-[#2e2e2e] text-[#8b92a5] font-medium hover:text-white'
                }`}
              >
                Liga-Ranking
              </button>
            </div>

            {liveSubView === 'own' ? (
              !kickbaseId ? (
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
              ) : null
            ) : managerPickerOpen ? (
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

        {/* TAB 3: SPIELTAG (nur Bundesliga-Partien via OpenLigaDB, Team-Startelf per Klick aus Partie) */}
        {mode === 'teams' && (
          <>
            {teamError && (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-red-400 mb-4">{teamError}</div>
            )}

            {selectedTeamId ? (
              <>
                {selectedTeamOpenLigaMatch ? (
                  <SelectedTeamMatchBanner
                    key={`banner-${selectedTeamOpenLigaMatch.match.matchId}-${selectedTeamOpenLigaMatch.side}`}
                    match={selectedTeamOpenLigaMatch.match}
                    selectedSide={selectedTeamOpenLigaMatch.side}
                    teamsList={allBlKickbaseTeams}
                    onSelectTeam={selectTeam}
                    onShowAllMatches={clearSelectedTeam}
                    isUpdated={blChangedMatchIds.has(selectedTeamOpenLigaMatch.match.matchId)}
                    newEventIds={blNewEventIds}
                  />
                ) : (
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={clearSelectedTeam}
                      className="text-xs font-semibold text-[#8b92a5] hover:text-white transition-colors cursor-pointer"
                    >
                      ← Alle Partien
                    </button>
                    {selectedTeam && displayedTeamMeta?.score && (
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                        <span>{selectedTeam.name}</span>
                        <span className="text-[#626978]">·</span>
                        <span className="tabular-nums">{displayedTeamMeta.score}</span>
                        {displayedTeamMeta.isLive && (
                          <span className="text-xs font-semibold text-[#ef4444]">LIVE {displayedTeamMeta.minute}'</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {displayedTeamLineup ? (
                  <LiveLineupPitch
                    key={`team-${selectedTeamId}`}
                    lineup={displayedTeamLineup}
                    totalPoints={displayedTeamTotalPoints}
                    prevPointsMap={teamLineup ? teamPrevPoints : null}
                    animId={teamLineup ? teamAnimId : null}
                  />
                ) : teamLoading ? (
                  <div className="text-center text-[#8b92a5] text-sm py-10">Lade Live-Daten…</div>
                ) : null}
              </>
            ) : (
              <BundesligaMatchesSection
                matchesData={displayedBlMatches}
                loading={blMatchesLoading}
                error={blMatchesError}
                activeMatchday={blMatchday ?? displayedBlMatches?.matchday ?? null}
                currentMatchday={blCurrentMatchday}
                onChangeMatchday={setBlMatchday}
                onRetry={() => loadBundesligaMatches(blMatchday, { silent: false, nocache: false })}
                teamsList={allBlKickbaseTeams}
                onSelectKickbaseTeam={selectTeam}
                changedMatchIds={blChangedMatchIds}
                newEventIds={blNewEventIds}
                autoPollingActive={blAutoPollingActive}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LiveLineupPage;
