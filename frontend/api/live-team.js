// Live-Punkte der Startelf eines ECHTEN Fussball-Teams (nicht eines
// Kickbase-Fantasy-Kaders) - Owner-Wunsch 24.11.2026: "auch auf gesamte
// Teams zwischen denen man auswaehlen kann" (urspruenglich als Test fuer die
// La Liga eingebaut, jetzt fester Bestandteil des "Echte Teams"-Umschalters
// auf der Live-Seite). Funktioniert fuer jeden Wettbewerb/jedes Team, da
// playercenter nachweislich KEINE leagueId braucht.
//
// Mit teamId: sucht das aktuell relevanteste Spiel DIESES Teams (laufendes
// Spiel bevorzugt, sonst das zuletzt beendete, sonst das naechste
// angesetzte). Ohne teamId (Legacy/Fallback): erstes LIVE-Spiel im
// Wettbewerb, wie zuvor.
import { API_BASE, getJson, loginAny, getEventTypeMap, setLiveCacheHeaders } from './_kickbaseClient.js';

export default async function handler(req, res) {
  const { competitionId = '1', matchId: requestedMatchId, teamId, team: teamSideParam, nocache } = req.query;

  const token = await loginAny();
  if (!token) {
    return res.status(502).json({ error: 'Login bei Kickbase fehlgeschlagen' });
  }

  let matchId = requestedMatchId;
  let day = null;
  let teamSide = teamSideParam || 't1';

  if (!matchId) {
    const matchdays = await getJson(`${API_BASE}/competitions/${competitionId}/matchdays`, token);
    const allMatches = (matchdays?.it || []).flatMap((md) => (md.it || []).map((m) => ({ ...m, day: md.day })));

    let chosen;
    if (teamId) {
      const candidates = allMatches.filter((m) => m.t1 === String(teamId) || m.t2 === String(teamId));
      const live = candidates.find((m) => m.il === true);
      const finished = [...candidates].reverse().find((m) => m.st === 2);
      chosen = live || finished || candidates[candidates.length - 1];
      if (!chosen) {
        return res.status(404).json({ error: 'Kein Spiel fuer dieses Team gefunden' });
      }
      teamSide = chosen.t1 === String(teamId) ? 't1' : 't2';
    } else {
      const live = allMatches.find((m) => m.il === true);
      chosen = live || [...allMatches].reverse().find((m) => m.st === 2) || allMatches[allMatches.length - 1];
      if (!chosen) {
        return res.status(404).json({ error: 'Kein Spiel in diesem Wettbewerb gefunden' });
      }
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

  const lineupKey = teamSide === 't2' ? 't2lp' : 't1lp';
  const teamName = teamSide === 't2' ? details.t2n : details.t1n;
  const lineup = details[lineupKey] || [];

  const eventTypeMap = await getEventTypeMap(token);

  const ownGoals = teamSide === 't2' ? details.t2g : details.t1g;
  const opponentGoals = teamSide === 't2' ? details.t1g : details.t2g;
  const ownCrest = teamSide === 't2' ? details.t2im : details.t1im;
  const opponentCrest = teamSide === 't2' ? details.t1im : details.t2im;

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
        teamLogo: ownCrest ? `https://kickbase.b-cdn.net/${ownCrest}` : null,
        opponentLogo: opponentCrest ? `https://kickbase.b-cdn.net/${opponentCrest}` : null,
      };
    })
  );

  setLiveCacheHeaders(res, { nocache: nocache === '1', maxAge: 15, staleWhileRevalidate: 15 });
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
