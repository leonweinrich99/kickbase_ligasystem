// TEST-Route (Owner-Wunsch 23.11.2026: "koennen wir einen Test mit Live-
// Daten zum aktuellen Spiel in der La Liga machen? Baue das kurz in die App
// ein um das zu ueberpruefen") - zeigt die Live-Punkte der Startelf eines
// ECHTEN Fussball-Teams (nicht eines Kickbase-Fantasy-Kaders) waehrend eines
// laufenden Spiels, unabhaengig von Liga/Wettbewerb. Beweist, dass der
// gleiche Live-Punkte-Mechanismus (playercenter) auch ausserhalb Bundesliga/
// Kickbase-Fantasy-Ligen funktioniert - playercenter braucht nachweislich
// KEINE leagueId.
//
// Ohne matchId: sucht automatisch das erste LIVE-Spiel im angegebenen
// Wettbewerb (Default: competitionId=3 = La Liga).
import { API_BASE, getJson, loginAny, getEventTypeMap } from './_kickbaseClient.js';

export default async function handler(req, res) {
  const { competitionId = '3', matchId: requestedMatchId, team = 't1' } = req.query;

  const token = await loginAny();
  if (!token) {
    return res.status(502).json({ error: 'Login bei Kickbase fehlgeschlagen' });
  }

  let matchId = requestedMatchId;
  let day = null;

  if (!matchId) {
    const matchdays = await getJson(`${API_BASE}/competitions/${competitionId}/matchdays`, token);
    const allMatches = (matchdays?.it || []).flatMap((md) => (md.it || []).map((m) => ({ ...m, day: md.day })));
    const live = allMatches.find((m) => m.il === true);
    const chosen = live || [...allMatches].reverse().find((m) => m.st === 2) || allMatches[allMatches.length - 1];
    if (!chosen) {
      return res.status(404).json({ error: 'Kein Spiel in diesem Wettbewerb gefunden' });
    }
    matchId = chosen.mi;
    day = chosen.day;
  }

  const details = await getJson(`${API_BASE}/matches/${matchId}/details`, token);
  if (!details) {
    return res.status(502).json({ error: 'Match-Details konnten nicht geladen werden' });
  }
  if (!day) {
    // Spieltag aus den Events ableiten (details liefert selbst keinen "day").
    day = details.mdln ? parseInt(String(details.mdln).match(/\d+/)?.[0], 10) : null;
  }

  const lineupKey = team === 't2' ? 't2lp' : 't1lp';
  const teamName = team === 't2' ? details.t2n : details.t1n;
  const lineup = details[lineupKey] || [];

  const eventTypeMap = await getEventTypeMap(token);

  const ownGoals = team === 't2' ? details.t2g : details.t1g;
  const opponentGoals = team === 't2' ? details.t1g : details.t2g;

  const players = await Promise.all(
    lineup.map(async (p) => {
      const pc = day
        ? await getJson(`${API_BASE}/competitions/${competitionId}/playercenter/${p.i}?dayNumber=${day}`, token)
        : null;
      return {
        id: p.i,
        name: p.n,
        position: p.pos,
        imagePath: p.pim,
        points: pc?.p ?? null,
        events: (pc?.events || [])
          .filter((e) => e.p !== 0)
          .map((e) => ({ label: eventTypeMap.get(e.eti) || 'Aktion', points: e.p, minute: e.mt }))
          .sort((a, b) => b.minute - a.minute),
        goalsFor: ownGoals ?? null,
        goalsAgainst: opponentGoals ?? null,
        matchStatus: details.il ? null : 2,
        matchMinute: details.mt ?? null,
      };
    })
  );

  return res.status(200).json({
    matchId,
    matchday: day,
    teamName,
    isLive: details.il === true,
    score: `${details.t1g ?? 0}:${details.t2g ?? 0}`,
    minute: details.mt,
    players,
  });
}
