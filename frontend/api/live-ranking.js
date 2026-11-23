// Live-Ranking der GESAMTEN Liga fuer den aktuellen Spieltag (Owner-Wunsch
// 23.11.2026, "auch ein Live-Ranking anzeigen" - analog zur "LEADERBOARD
// LIVE"-Ansicht in der offiziellen Kickbase-App).
//
// Guenstig im Gegensatz zu live-lineup.js: EIN teamcenter-Call liefert
// bereits ALLE Manager der Liga mit ihren Live-Spieltagspunkten (`mdp`) auf
// einmal (us[]-Array, siehe auch backend/reconstructStartingEleven.js) -
// keine einzelnen playercenter-Abfragen pro Spieler noetig, das waeren sonst
// bis zu 11 Calls PRO Manager nur fuer eine Rangliste.
import { API_BASE, loginAndFindLeague, getJson, resolveMatchday, EXCLUDED_MANAGER_NAMES } from './_kickbaseClient.js';

export default async function handler(req, res) {
  const { userId, leagueKey, dayNumber } = req.query;
  if (!userId || !leagueKey) {
    return res.status(400).json({ error: 'userId und leagueKey sind erforderlich' });
  }

  const auth = await loginAndFindLeague(leagueKey);
  if (!auth) {
    return res.status(502).json({ error: 'Login bei Kickbase fehlgeschlagen oder Liga nicht gefunden' });
  }
  const { token, leagueId } = auth;

  const day = await resolveMatchday(leagueId, token, dayNumber);
  if (!day) {
    return res.status(502).json({ error: 'Aktueller Spieltag konnte nicht ermittelt werden' });
  }

  const teamcenter = await getJson(
    `${API_BASE}/leagues/${leagueId}/users/${userId}/teamcenter?dayNumber=${day}`,
    token
  );

  const ranking = (teamcenter?.us || [])
    .filter((u) => !EXCLUDED_MANAGER_NAMES.includes(u.unm))
    .map((u) => ({ userId: String(u.i), name: u.unm, livePoints: u.mdp || 0 }))
    .sort((a, b) => b.livePoints - a.livePoints);

  return res.status(200).json({ matchday: day, ranking });
}
