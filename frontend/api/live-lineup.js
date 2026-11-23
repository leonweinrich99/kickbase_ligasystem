// On-Demand Live-Punkte fuer die Startelf EINES Managers (Owner-Wunsch
// 23.11.2026: "Live Punkte seines eigenen Kaders waehrend des Spiels
// sehen", analog zur Spieler-Detail-Ansicht unter Matches -> Aufstellungen
// -> Spieler in der offiziellen Kickbase-App; spaeter erweitert um die
// Moeglichkeit, auch ANDERE Manager der eigenen Liga live anzuschauen).
// Wird NUR aufgerufen, wenn ein Nutzer die Seite tatsaechlich oeffnet - kein
// Hintergrund-Polling, kein Cron.
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
import { API_BASE, COMPETITION_ID, loginAndFindLeague, getJson, resolveMatchday } from './_kickbaseClient.js';

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

  // Startelf-Spieler-IDs des angefragten Managers fuer diesen Spieltag.
  const teamcenter = await getJson(
    `${API_BASE}/leagues/${leagueId}/users/${userId}/teamcenter?dayNumber=${day}`,
    token
  );
  const myEntry = (teamcenter?.us || []).find((u) => String(u.i) === String(userId)) || teamcenter?.us?.[0];
  const playerIds = (myEntry?.lp || []).filter(Boolean);

  if (playerIds.length === 0) {
    return res.status(200).json({ matchday: day, players: [], note: 'Keine Startelf fuer diesen Spieltag gefunden' });
  }

  // Live-Punkte + Event-Verlauf PRO Spieler, parallel abgefragt.
  const players = await Promise.all(
    playerIds.map(async (playerId) => {
      const pc = await getJson(
        `${API_BASE}/competitions/${COMPETITION_ID}/playercenter/${playerId}?dayNumber=${day}&leagueId=${leagueId}`,
        token
      );
      if (!pc) return { playerId, error: true };
      // Die Kickbase-API liefert fuer jede Mini-Aktion (pro Pass, Zweikampf
      // etc.) einen Punktewert in `events[].p`, aber KEIN Klartext-Label fuer
      // die zugehoerige Aktion (nur einen vierstelligen `eti`-Code ohne
      // bekannte Bedeutung) - eine "Erfolgreicher Pass +2"-Anzeige liesse sich
      // damit nicht ehrlich bauen. Deshalb nur der Gesamtpunktestand je
      // Spieler (siehe Chat 23.11.2026).
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
      };
    })
  );

  return res.status(200).json({ matchday: day, players });
}
