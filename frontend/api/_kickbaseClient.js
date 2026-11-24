/* global process */

// Gemeinsame Kickbase-v4-Login-/Liga-Hilfsfunktionen fuer die Live-Routen
// (live-lineup.js, live-ranking.js) - Dateiname mit "_"-Praefix, damit
// Vercel daraus KEINE eigene Route macht (offizielle Vercel-Konvention fuer
// Helper-Dateien unter /api).
export const API_BASE = 'https://api.kickbase.com/v4';
export const COMPETITION_ID = '1'; // Bundesliga

// Technischer Account (Kickbase-Login nur fuer den Datenabruf, kein echter
// Manager) - gleiche Liste wie backend/technical-accounts.json. Dupliziert
// hier, weil Vercel-Functions unter frontend/api/ keinen Zugriff auf
// backend/ haben (separates Deployment-Root, gleiches Prinzip wie
// frontend/src/squadRules.js vs. backend/squadRules.js).
export const EXCLUDED_MANAGER_NAMES = ['Admin'];

// Gleiche Liga-Namen wie backend/kickbase.js (LEAGUE_DEFS) - Kurzform ("L1")
// kommt aus dem Frontend (siehe manager-ratings.json: league-Feld), da die
// Live-Routen sonst bei jedem Aufruf blind alle 3 Ligen durchprobieren muessten.
const LEAGUE_NAME_BY_KEY = {
  L1: process.env.KICKBASE_LEAGUE_1_NAME || '1. Liga',
  L2: process.env.KICKBASE_LEAGUE_2_NAME || '2. Liga',
  L3: process.env.KICKBASE_LEAGUE_3_NAME || '3. Liga',
};

const TOKEN_TTL_MS = 20 * 60 * 1000;
const LEAGUE_TTL_MS = 30 * 60 * 1000;
const MATCHDAY_TTL_MS = 5 * 60 * 1000;

// Modul-weite Caches fuer warme Serverless-Instanzen: reduziert Kickbase-Logins
// und Liga-/Spieltag-Lookups drastisch (>95% weniger Login-Calls bei Live-Traffic).
const tokenCache = new Map(); // email -> { token, expiresAt }
const leagueCache = new Map(); // leagueKey -> { email, leagueId, expiresAt }
const matchdayCache = new Map(); // leagueId -> { day, expiresAt }

function invalidateToken(token) {
  if (!token) return;
  for (const [email, entry] of tokenCache.entries()) {
    if (entry.token === token) {
      tokenCache.delete(email);
    }
  }
}

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
  const cached = tokenCache.get(email);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  const res = await fetch(`${API_BASE}/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ em: email, loy: false, pass, rep: {} }),
  });
  const data = await res.json();
  if (data.err || !data.tkn) return null;
  tokenCache.set(email, { token: data.tkn, expiresAt: Date.now() + TOKEN_TTL_MS });
  return data.tkn;
}

async function findLeagueId(token, leagueNameContains) {
  const res = await fetch(`${API_BASE}/leagues`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    invalidateToken(token);
    return null;
  }
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

export async function loginAndFindLeague(leagueKey) {
  const leagueName = LEAGUE_NAME_BY_KEY[leagueKey];
  if (!leagueName) return null;
  const accounts = getConfiguredAccounts();

  const cachedLeague = leagueCache.get(leagueKey);
  if (cachedLeague && cachedLeague.expiresAt > Date.now()) {
    const acc = accounts.find((a) => a.email === cachedLeague.email);
    if (acc) {
      const token = await login(acc.email, acc.pass);
      if (token) return { token, leagueId: cachedLeague.leagueId };
    }
  }

  for (const account of accounts) {
    const token = await login(account.email, account.pass);
    if (!token) continue;
    const leagueId = await findLeagueId(token, leagueName);
    if (leagueId) {
      leagueCache.set(leagueKey, {
        email: account.email,
        leagueId,
        expiresAt: Date.now() + LEAGUE_TTL_MS,
      });
      return { token, leagueId };
    }
  }
  return null;
}

// Nur Login, ohne Liga-Zuordnung - fuer Abfragen, die KEINE Kickbase-Liga
// brauchen (z.B. echte Wettbewerbs-/Spieldaten wie La Liga, siehe
// live-team.js). playercenter funktioniert nachweislich auch ohne leagueId.
export async function loginAny() {
  for (const account of getConfiguredAccounts()) {
    const token = await login(account.email, account.pass);
    if (token) return token;
  }
  return null;
}

export async function getJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (res.status === 401) {
    invalidateToken(token);
    return null;
  }
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Aktuellen Spieltag ermitteln (sofern nicht bekannt) - das Ranking liefert
// ihn ohnehin mit, kurz zwischengespeichert fuer warme Instanzen.
export async function resolveMatchday(leagueId, token, dayNumber) {
  if (dayNumber) return parseInt(dayNumber, 10);
  const cached = matchdayCache.get(String(leagueId));
  if (cached && cached.expiresAt > Date.now()) {
    return cached.day;
  }
  const ranking = await getJson(`${API_BASE}/leagues/${leagueId}/ranking`, token);
  const day = ranking?.day || null;
  if (day) {
    matchdayCache.set(String(leagueId), { day, expiresAt: Date.now() + MATCHDAY_TTL_MS });
  }
  return day;
}

// Einheitliche Vercel-Edge-Cache-Header: bei automatischen Event-Updates
// buendelt s-maxage gleichzeitige Nutzer-Abrufe zu einem einzigen Kickbase-Call,
// waehrend manueller Refresh (`nocache=1`) direkt frisch abfragt.
export function setLiveCacheHeaders(res, { nocache = false, maxAge = 15, staleWhileRevalidate = 15 } = {}) {
  if (nocache) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  } else {
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
  }
}

// Uebersetzt die eti-Codes aus playercenter-events in Klartext (Owner-Wunsch
// 23.11.2026: "Punkte mit Aktionen mappen, also Pass etc. und das beim
// Anklicken des Spielers als Liste anzeigen, wie im echten Live-Modus").
// /v4/live/eventtypes liefert GENAU diese Zuordnung (id -> Titel, z.B.
// "Accurate long Ball", "Shot Assist") - verifiziert per Diagnose-Workflow
// gegen echte eti-Codes aus einem Live-Spiel, 18/18 Treffer. Modul-weiter
// Cache, damit nicht JEDE Anfrage (pro Spieler-Click potenziell) einen
// weiteren Kickbase-Call ausloest - die Liste aendert sich laut Doku "selten".
//
// Accept-Language: de liefert deutsche Titel ("Ballverlust" statt "Possession
// lost") - verifiziert per Diagnose-Workflow 23.11.2026 (Owner-Wunsch: "ob
// man fuer die Beschreibungen auch die deutsche Beschreibung haben kann").
let eventTypeMapCache = null;
export async function getEventTypeMap(token) {
  if (eventTypeMapCache) return eventTypeMapCache;
  const res = await fetch(`${API_BASE}/live/eventtypes`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Language': 'de' },
  });
  if (res.status === 401) {
    invalidateToken(token);
    return new Map();
  }
  const data = res.ok ? await res.json().catch(() => null) : null;
  eventTypeMapCache = new Map((data?.it || []).map((x) => [x.i, x.ti]));
  return eventTypeMapCache;
}
