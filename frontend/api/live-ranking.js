// Live-Ranking der GESAMTEN Liga fuer den aktuellen Spieltag (Owner-Wunsch
// 23.11.2026, "auch ein Live-Ranking anzeigen" - analog zur "LEADERBOARD
// LIVE"-Ansicht in der offiziellen Kickbase-App).
//
// Liga-weites Edge- & Server-Caching (ohne nutzerspezifische userId im Key):
// Alle Manager derselben Liga teilen sich einen einzigen gecachten teamcenter-Call.
import {
  loginAndFindLeague,
  resolveLeagueMeta,
  getTeamCenterCached,
  EXCLUDED_MANAGER_NAMES,
  setLiveCacheHeaders,
  sendRateLimitIfActive,
  isNumericId,
  isValidLeagueKey,
} from './_kickbaseClient.js';

export default async function handler(req, res) {
  if (sendRateLimitIfActive(res)) return;

  const { userId, leagueKey, dayNumber } = req.query;
  if (!isValidLeagueKey(leagueKey)) {
    return res.status(400).json({ error: 'Gueltiger leagueKey (L1/L2/L3) ist erforderlich' });
  }
  if (userId != null && userId !== '' && !isNumericId(String(userId))) {
    return res.status(400).json({ error: 'Ungueltige userId' });
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

  const meta = await resolveLeagueMeta(leagueId, token, dayNumber);
  if (sendRateLimitIfActive(res)) return;
  const day = meta.day;
  const resolvedUserId = userId || meta.sampleUserId;
  if (!day || !resolvedUserId) {
    return res.status(502).json({ error: 'Aktueller Spieltag konnte nicht ermittelt werden' });
  }

  const teamcenter = await getTeamCenterCached(leagueId, resolvedUserId, day, token);
  if (sendRateLimitIfActive(res)) return;

  const ranking = (teamcenter?.us || [])
    .filter((u) => !EXCLUDED_MANAGER_NAMES.includes(u.unm))
    .map((u) => ({ userId: String(u.i), name: u.unm, livePoints: u.mdp || 0 }))
    .sort((a, b) => b.livePoints - a.livePoints);

  setLiveCacheHeaders(res, { maxAge: 30, staleWhileRevalidate: 30 });
  return res.status(200).json({ matchday: day, ranking });
}
