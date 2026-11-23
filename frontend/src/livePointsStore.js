// Persistente Speicherung der zuletzt gesehenen Live-Punkte (Owner-Wunsch
// 24.11.2026: "dass du die Punkte abspeicherst, wenn dann ein Update gemacht
// wird soll eine Animation bei den Zahlen stattfinden die die Nummer erhoehen
// oder niedriger machen als den vorherigen Stand").
//
// Pro Ansicht (eigener Kader, Liga-Ranking, anderer Manager, echtes Team,
// Manager-Profil) und Spieltag/Match wird ein kompakter Schnappschuss in
// localStorage abgelegt. Dadurch funktioniert die Animation sowohl beim
// manuellen "Aktualisieren" als auch nach dem Schliessen/Wiederoeffnen der App
// oder beim Tab-Wechsel. Eintraege aelter als 7 Tage werden automatisch
// bereinigt.

const STORAGE_KEY = 'kickbase_live_points_v1';
const SNAPSHOT_STORAGE_KEY = 'kickbase_live_snapshots_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 20;

let animCounter = 0;

export const nextAnimId = () => {
  animCounter += 1;
  return animCounter;
};

// Merkt sich innerhalb der laufenden Sitzung, welche Animations-Keys bereits
// abgespielt wurden, damit ein bloesses Umschalten zwischen Tabs/Modi ohne
// neuen API-Abruf dieselbe Zahl-Animation nicht erneut abspielt.
export const playedAnimKeys = new Set();

export const markAnimPlayed = (key) => {
  if (!key) return;
  if (playedAnimKeys.size > 600) {
    playedAnimKeys.clear();
  }
  playedAnimKeys.add(key);
};

const readStore = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store) => {
  try {
    const now = Date.now();
    const cleaned = {};
    for (const [k, entry] of Object.entries(store)) {
      if (entry && typeof entry.ts === 'number' && now - entry.ts <= MAX_AGE_MS) {
        cleaned[k] = entry;
      }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  } catch {
    // Private-Browsing / Quota-Fehler still ignorieren - Live-Anzeige darf nie brechen.
  }
};

// Vergleicht neue Punkte gegen den zuletzt gespeicherten Stand fuer `scopeKey`,
// speichert die neuen Werte sofort ab und liefert die VORHERIGEN Werte zurueck.
export const diffAndSavePoints = (scopeKey, nextValues) => {
  if (!scopeKey || !nextValues) return {};
  const store = readStore();
  const prevValues = store[scopeKey]?.values || {};
  store[scopeKey] = {
    values: nextValues,
    ts: Date.now(),
  };
  writeStore(store);
  return prevValues;
};

export const buildLineupPointsMap = (players) => {
  const map = {};
  if (!Array.isArray(players)) return map;
  let total = 0;
  let hasAny = false;
  for (const p of players) {
    if (!p || p.error) continue;
    const id = p.playerId ?? p.id;
    if (id != null && typeof p.points === 'number') {
      map[String(id)] = p.points;
      total += p.points;
      hasAny = true;
    }
  }
  if (hasAny) {
    map.__total__ = total;
  }
  return map;
};

export const buildRankingPointsMap = (ranking) => {
  const map = {};
  if (!Array.isArray(ranking)) return map;
  for (const r of ranking) {
    if (r?.userId != null && typeof r.livePoints === 'number') {
      map[String(r.userId)] = r.livePoints;
    }
  }
  return map;
};

// Stale-While-Revalidate Cache fuer die vollstaendigen Live-Ansichten
// (angereicherte Startelf inkl. Fotos/Namen/Punkte bzw. Ranking): beim Oeffnen
// der Seite wird sofort der letzte bekannte Stand angezeigt statt "Lade...",
// waehrend im Hintergrund die frischen Daten nachgeladen und dann direkt an
// den Zahlen animiert werden.
const readSnapshotStore = () => {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const readCachedSnapshot = (key) => {
  if (!key) return null;
  const store = readSnapshotStore();
  const entry = store[key];
  if (!entry || typeof entry.ts !== 'number') return null;
  if (Date.now() - entry.ts > MAX_AGE_MS) return null;
  return entry.data ?? null;
};

export const saveCachedSnapshot = (key, data) => {
  if (!key || !data) return;
  try {
    const now = Date.now();
    const store = readSnapshotStore();
    store[key] = { data, ts: now };

    const validEntries = Object.entries(store)
      .filter(([, entry]) => entry && typeof entry.ts === 'number' && now - entry.ts <= MAX_AGE_MS)
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, MAX_SNAPSHOTS);

    const trimmed = Object.fromEntries(validEntries);
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Private-Browsing / Quota-Fehler still ignorieren.
  }
};
