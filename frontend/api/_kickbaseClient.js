/* global process */

// Gemeinsame Kickbase-v4-Login-/Liga-/Cache-Hilfsfunktionen fuer die
// Live-Routen (live-lineup.js, live-ranking.js, live-team.js, live-teams-list.js).
// Dateiname mit "_"-Praefix, damit Vercel daraus KEINE eigene Route macht
// (offizielle Vercel-Konvention fuer Helper-Dateien unter /api).
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
  POKAL: process.env.KICKBASE_LEAGUE_POKAL_NAME || 'Pokal',
};

const TOKEN_TTL_MS = 20 * 60 * 1000;
const LEAGUE_TTL_MS = 30 * 60 * 1000;
const LEAGUE_META_TTL_MS = 5 * 60 * 1000;
const TEAMCENTER_TTL_MS = 25 * 1000;
const PLAYERCENTER_TTL_MS = 30 * 1000;
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;

// Modul-weite Caches fuer warme Serverless-Instanzen:
// - tokenCache / leagueCache / leagueMetaCache sparen >95% der Login-/Meta-Calls
// - teamcenterCache teilt 1 teamcenter-Call fuer alle 9 Manager einer Liga
// - playerCenterCache teilt playercenter liga-uebergreifend (L1/L2/L3)
const tokenCache = new Map(); // email -> { token, expiresAt }
const leagueCache = new Map(); // leagueKey -> { email, leagueId, expiresAt }
const leagueMetaCache = new Map(); // leagueId -> { day, sampleUserId, expiresAt }
const teamcenterCache = new Map(); // `${leagueId}:${day}` -> { data, expiresAt }
const teamcenterInFlight = new Map();
const playerCenterCache = new Map(); // `${competitionId}:${day}:${playerId}` -> { data, expiresAt }
const playerCenterInFlight = new Map();

let rateLimitedUntil = 0;

export function isRateLimited() {
  return Date.now() < rateLimitedUntil;
}

export function getRateLimitRetryAfterSec() {
  return Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 1000));
}

function markRateLimited(res) {
  const retryHeader = res?.headers?.get?.('retry-after');
  const parsedSec = retryHeader ? parseInt(retryHeader, 10) : NaN;
  const backoffMs =
    Number.isFinite(parsedSec) && parsedSec > 0
      ? Math.min(15 * 60 * 1000, parsedSec * 1000)
      : RATE_LIMIT_BACKOFF_MS;
  rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + backoffMs);
}

function invalidateToken(token) {
  if (!token) return;
  for (const [email, entry] of tokenCache.entries()) {
    if (entry.token === token) {
      tokenCache.delete(email);
    }
  }
}

function pruneMapIfLarge(map, maxSize = 400) {
  if (map.size <= maxSize) return;
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    if (!v || v.expiresAt <= now) {
      map.delete(k);
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

export const isNumericId = (val) => typeof val === 'string' && /^\d{1,12}$/.test(val.trim());

export const isValidLeagueKey = (val) => val === 'L1' || val === 'L2' || val === 'L3' || val === 'POKAL';

const FETCH_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

async function login(email, pass) {
  if (isRateLimited()) return null;
  const cached = tokenCache.get(email);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  let res;
  try {
    res = await fetchWithTimeout(`${API_BASE}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ em: email, loy: false, pass, rep: {} }),
    });
  } catch {
    return null;
  }
  if (res.status === 429) {
    markRateLimited(res);
    return null;
  }
  const data = await res.json().catch(() => null);
  if (!data || data.err || !data.tkn) return null;
  tokenCache.set(email, { token: data.tkn, expiresAt: Date.now() + TOKEN_TTL_MS });
  return data.tkn;
}

async function findLeagueId(token, leagueNameContains) {
  if (isRateLimited()) return null;
  let res;
  try {
    res = await fetchWithTimeout(`${API_BASE}/leagues`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return null;
  }
  if (res.status === 429) {
    markRateLimited(res);
    return null;
  }
  if (res.status === 401) {
    invalidateToken(token);
    return null;
  }
  const data = await res.json().catch(() => null);
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
  if (isRateLimited()) return null;
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
  if (isRateLimited()) return null;
  for (const account of getConfiguredAccounts()) {
    const token = await login(account.email, account.pass);
    if (token) return token;
  }
  return null;
}

export async function getJson(url, token) {
  if (isRateLimited()) return null;
  let res;
  try {
    res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  } catch {
    return null;
  }
  if (res.status === 429) {
    markRateLimited(res);
    return null;
  }
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

// Ermittelt aktuellen Spieltag + eine gueltige Manager-ID der Liga fuer
// teamcenter-Aufrufe (damit live-ranking.js ohne nutzerspezifische userId
// liga-weit auf Vercel Edge gecacht werden kann).
export async function resolveLeagueMeta(leagueId, token, dayNumber) {
  const key = String(leagueId);
  const cached = leagueMetaCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      day: dayNumber ? parseInt(dayNumber, 10) : cached.day,
      sampleUserId: cached.sampleUserId,
    };
  }
  const ranking = await getJson(`${API_BASE}/leagues/${leagueId}/ranking`, token);
  const day = ranking?.day || null;
  const sampleUserId = ranking?.us?.[0]?.i || ranking?.us?.[0]?.id || null;
  if (day || sampleUserId) {
    leagueMetaCache.set(key, {
      day,
      sampleUserId: sampleUserId != null ? String(sampleUserId) : null,
      expiresAt: Date.now() + LEAGUE_META_TTL_MS,
    });
  }
  return {
    day: dayNumber ? parseInt(dayNumber, 10) : day,
    sampleUserId: sampleUserId != null ? String(sampleUserId) : null,
  };
}

export async function resolveMatchday(leagueId, token, dayNumber) {
  if (dayNumber) return parseInt(dayNumber, 10);
  const meta = await resolveLeagueMeta(leagueId, token, null);
  return meta.day || null;
}

// Gecachter teamcenter-Abruf pro Liga & Spieltag (25s TTL + In-Flight-Dedup):
// live-ranking.js und live-lineup.js aller Manager derselben Liga teilen sich
// damit denselben teamcenter-Request. Im Pokalmodus (gpm=4, perUser=true)
// liefert Kickbase in `us` nur den angefragten Manager, daher pro userId cachen.
export async function getTeamCenterCached(leagueId, userId, day, token, { perUser = false } = {}) {
  const key = perUser ? `${leagueId}:${day}:${userId}` : `${leagueId}:${day}`;
  const cached = teamcenterCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  if (teamcenterInFlight.has(key)) {
    return teamcenterInFlight.get(key);
  }
  const promise = getJson(
    `${API_BASE}/leagues/${leagueId}/users/${userId}/teamcenter?dayNumber=${day}`,
    token
  )
    .then((data) => {
      if (data) {
        pruneMapIfLarge(teamcenterCache, 60);
        teamcenterCache.set(key, { data, expiresAt: Date.now() + TEAMCENTER_TTL_MS });
      }
      return data;
    })
    .finally(() => {
      teamcenterInFlight.delete(key);
    });

  teamcenterInFlight.set(key, promise);
  return promise;
}

// Liga-uebergreifender playercenter-Cache (30s TTL + In-Flight-Dedup):
// Live-Punkte & Aktionen eines Spielers sind fuer L1, L2, L3 und "Echte Teams"
// identisch, daher wird ohne leagueId abgefragt und zentral geteilt.
export async function getPlayerCenterCached(competitionId, playerId, day, token) {
  const key = `${competitionId}:${day}:${playerId}`;
  const cached = playerCenterCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  if (playerCenterInFlight.has(key)) {
    return playerCenterInFlight.get(key);
  }
  const promise = getJson(
    `${API_BASE}/competitions/${competitionId}/playercenter/${playerId}?dayNumber=${day}`,
    token
  )
    .then((data) => {
      if (data) {
        pruneMapIfLarge(playerCenterCache, 600);
        playerCenterCache.set(key, { data, expiresAt: Date.now() + PLAYERCENTER_TTL_MS });
      }
      return data;
    })
    .finally(() => {
      playerCenterInFlight.delete(key);
    });

  playerCenterInFlight.set(key, promise);
  return promise;
}

// Staffelt parallele Kickbase-Abfragen in kleine Batches (Standard: 4er-Gruppen
// mit 60ms Pause), um Burst-Spitzen gegen Kickbase zu vermeiden.
export async function mapInBatches(items, fn, batchSize = 4, delayMs = 60) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(slice.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return results;
}

// Einheitliche Vercel-Edge-Cache-Header fuer alle Backend-gesteuerten Live-Routen.
export function setLiveCacheHeaders(res, { maxAge = 30, staleWhileRevalidate = 30 } = {}) {
  res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
}

export function sendRateLimitIfActive(res) {
  if (!isRateLimited()) return false;
  const retryAfter = getRateLimitRetryAfterSec();
  res.setHeader('Retry-After', String(retryAfter));
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(429).json({
    error: 'Kickbase-Abfragen kurzzeitig pausiert (Rate-Limit-Schutz)',
    retryAfter,
  });
  return true;
}

// Uebersetzt die eti-Codes aus playercenter-events in Klartext (Owner-Wunsch
// 23.11.2026: "Punkte mit Aktionen mappen, also Pass etc. und das beim
// Anklicken des Spielers als Liste anzeigen, wie im echten Live-Modus").
let eventTypeMapCache = null;
export async function getEventTypeMap(token) {
  if (eventTypeMapCache) return eventTypeMapCache;
  if (isRateLimited()) return new Map();
  let res;
  try {
    res = await fetchWithTimeout(`${API_BASE}/live/eventtypes`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Language': 'de' },
    });
  } catch {
    return new Map();
  }
  if (res.status === 429) {
    markRateLimited(res);
    return new Map();
  }
  if (res.status === 401) {
    invalidateToken(token);
    return new Map();
  }
  const data = res.ok ? await res.json().catch(() => null) : null;
  const items = Array.isArray(data?.it) ? data.it : [];
  if (items.length === 0) {
    // Leere/fehlerhafte Antwort NICHT dauerhaft cachen, damit der naechste Request es erneut versucht.
    return new Map();
  }
  eventTypeMapCache = new Map(items.map((x) => [x.i, x.ti]));
  return eventTypeMapCache;
}
