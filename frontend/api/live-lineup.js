// On-Demand Live-Punkte fuer die Startelf EINES Managers (Owner-Wunsch
// 23.11.2026: "Live Punkte seines eigenen Kaders waehrend des Spiels
// sehen", analog zur Spieler-Detail-Ansicht unter Matches -> Aufstellungen
// -> Spieler in der offiziellen Kickbase-App; spaeter erweitert um die
// Moeglichkeit, auch ANDERE Manager der eigenen Liga live anzuschauen).
// Wird beim Oeffnen, manuellem Refresh oder gezielt per OpenLigaDB-Event-
// Trigger (mit Team-Filter, Jitter & Cooldown) aufgerufen - kein Dauer-Loop.
//
// Technischer Hintergrund (siehe Diagnose vom 23.11.2026): das Lineup eines
// BELIEBIGEN Managers laesst sich nicht direkt mit "Live-Punkten pro Spieler"
// in einem einzigen Call abfragen - /lineup/overview liefert nur den Kader
// des GERADE eingeloggten Accounts (hier: des technischen Bot-Accounts
// selbst). Stattdessen: teamcenter liefert die Startelf-Spieler-IDs des
// angefragten Managers (gleicher Account, gleicher Mechanismus wie
// backend/reconstructStartingEleven.js), danach liefert playercenter PRO
// Spieler die Live-Punkte + minutengenaue Event-Liste fuer den aktuellen
// Spieltag.
import { API_BASE, COMPETITION_ID, loginAndFindLeague, getJson, resolveMatchday, getEventTypeMap, setLiveCacheHeaders } from './_kickbaseClient.js';

export default async function handler(req, res) {
  const { userId, leagueKey, dayNumber, nocache } = req.query;
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

  // Startelf-Spieler-IDs des angefragten Managers fuer diesen Spieltag.
  const teamcenter = await getJson(
    `${API_BASE}/leagues/${leagueId}/users/${userId}/teamcenter?dayNumber=${day}`,
    token
  );
  const myEntry = (teamcenter?.us || []).find((u) => String(u.i) === String(userId)) || teamcenter?.us?.[0];
  const playerIds = (myEntry?.lp || []).filter(Boolean);

  if (playerIds.length === 0) {
    setLiveCacheHeaders(res, { nocache: nocache === '1', maxAge: 15, staleWhileRevalidate: 15 });
    return res.status(200).json({ matchday: day, players: [], note: 'Keine Startelf fuer diesen Spieltag gefunden' });
  }

  // /v4/live/eventtypes liefert Klartext-Titel fuer die eti-Codes in den
  // playercenter-events (z.B. "Accurate long Ball", "Shot Assist") - verifiziert
  // per Diagnose-Workflow 23.11.2026 gegen echte Live-Daten, 18/18 Treffer.
  // Damit laesst sich jetzt eine "Pass +2"-Liste pro Spieler zeigen (Owner-
  // Wunsch: "Punkte mit Aktionen mappen... beim Anklicken des Spielers als
  // Liste, wie im echten Live-Modus").
  const eventTypeMap = await getEventTypeMap(token);

  // Live-Punkte + Event-Verlauf PRO Spieler, parallel abgefragt.
  const players = await Promise.all(
    playerIds.map(async (playerId) => {
      const pc = await getJson(
        `${API_BASE}/competitions/${COMPETITION_ID}/playercenter/${playerId}?dayNumber=${day}&leagueId=${leagueId}`,
        token
      );
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
    })
  );

  setLiveCacheHeaders(res, { nocache: nocache === '1', maxAge: 15, staleWhileRevalidate: 15 });
  return res.status(200).json({ matchday: day, players });
}
