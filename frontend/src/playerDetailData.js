import { enrichPlayerWithCatalog } from './advisorSquadEval';

const IMAGE_BASE = 'https://kickbase.b-cdn.net/';

let catalogBundlePromise = null;
let matchdaysBundlePromise = null;
let transfersByPlayerPromise = null;
let advisorDataPromise = null;
let managerLeagueMapPromise = null;

/**
 * Laedt und cached die kompakte ~170-KB-Datei `/history/players-lite.json`
 * (statt der 40 MB grossen `all_players.json`) inkl. vorberechnetem xP
 * (`xpSeason`, `xpNext`, `nextOpponent`, `isHome`, `matchupFactor`).
 */
export function loadPlayerCatalogBundle() {
  if (!catalogBundlePromise) {
    catalogBundlePromise = fetch('/history/players-lite.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list = Array.isArray(json?.players) ? json.players : [];
        const rawTeams = json?.teams && typeof json.teams === 'object' ? json.teams : {};
        const nextMatchday = json?.nextMatchday ?? null;

        const catalogMap = new Map();
        const teamLogos = {};
        const teamNamesById = new Map();
        const teamLogosById = new Map();
        const xpMap = new Map();

        for (const [tid, info] of Object.entries(rawTeams)) {
          if (info?.n) teamNamesById.set(String(tid), info.n);
          if (info?.im) {
            const url = `${IMAGE_BASE}${info.im}`;
            teamLogosById.set(String(tid), url);
            if (info.n && !teamLogos[info.n]) teamLogos[info.n] = url;
          }
        }

        for (const p of list) {
          if (p?.i == null) continue;
          const pid = String(p.i);
          catalogMap.set(pid, p);
          if (p.tn && p.tim && !teamLogos[p.tn]) {
            teamLogos[p.tn] = `${IMAGE_BASE}${p.tim}`;
          }
          if (p.xp) {
            xpMap.set(pid, {
              xpSeason: p.xp.s,
              xpNext: p.xp.n,
              matchupFactor: p.xp.m,
              isHome: p.xp.h,
              nextOpponent: p.xp.o,
              nextMatchday: p.xp.md ?? nextMatchday,
              pStart: p.xp.ps,
            });
          }
        }

        return {
          allPlayersRaw: list,
          catalogMap,
          teamLogos,
          teamNamesById,
          teamLogosById,
          xpMap,
          nextMatchday,
        };
      })
      .catch(() => {
        catalogBundlePromise = null;
        return {
          allPlayersRaw: [],
          catalogMap: new Map(),
          teamLogos: {},
          teamNamesById: new Map(),
          teamLogosById: new Map(),
          xpMap: new Map(),
          nextMatchday: null,
        };
      });
  }
  return catalogBundlePromise;
}

/**
 * Lazy-Loader fuer die kompakten Spieltags-Punkte ueber ALLE Saisons
 * (`/history/player-matchdays.json`) - wird erst geladen, wenn eine
 * Spieler-Detailseite geoeffnet wird.
 */
export function loadPlayerMatchdaysBundle() {
  if (!matchdaysBundlePromise) {
    matchdaysBundlePromise = fetch('/history/player-matchdays.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const rawTeams = json?.teams && typeof json.teams === 'object' ? json.teams : {};
        const byId = json?.byId && typeof json.byId === 'object' ? json.byId : {};
        return {
          nextMatchday: json?.nextMatchday ?? null,
          teams: rawTeams,
          byId,
        };
      })
      .catch(() => {
        matchdaysBundlePromise = null;
        return { nextMatchday: null, teams: {}, byId: {} };
      });
  }
  return matchdaysBundlePromise;
}

/**
 * Entpackt alle Saisons eines Spielers aus `player-matchdays.json` (neueste Saison zuerst).
 * Tupel-Format: [day, pts, st, minutes, oppTid, isHome(1/0/null), t1g, t2g, isPlayed(1/0)]
 */
export function unpackPlayerMatchdaySeasons(bundle, playerId) {
  if (!bundle?.byId) return [];
  const rawSeasons = bundle.byId[String(playerId)] || [];
  const teams = bundle.teams || {};

  // Neueste Saison zuerst (z.B. 2026/2027, 2025/2026, ...)
  return [...rawSeasons].reverse().map((s, idx) => {
    const shortLabel = String(s.ti || '')
      .replace(/^20(\d{2})\/20(\d{2})$/, '$1/$2')
      .trim() || s.ti;
    const entries = (Array.isArray(s.ph) ? s.ph : []).map((row) => {
      const [day, pts, st, minutes, oppTid, isHomeNum, t1g, t2g, isPlayedNum] = row;
      const teamInfo = oppTid ? teams[String(oppTid)] : null;
      const isPlayed = isPlayedNum === 1;
      const played = isPlayed && typeof pts === 'number' && (st === 5 || st === 3 || minutes > 0);
      return {
        day,
        label: `ST ${day}`,
        points: typeof pts === 'number' ? pts : 0,
        hasNumericPoints: typeof pts === 'number',
        played,
        isUpcoming: !isPlayed,
        statusCode: st,
        minutes: minutes || 0,
        opponent: teamInfo?.n || null,
        oppLogo: teamInfo?.im ? `${IMAGE_BASE}${teamInfo.im}` : null,
        isHome: isHomeNum === 1 ? true : isHomeNum === 0 ? false : null,
        score: typeof t1g === 'number' && typeof t2g === 'number' ? `${t1g}:${t2g}` : null,
        isXp: false,
      };
    });

    return {
      title: s.ti || shortLabel,
      shortLabel,
      isCurrentSeason: idx === 0,
      entries,
    };
  });
}

/**
 * Laedt und indexiert alle Saison-Transfers aus /history/transfers.json nach playerId
 * (neueste zuerst).
 */
export function loadTransfersByPlayerId() {
  if (!transfersByPlayerPromise) {
    transfersByPlayerPromise = fetch('/history/transfers.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((raw) => {
        const map = new Map();
        const list = Array.isArray(raw) ? raw : [];
        for (const item of list) {
          if (!item || item.playerId == null) continue;
          const pid = String(item.playerId);
          if (!map.has(pid)) map.set(pid, []);
          map.get(pid).push(item);
        }
        for (const arr of map.values()) {
          arr.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        }
        return map;
      })
      .catch(() => {
        transfersByPlayerPromise = null;
        return new Map();
      });
  }
  return transfersByPlayerPromise;
}

/**
 * Ordnet Kickbase-Manager-IDs & -Namen ihrer Liga ('LIGA 1' / 'LIGA 2' / 'LIGA 3') zu,
 * damit die Trading-Historie gezielt auf den eigenen Markt gefiltert werden kann.
 */
export function loadManagerLeagueMap() {
  if (!managerLeagueMapPromise) {
    managerLeagueMapPromise = fetch('/data.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const byId = new Map();
        const byName = new Map();
        for (const league of (json?.leagues || [])) {
          const lgName = String(league?.name || '').toUpperCase().trim();
          if (!lgName) continue;
          for (const u of (league?.users || [])) {
            if (u?.id != null) byId.set(String(u.id), lgName);
            if (u?.name) byName.set(String(u.name).toLowerCase().trim(), lgName);
          }
        }
        return { byId, byName };
      })
      .catch(() => {
        managerLeagueMapPromise = null;
        return { byId: new Map(), byName: new Map() };
      });
  }
  return managerLeagueMapPromise;
}

/**
 * Laedt und cached /advisor-data.json fuer die standalone Spieler-Detailseite.
 */
export function loadAdvisorDataCached() {
  if (!advisorDataPromise) {
    advisorDataPromise = fetch('/advisor-data.json', { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => {
        advisorDataPromise = null;
        return null;
      });
  }
  return advisorDataPromise;
}

/**
 * Findet und reichert einen Spieler fuer /player/:playerId aus advisor-data.json
 * und players-lite.json an (funktioniert fuer alle 450+ Bundesliga-Spieler).
 */
export async function resolveFullPlayerById(playerId) {
  const pid = String(playerId || '');
  const [bundle, advisorData] = await Promise.all([
    loadPlayerCatalogBundle(),
    loadAdvisorDataCached(),
  ]);

  const { catalogMap, teamLogos, xpMap } = bundle;

  const mergedTeamLogos = { ...teamLogos };
  const teamsData = advisorData?.leagues ? Object.values(advisorData.leagues)[0]?.teams || [] : [];
  for (const t of teamsData) {
    if (t?.tn && !mergedTeamLogos[t.tn]) {
      const svgKey = Object.keys(t).find((k) => typeof t[k] === 'string' && t[k].endsWith('.svg'));
      if (svgKey) mergedTeamLogos[t.tn] = `${IMAGE_BASE}${t[svgKey]}`;
    }
  }

  let baseEntry = null;
  if (advisorData?.leagues) {
    for (const league of Object.values(advisorData.leagues)) {
      if (league?.marketData) {
        const found = league.marketData.find((p) => String(p.playerId) === pid);
        if (found) {
          baseEntry = found;
          break;
        }
      }
      if (!baseEntry && league?.managerSquads) {
        for (const squad of Object.values(league.managerSquads)) {
          const found = (squad || []).find((p) => String(p.playerId) === pid);
          if (found) {
            baseEntry = found;
            break;
          }
        }
      }
      if (baseEntry) break;
    }
  }
  if (!baseEntry && Array.isArray(advisorData?.players)) {
    baseEntry = advisorData.players.find((p) => String(p.playerId) === pid) || null;
  }

  const catalogEntry = catalogMap.get(pid) || null;
  if (!baseEntry && !catalogEntry) {
    return { player: null, teamLogos: mergedTeamLogos };
  }

  const seed = baseEntry || {
    playerId: pid,
    name: catalogEntry.n || catalogEntry.ln || '',
    firstName: catalogEntry.fn || '',
    team: catalogEntry.tn || '',
    marketValue: catalogEntry.mv ?? 0,
    imageUrl: catalogEntry.pim ? `${IMAGE_BASE}${catalogEntry.pim}` : null,
  };

  const enriched = enrichPlayerWithCatalog(seed, catalogMap, xpMap);
  return { player: enriched, teamLogos: mergedTeamLogos };
}
