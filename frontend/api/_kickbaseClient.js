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

export async function loginAndFindLeague(leagueKey) {
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
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Aktuellen Spieltag ermitteln (sofern nicht bekannt) - das Ranking liefert
// ihn ohnehin mit, kein Extra-Call noetig.
export async function resolveMatchday(leagueId, token, dayNumber) {
  if (dayNumber) return parseInt(dayNumber, 10);
  const ranking = await getJson(`${API_BASE}/leagues/${leagueId}/ranking`, token);
  return ranking?.day || null;
}
