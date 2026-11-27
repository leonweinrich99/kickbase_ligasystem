// Live-Punkte fuer die Startelf EINES Managers - gesteuert ueber das Backend
// mit Token-/Teamcenter-/Playercenter-Cache (liga-uebergreifend), 4er-Batches,
// 429-Backoff und optionalem Partial-Refresh (`onlyPlayerIds`) fuer Spieler
// aus aktuell laufenden Partien.
import {
  COMPETITION_ID,
  loginAndFindLeague,
  resolveMatchday,
  getTeamCenterCached,
  getPlayerCenterCached,
  getEventTypeMap,
  mapInBatches,
  setLiveCacheHeaders,
  sendRateLimitIfActive,
  isNumericId,
  isValidLeagueKey,
} from './_kickbaseClient.js';

export default async function handler(req, res) {
  if (sendRateLimitIfActive(res)) return;

  const { userId, leagueKey, dayNumber, onlyPlayerIds } = req.query;
  if (!isNumericId(userId) || !isValidLeagueKey(leagueKey)) {
    return res.status(400).json({ error: 'Gueltige userId und leagueKey (L1/L2/L3/POKAL) sind erforderlich' });
  }
  if (dayNumber != null && dayNumber !== '' && !isNumericId(String(dayNumber))) {
    return res.status(400).json({ error: 'Ungueltige dayNumber' });
  }

  const auth = await loginAndFindLeague(leagueKey);
  if (sendRateLimitIfActive(res)) return;
  if (!auth) {
    return res.status(502).json({ error: 'Login bei Kickbase fehlgeschlagen oder Liga nicht gefunden' });
  }
  const { token, leagueId } = auth;

  const day = await resolveMatchday(leagueId, token, dayNumber);
  if (sendRateLimitIfActive(res)) return;
  if (!day) {
    return res.status(502).json({ error: 'Aktueller Spieltag konnte nicht ermittelt werden' });
  }

  let playerIds = [];
  let partial = false;
  let officialPoints = null;
  let emptySlots = 0;

  if (typeof onlyPlayerIds === 'string' && onlyPlayerIds.trim().length > 0) {
    const parsed = onlyPlayerIds
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s))
      .slice(0, 15);
    if (parsed.length > 0) {
      playerIds = parsed;
      partial = true;
    }
  }

  if (!partial) {
    // Startelf-Spieler-IDs des angefragten Managers fuer diesen Spieltag (25s gecacht).
    // Im Pokalmodus (gpm=4) enthaelt teamcenter.us nur den angefragten Manager -> perUser: true.
    const teamcenter = await getTeamCenterCached(leagueId, userId, day, token, {
      perUser: leagueKey === 'POKAL',
    });
    if (sendRateLimitIfActive(res)) return;
    const myEntry = (teamcenter?.us || []).find((u) => String(u.i) === String(userId)) || (leagueKey === 'POKAL' ? teamcenter?.us?.[0] : null);
    if (typeof myEntry?.mdp === 'number') officialPoints = myEntry.mdp;
    const rawSlots = Array.isArray(myEntry?.lp) ? myEntry.lp : [];
    emptySlots = rawSlots.length > 0 ? rawSlots.filter((x) => x == null).length : 0;
    playerIds = rawSlots.filter(Boolean);
    if (playerIds.length === 0 && Array.isArray(teamcenter?.lp)) {
      playerIds = teamcenter.lp.map((p) => p?.i).filter(Boolean);
    }
  }

  if (playerIds.length === 0) {
    setLiveCacheHeaders(res, { maxAge: 25, staleWhileRevalidate: 25 });
    return res.status(200).json({ matchday: day, partial, officialPoints, emptySlots, players: [], note: 'Keine Startelf fuer diesen Spieltag gefunden' });
  }

  const eventTypeMap = await getEventTypeMap(token);
  if (sendRateLimitIfActive(res)) return;

  // Live-Punkte + Event-Verlauf in 4er-Batches ueber den liga-uebergreifenden 30s-Cache.
  const players = await mapInBatches(
    playerIds,
    async (playerId) => {
      const pc = await getPlayerCenterCached(COMPETITION_ID, playerId, day, token);
      if (!pc) return { playerId, error: true };
      return {
        playerId,
        name: pc.n,
        teamId: pc.tid,
        points: pc.p,
        matchMinute: pc.mt,
        matchStatus: pc.mst, // 2 = beendet, sonst laufend/nicht gestartet
        matchDisplay: pc.mtd,
        opponentTeamId: pc.t1 === Number(pc.tid) ? pc.t2 : pc.t1,
        goalsFor: pc.t1g,
        goalsAgainst: pc.t2g,
        events: (pc.events || [])
          .filter((e) => e.p !== 0)
          .map((e) => ({ label: eventTypeMap.get(e.eti) || 'Aktion', points: e.p, minute: e.mt }))
          .sort((a, b) => b.minute - a.minute),
      };
    },
    4,
    60
  );

  if (sendRateLimitIfActive(res)) return;

  setLiveCacheHeaders(res, { maxAge: 25, staleWhileRevalidate: 25 });
  return res.status(200).json({ matchday: day, partial, officialPoints, emptySlots, players });
}
