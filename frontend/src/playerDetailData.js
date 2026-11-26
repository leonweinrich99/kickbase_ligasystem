import { buildPlayerXpMap } from './playerXpModel';
import { enrichPlayerWithCatalog } from './advisorSquadEval';

const IMAGE_BASE = 'https://kickbase.b-cdn.net/';

let catalogBundlePromise = null;
let transfersByPlayerPromise = null;
let advisorDataPromise = null;

/**
 * Laedt und cached all_players.json inkl. Team-Logos, Team-Namen und
 * kalibriertem Spieler-xP (xpSeason & xpNext).
 */
export function loadPlayerCatalogBundle() {
  if (!catalogBundlePromise) {
    catalogBundlePromise = fetch('/history/all_players.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((raw) => {
        const list = Array.isArray(raw) ? raw : [];
        const catalogMap = new Map();
        const teamLogos = {};
        const teamNamesById = new Map();
        const teamLogosById = new Map();

        for (const p of list) {
          if (p?.i != null) catalogMap.set(String(p.i), p);
          if (p?.tid != null && p?.tn) {
            teamNamesById.set(String(p.tid), p.tn);
          }
          if (p?.tn && p?.tim && !teamLogos[p.tn]) {
            teamLogos[p.tn] = `${IMAGE_BASE}${p.tim}`;
          }
          if (p?.tid != null && p?.tim && !teamLogosById.has(String(p.tid))) {
            teamLogosById.set(String(p.tid), `${IMAGE_BASE}${p.tim}`);
          }
        }

        const xpResult = buildPlayerXpMap(list);
        return {
          allPlayersRaw: list,
          catalogMap,
          teamLogos,
          teamNamesById,
          teamLogosById,
          xpMap: xpResult.byId,
          nextMatchday: xpResult.nextMatchday,
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
 * Extrahiert den Spieltags-Punkteverlauf der aktuellen Saison fuer einen Spieler
 * aus all_players.json (`performance.it[last].ph`), inkl. Gegner & Spielminuten.
 */
export function extractMatchdayPointsSeries(catalogPlayer, teamNamesById = new Map()) {
  if (!catalogPlayer) return [];
  const seasons = Array.isArray(catalogPlayer?.performance?.it) ? catalogPlayer.performance.it : [];
  if (seasons.length === 0) return [];
  const curSeason = seasons[seasons.length - 1];
  const ph = Array.isArray(curSeason?.ph) ? curSeason.ph : [];
  const ownTid = String(catalogPlayer?.tid || '');

  const played = ph
    .filter((e) => e && typeof e.day === 'number' && (e.mdst === 2 || typeof e.p === 'number'))
    .sort((a, b) => a.day - b.day);

  return played.map((e) => {
    const t1 = String(e.t1 || '');
    const t2 = String(e.t2 || '');
    const isHome = ownTid && t1 ? ownTid === t1 : null;
    const oppTid = isHome === true ? t2 : isHome === false ? t1 : null;
    const opponent = oppTid ? (teamNamesById.get(oppTid) || null) : null;
    const oppLogo = isHome === true
      ? (e.t2im ? `${IMAGE_BASE}${e.t2im}` : null)
      : isHome === false
        ? (e.t1im ? `${IMAGE_BASE}${e.t1im}` : null)
        : null;
    const hasPoints = typeof e.p === 'number' && !Number.isNaN(e.p);
    const minutes = parseInt(String(e.mp || '0'), 10) || 0;
    const score = typeof e.t1g === 'number' && typeof e.t2g === 'number'
      ? `${e.t1g}:${e.t2g}`
      : null;

    return {
      day: e.day,
      label: `ST ${e.day}`,
      points: hasPoints ? e.p : 0,
      played: hasPoints && (e.st === 5 || e.st === 3 || minutes > 0),
      statusCode: e.st ?? null,
      minutes,
      opponent,
      oppLogo,
      isHome,
      score,
      isXp: false,
    };
  });
}

/**
 * Findet und reichert einen Spieler fuer /player/:playerId aus advisor-data.json
 * und all_players.json an (funktioniert fuer alle 500+ Bundesliga-Spieler).
 */
export async function resolveFullPlayerById(playerId) {
  const pid = String(playerId || '');
  const [bundle, advisorData] = await Promise.all([
    loadPlayerCatalogBundle(),
    loadAdvisorDataCached(),
  ]);

  const { catalogMap, teamLogos, xpMap } = bundle;

  // Team-Logos ggf. aus advisor-data ergaenzen
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
