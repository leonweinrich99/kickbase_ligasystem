/* global process */

// On-Demand Live-Punkte fuer die Startelf EINES Managers (Owner-Wunsch
// 23.11.2026: "Live Punkte seines eigenen Kaders waehrend des Spiels
// sehen", analog zur Spieler-Detail-Ansicht unter Matches -> Aufstellungen
// -> Spieler in der offiziellen Kickbase-App). Wird NUR aufgerufen, wenn ein
// Nutzer die Seite tatsaechlich oeffnet - kein Hintergrund-Polling, kein Cron.
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
const API_BASE = 'https://api.kickbase.com/v4';
const COMPETITION_ID = '1'; // Bundesliga

// Gleiche Liga-Namen wie backend/kickbase.js (LEAGUE_DEFS) - Kurzform ("L1")
// kommt aus dem Frontend (siehe manager-ratings.json: league-Feld), da die
// Live-Route sonst bei jedem Aufruf blind alle 3 Ligen durchprobieren muesste.
const LEAGUE_NAME_BY_KEY = {
  L1: process.env.KICKBASE_LEAGUE_1_NAME || '1. Liga',
  L2: process.env.KICKBASE_LEAGUE_2_NAME || '2. Liga',
  L3: process.env.KICKBASE_LEAGUE_3_NAME || '3. Liga',
};

function getConfiguredAccounts() {
  const accounts = [];
  for (const suffix of ['', '_2', '_3', '_4']) {
    const email = process.env[`KICKBASE_EMAIL${suffix}`];
    const pass = process.env[`KICKBASE_PASS${suffix}`];
    if (email && pass) accounts.push({ email, pass });
  }
  return accounts;
}

async function login(email, pass) {
  const res = await fetch(`${API_BASE}/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ em: email, loy: false, pass, rep: {} }),
  });
  const data = await res.json();
  if (data.err || !data.tkn) return null;
  return data.tkn;
}

async function findLeagueId(token, leagueNameContains) {
  const res = await fetch(`${API_BASE}/leagues`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const list = data?.lins || data?.leagues || (Array.isArray(data) ? data : []);
  const needle = leagueNameContains.toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const l of list) {
    const name = (l.n || l.name || '').toLowerCase();
    const tokens = name.match(/[a-z0-9]+/g) || [];
    if (needle.every((t) => tokens.includes(t)) || name.includes(leagueNameContains.toLowerCase())) {
      return l.i || l.id;
    }
  }
  return null;
}

async function loginAndFindLeague(leagueKey) {
  const leagueName = LEAGUE_NAME_BY_KEY[leagueKey];
  if (!leagueName) return null;
  for (const account of getConfiguredAccounts()) {
    const token = await login(account.email, account.pass);
    if (!token) continue;
    const leagueId = await findLeagueId(token, leagueName);
    if (leagueId) return { token, leagueId };
  }
  return null;
}

async function getJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

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

  // Aktuellen Spieltag ermitteln (sofern nicht explizit uebergeben) - das
  // Ranking liefert ihn ohnehin mit, kein Extra-Call noetig.
  let day = dayNumber ? parseInt(dayNumber, 10) : null;
  if (!day) {
    const ranking = await getJson(`${API_BASE}/leagues/${leagueId}/ranking`, token);
    day = ranking?.day || null;
  }
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
