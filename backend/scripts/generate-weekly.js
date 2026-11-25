const fs = require('fs');
const path = require('path');

/**
 * Generiert eine strukturierte Wochen-Zusammenfassung (Weekly Summary) fuer
 * alle 3 Ligen + personalisierte Manager-Insights in:
 *   frontend/public/weekly-summary.json
 *
 * Datenquellen (alle lokal im Repo, automatisch aktualisiert durch
 * update-data.yml & advisor.yml):
 *   - frontend/public/data.json
 *   - frontend/public/history/spieltag-{N}.json & spieltag-{N-1}.json
 *   - frontend/public/history/startelf-md{N}.json
 *   - frontend/public/history/optimal-md-{N}-final.json
 *   - frontend/public/history/transfers.json
 *   - frontend/public/history/all_players.json
 *   - frontend/public/advisor-data.json
 *   - frontend/public/bundesliga-spielplan.json
 *   - frontend/public/pokal-data.json
 *
 * Optionaler KI-Feinschliff:
 *   Ist GEMINI_API_KEY in der Umgebung gesetzt (z.B. kostenloser Google AI
 *   Studio Key als GitHub Secret), erzeugt das Skript zusaetzlich
 *   journalistische Redaktionstexte auf Basis der berechneten Fakten. Ohne Key
 *   (oder bei API-Fehler) greift nahtlos der deterministische Text-Generator.
 */

const PUBLIC_DIR = path.join(__dirname, '../../frontend/public');
const HISTORY_DIR = path.join(PUBLIC_DIR, 'history');
const OUTPUT_PATH = path.join(PUBLIC_DIR, 'weekly-summary.json');
const TECHNICAL_ACCOUNTS_PATH = path.join(__dirname, '../technical-accounts.json');

const TRANSFER_WINDOW_DAYS = 7;
const LOOKAHEAD_MATCHDAYS = 3;
const POS_CODE_TO_LABEL = { 1: 'TW', 2: 'ABW', 3: 'MF', 4: 'ST' };
const STATUS_LABELS = {
  0: 'Fit',
  1: 'Verletzt',
  2: 'Angeschlagen',
  4: 'Aufbautraining',
  8: 'Rote Karte',
  16: 'Gelb-Rote Karte',
  32: 'Gelbsperre',
};

const SELL_REASON_LABELS = {
  injured_or_suspended: 'Verletzt / gesperrt',
  confirmed_injured_external: 'Verletzt gemeldet',
  low_starting_probability: 'Kaum Startelf-Chance',
  falling_value: 'Fallender Marktwert',
  benched_last_matchday: 'Zuletzt ohne Einsatz',
};

// Mapping von bundesliga-spielplan.json -> Kickbase/Advisor Teamnamen
const PLAN_TO_KICKBASE_TEAM = {
  'Bayern München': 'Bayern',
  'VfB Stuttgart': 'Stuttgart',
  'RB Leipzig': 'Leipzig',
  Gladbach: "M'gladbach",
  'Hamburger SV': 'Hamburg',
  'Werder Bremen': 'Bremen',
  'Schalke 04': 'Schalke',
};

const KICKBASE_TO_SHORT_TEAM = {
  Bayern: 'FCB',
  Leverkusen: 'B04',
  Dortmund: 'BVB',
  Leipzig: 'RBL',
  Stuttgart: 'VFB',
  Frankfurt: 'SGE',
  Freiburg: 'SCF',
  Hoffenheim: 'TSG',
  Bremen: 'SVW',
  Augsburg: 'FCA',
  Mainz: 'M05',
  'Union Berlin': 'FCU',
  "M'gladbach": 'BMG',
  Köln: 'KOE',
  Hamburg: 'HSV',
  Schalke: 'S04',
  Paderborn: 'SCP',
  Elversberg: 'ELV',
};

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`Konnte ${path.basename(filePath)} nicht lesen:`, err.message);
    return fallback;
  }
}

function parseGermanInt(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val) : 0;
  if (val === null || val === undefined) return 0;
  const cleaned = String(val).replace(/\./g, '').replace(/[^0-9-]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeLeagueKey(name) {
  const s = String(name || '').toUpperCase().replace(/\s+/g, '');
  if (s.includes('LIGA1') || s.includes('1.LIGA') || s === 'L1') return 'LIGA1';
  if (s.includes('LIGA2') || s.includes('2.LIGA') || s === 'L2') return 'LIGA2';
  if (s.includes('LIGA3') || s.includes('3.LIGA') || s === 'L3') return 'LIGA3';
  return s || 'UNKNOWN';
}

function leagueDisplayName(key) {
  if (key === 'LIGA1') return 'Liga 1';
  if (key === 'LIGA2') return 'Liga 2';
  if (key === 'LIGA3') return 'Liga 3';
  return key;
}

function normalizePlanTeam(name) {
  return PLAN_TO_KICKBASE_TEAM[name] || name;
}

function formatEuroShort(val) {
  if (val === null || val === undefined || !Number.isFinite(val)) return '–';
  const sign = val > 0 ? '+' : val < 0 ? '-' : '';
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(2).replace('.', ',')} Mrd €`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)}k €`;
  }
  return `${sign}${Math.round(abs)} €`;
}

function formatEuroUnsigned(val) {
  if (val === null || val === undefined || !Number.isFinite(val)) return '–';
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) {
    return `${(abs / 1_000_000_000).toFixed(2).replace('.', ',')} Mrd €`;
  }
  if (abs >= 1_000_000) {
    return `${(abs / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  }
  if (abs >= 1_000) {
    return `${Math.round(abs / 1_000)}k €`;
  }
  return `${Math.round(abs)} €`;
}

function formatPoints(val) {
  return Number(val || 0).toLocaleString('de-DE');
}

function getIsoWeekNumber(dateObj) {
  const d = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function loadTechnicalAccounts() {
  const raw = readJsonSafe(TECHNICAL_ACCOUNTS_PATH, null);
  const names = new Set();
  const ids = new Set();
  if (Array.isArray(raw)) {
    raw.forEach((x) => {
      if (typeof x === 'string') names.add(x.toLowerCase());
      else if (x && typeof x === 'object') {
        if (x.name) names.add(String(x.name).toLowerCase());
        if (x.id) ids.add(String(x.id));
      }
    });
  } else if (raw && typeof raw === 'object') {
    (raw.names || raw.excludedNames || []).forEach((n) => names.add(String(n).toLowerCase()));
    (raw.ids || raw.excludedIds || []).forEach((i) => ids.add(String(i)));
  }
  return { names, ids };
}

function buildCatalogMap(allPlayersRaw) {
  const map = new Map();
  const teamLogos = {};
  if (!Array.isArray(allPlayersRaw)) return { map, teamLogos };
  for (const p of allPlayersRaw) {
    if (p?.i != null) map.set(String(p.i), p);
    if (p?.tn && p?.tim && !teamLogos[p.tn]) {
      teamLogos[p.tn] = `https://kickbase.b-cdn.net/${p.tim}`;
    }
  }
  return { map, teamLogos };
}

function enrichPlayer(entry, catalogMap) {
  if (!entry) return entry;
  const raw = catalogMap.get(String(entry.playerId));
  const status = entry.status ?? raw?.st ?? 0;
  const prob = typeof raw?.prob === 'number' ? raw.prob : (entry.startElfProbability ?? entry.prob ?? null);
  const pos = entry.position || (raw?.pos ? POS_CODE_TO_LABEL[raw.pos] : null);
  const imagePath = entry.imagePath || raw?.pim || null;
  return {
    playerId: String(entry.playerId),
    firstName: entry.firstName || raw?.fn || '',
    name: entry.name || raw?.ln || raw?.fn || `Spieler ${entry.playerId}`,
    fullName: [entry.firstName || raw?.fn, entry.name || raw?.ln].filter(Boolean).join(' ').trim() || entry.name || `Spieler ${entry.playerId}`,
    position: pos,
    team: entry.team || raw?.tn || null,
    marketValue: entry.marketValue > 0 ? Math.round(entry.marketValue) : Math.round(raw?.mv || 0),
    predictedChange: Math.round(entry.predictedChange || 0),
    predictedChange3d: entry.predictedChange3d != null ? Math.round(entry.predictedChange3d) : null,
    predictedChange7d: entry.predictedChange7d != null ? Math.round(entry.predictedChange7d) : null,
    trendLast7DaysPercent: entry.trendLast7DaysPercent != null ? Number(entry.trendLast7DaysPercent) : null,
    avgPoints: typeof entry.avgPoints === 'number' ? Math.round(entry.avgPoints * 10) / 10 : (typeof raw?.ap === 'number' ? raw.ap : null),
    seasonPoints: typeof entry.seasonPoints === 'number' && entry.seasonPoints !== 0 ? entry.seasonPoints : (typeof raw?.tp === 'number' ? raw.tp : null),
    lastPoints: typeof entry.lastPoints === 'number' ? Math.round(entry.lastPoints) : null,
    status,
    statusLabel: STATUS_LABELS[status] || (status ? `Status ${status}` : 'Fit'),
    startElfProbability: prob,
    buyRecommended: Boolean(entry.buyRecommended),
    playRecommended: Boolean(entry.playRecommended),
    tradeRecommended: Boolean(entry.tradeRecommended),
    sellRecommended: Boolean(entry.sellRecommended),
    sellReasons: Array.isArray(entry.sellReasons) ? entry.sellReasons : [],
    sellReasonLabels: (entry.sellReasons || []).map((r) => SELL_REASON_LABELS[r] || r),
    imageUrl: entry.imageUrl || (imagePath ? `https://kickbase.b-cdn.net/${imagePath}` : null),
  };
}

/**
 * Berechnet Bundesliga-Teamstaerke rein aus lokalen Kickbase-Daten (Top-11
 * Saisonpunkte pro Team) und bewertet die naechsten 3 Spieltage jedes Teams.
 */
function buildFixtureRadar(spielplan, allPlayersRaw, advisorPlayers, catalogMap, currentMatchday) {
  if (!spielplan || !Array.isArray(spielplan.matchdays)) {
    return { upcomingMatchdays: [], teamRatings: {}, greenSchedule: [], toughSchedule: [] };
  }

  const upcoming = spielplan.matchdays
    .filter((md) => md.number > currentMatchday)
    .slice(0, LOOKAHEAD_MATCHDAYS);

  if (upcoming.length === 0) {
    return { upcomingMatchdays: [], teamRatings: {}, greenSchedule: [], toughSchedule: [] };
  }

  // Teamstaerke aus kumulierten Saisonpunkten der Top-11 Spieler jedes Teams
  const teamPlayerPts = new Map();
  const sourcePlayers = Array.isArray(allPlayersRaw) && allPlayersRaw.length > 0 ? allPlayersRaw : [];
  for (const p of sourcePlayers) {
    if (!p?.tn) continue;
    const tp = typeof p.tp === 'number' ? p.tp : 0;
    if (!teamPlayerPts.has(p.tn)) teamPlayerPts.set(p.tn, []);
    teamPlayerPts.get(p.tn).push(tp);
  }

  const teamScores = [];
  for (const [team, ptsList] of teamPlayerPts.entries()) {
    const top11 = [...ptsList].sort((a, b) => b - a).slice(0, 11);
    const totalTop11 = top11.reduce((s, v) => s + v, 0);
    teamScores.push({ team, powerScore: totalTop11 });
  }
  teamScores.sort((a, b) => b.powerScore - a.powerScore);

  const totalTeams = Math.max(teamScores.length, 18);
  const strengthRankByTeam = new Map();
  teamScores.forEach((t, idx) => {
    strengthRankByTeam.set(t.team, idx + 1); // 1 = staerkstes Team, 18 = schwaechstes
  });

  // Alle Teams aus dem Spielplan einsammeln
  const fixturesByTeam = new Map();
  for (const md of upcoming) {
    for (const m of md.matches || []) {
      const home = normalizePlanTeam(m.home);
      const away = normalizePlanTeam(m.away);
      if (!fixturesByTeam.has(home)) fixturesByTeam.set(home, []);
      if (!fixturesByTeam.has(away)) fixturesByTeam.set(away, []);

      const awayRank = strengthRankByTeam.get(away) || Math.ceil(totalTeams / 2);
      const homeRank = strengthRankByTeam.get(home) || Math.ceil(totalTeams / 2);

      // Basis-Schwierigkeit 1 (leicht) .. 5 (sehr schwer) anhand Gegner-Rang
      // Rang 1 -> 5.0, Rang 18 -> 1.0
      const baseDiffVsAway = 5 - ((awayRank - 1) / Math.max(1, totalTeams - 1)) * 4;
      const baseDiffVsHome = 5 - ((homeRank - 1) / Math.max(1, totalTeams - 1)) * 4;

      const homeDiff = Math.max(1, Math.min(5, Math.round((baseDiffVsAway - 0.35) * 10) / 10));
      const awayDiff = Math.max(1, Math.min(5, Math.round((baseDiffVsHome + 0.35) * 10) / 10));

      fixturesByTeam.get(home).push({
        matchday: md.number,
        dateRange: md.dateRange,
        opponent: away,
        opponentShort: KICKBASE_TO_SHORT_TEAM[away] || away.slice(0, 3).toUpperCase(),
        isHome: true,
        opponentStrengthRank: awayRank,
        difficulty: homeDiff,
      });

      fixturesByTeam.get(away).push({
        matchday: md.number,
        dateRange: md.dateRange,
        opponent: home,
        opponentShort: KICKBASE_TO_SHORT_TEAM[home] || home.slice(0, 3).toUpperCase(),
        isHome: false,
        opponentStrengthRank: homeRank,
        difficulty: awayDiff,
      });
    }
  }

  // Enriched Advisor-Spieler pro Team fuer konkrete Spieler-Hinweise
  const playersByTeam = new Map();
  for (const rawEntry of advisorPlayers || []) {
    const p = enrichPlayer(rawEntry, catalogMap);
    if (!p?.team) continue;
    if (!playersByTeam.has(p.team)) playersByTeam.set(p.team, []);
    playersByTeam.get(p.team).push(p);
  }

  const teamRatings = {};
  const ratingList = [];

  for (const [team, fixtures] of fixturesByTeam.entries()) {
    const avgDifficulty =
      fixtures.length > 0
        ? Math.round((fixtures.reduce((s, f) => s + f.difficulty, 0) / fixtures.length) * 100) / 100
        : 3;
    const homeGames = fixtures.filter((f) => f.isHome).length;
    const strengthRank = strengthRankByTeam.get(team) || 9;

    const candidates = (playersByTeam.get(team) || [])
      .filter((p) => p.status === 0 && (p.startElfProbability == null || p.startElfProbability <= 2))
      .sort((a, b) => {
        const scoreA = (a.avgPoints || 0) * 1.4 + Math.max(0, (a.predictedChange7d || a.predictedChange || 0) / 25000);
        const scoreB = (b.avgPoints || 0) * 1.4 + Math.max(0, (b.predictedChange7d || b.predictedChange || 0) / 25000);
        return scoreB - scoreA;
      })
      .slice(0, 3)
      .map((p) => ({
        playerId: p.playerId,
        fullName: p.fullName,
        name: p.name,
        position: p.position,
        marketValue: p.marketValue,
        avgPoints: p.avgPoints,
        predictedChange: p.predictedChange,
        predictedChange7d: p.predictedChange7d,
        startElfProbability: p.startElfProbability,
      }));

    const item = {
      team,
      teamShort: KICKBASE_TO_SHORT_TEAM[team] || team.slice(0, 3).toUpperCase(),
      strengthRank,
      avgDifficulty,
      homeGames,
      label: avgDifficulty <= 2.45 ? 'Top-Spielplan' : avgDifficulty <= 3.2 ? 'Ausgewogen' : 'Knackig',
      fixtures,
      keyPlayers: candidates,
    };

    teamRatings[team] = item;
    ratingList.push(item);
  }

  // Fuer "Grüner Spielplan" bevorzugen wir leichtes Programm (niedrige avgDifficulty),
  // bei Gleichstand staerkere Teams (bessere Kickbase-Punkteausbeute).
  const greenSchedule = [...ratingList]
    .sort((a, b) => (a.avgDifficulty + a.strengthRank * 0.04) - (b.avgDifficulty + b.strengthRank * 0.04))
    .slice(0, 5);

  const toughSchedule = [...ratingList]
    .sort((a, b) => b.avgDifficulty - a.avgDifficulty)
    .slice(0, 4);

  return {
    upcomingMatchdays: upcoming.map((m) => ({
      number: m.number,
      dateRange: m.dateRange,
      startDate: m.startDate,
      endDate: m.endDate,
      matches: (m.matches || []).map((x) => ({
        home: normalizePlanTeam(x.home),
        away: normalizePlanTeam(x.away),
      })),
    })),
    teamRatings,
    greenSchedule,
    toughSchedule,
  };
}

/**
 * Wertet Spieltags-Daten aus (data.json / spieltag-{N}.json vs spieltag-{N-1}.json,
 * startelf-md{N}.json, optimal-md-{N}-final.json).
 */
function buildMatchdayRecap(dataJson, prevMatchdayJson, startelfJson, optimalJson) {
  const matchday = dataJson.matchday || 0;
  const prevRanksById = new Map();
  const prevPointsById = new Map();

  if (prevMatchdayJson && Array.isArray(prevMatchdayJson.leagues)) {
    for (const lg of prevMatchdayJson.leagues) {
      for (const u of lg.users || []) {
        prevRanksById.set(String(u.id), u.rank);
        prevPointsById.set(String(u.id), parseGermanInt(u.points));
      }
    }
  }

  const allManagers = [];
  const leaguesSummary = [];
  const managerMatchdayById = {};

  for (const lg of dataJson.leagues || []) {
    const leagueKey = normalizeLeagueKey(lg.name);
    const users = (lg.users || []).map((u) => {
      const id = String(u.id);
      const pts = parseGermanInt(u.points);
      const mdPts = parseGermanInt(u.pointsMatchday);
      const prevRank = prevRanksById.get(id) ?? null;
      const rankDelta = prevRank != null ? prevRank - u.rank : 0; // positiv = aufgestiegen
      const startelfEntry = startelfJson?.managers?.[id] || null;
      const lineup = Array.isArray(startelfEntry?.lineup) ? startelfEntry.lineup : [];
      const sortedLineup = [...lineup].sort((a, b) => (b.points || 0) - (a.points || 0));
      const topPlayers = sortedLineup.slice(0, 3).map((p) => ({
        id: String(p.id),
        name: p.name || p.lastName,
        team: p.teamName || null,
        points: p.points || 0,
      }));
      const flopPlayers = sortedLineup
        .filter((p) => (p.points || 0) <= 10)
        .slice(-2)
        .reverse()
        .map((p) => ({
          id: String(p.id),
          name: p.name || p.lastName,
          team: p.teamName || null,
          points: p.points || 0,
        }));

      const obj = {
        id,
        name: u.name,
        leagueKey,
        leagueName: leagueDisplayName(leagueKey),
        leagueColor: lg.color,
        rank: u.rank,
        prevRank,
        rankDelta,
        totalPoints: pts,
        matchdayPoints: mdPts,
        estimatedBudget: parseGermanInt(u.estimatedBudget),
        topPlayers,
        flopPlayers,
      };
      allManagers.push(obj);
      return obj;
    });

    const sortedByMd = [...users].sort((a, b) => b.matchdayPoints - a.matchdayPoints);
    const avgMd = users.length > 0 ? Math.round(users.reduce((s, u) => s + u.matchdayPoints, 0) / users.length) : 0;
    const winner = sortedByMd[0] || null;
    const loser = sortedByMd[sortedByMd.length - 1] || null;
    const biggestClimber = [...users].sort((a, b) => b.rankDelta - a.rankDelta)[0] || null;
    const biggestDropper = [...users].sort((a, b) => a.rankDelta - b.rankDelta)[0] || null;

    const leader = users.find((u) => u.rank === 1) || users[0] || null;
    const runnerUp = users.find((u) => u.rank === 2) || users[1] || null;
    const leaderGap = leader && runnerUp ? leader.totalPoints - runnerUp.totalPoints : null;

    // Pro Manager Abstaende zum Vordermann/Hintermann
    users.forEach((u, idx) => {
      const above = idx > 0 ? users[idx - 1] : null;
      const below = idx < users.length - 1 ? users[idx + 1] : null;
      const mdRankInLeague = sortedByMd.findIndex((x) => x.id === u.id) + 1;
      managerMatchdayById[u.id] = {
        ...u,
        leagueAvg: avgMd,
        diffToLeagueAvg: u.matchdayPoints - avgMd,
        matchdayRankInLeague: mdRankInLeague,
        leagueSize: users.length,
        gapToAbove: above ? above.totalPoints - u.totalPoints : null,
        aboveName: above ? above.name : null,
        gapToBelow: below ? u.totalPoints - below.totalPoints : null,
        belowName: below ? below.name : null,
      };
    });

    leaguesSummary.push({
      key: leagueKey,
      name: leagueDisplayName(leagueKey),
      color: lg.color,
      avgPoints: avgMd,
      winner: winner ? { id: winner.id, name: winner.name, points: winner.matchdayPoints, rank: winner.rank } : null,
      loser: loser ? { id: loser.id, name: loser.name, points: loser.matchdayPoints, rank: loser.rank } : null,
      leader: leader ? { id: leader.id, name: leader.name, totalPoints: leader.totalPoints, gapToSecond: leaderGap, runnerUpName: runnerUp?.name || null } : null,
      biggestClimber: biggestClimber && biggestClimber.rankDelta > 0
        ? { id: biggestClimber.id, name: biggestClimber.name, rank: biggestClimber.rank, delta: biggestClimber.rankDelta }
        : null,
      biggestDropper: biggestDropper && biggestDropper.rankDelta < 0
        ? { id: biggestDropper.id, name: biggestDropper.name, rank: biggestDropper.rank, delta: biggestDropper.rankDelta }
        : null,
      top3Matchday: sortedByMd.slice(0, 3).map((u) => ({
        id: u.id,
        name: u.name,
        points: u.matchdayPoints,
        rank: u.rank,
        rankDelta: u.rankDelta,
      })),
    });
  }

  const sortedOverall = [...allManagers].sort((a, b) => b.matchdayPoints - a.matchdayPoints);
  const overallAvg = allManagers.length > 0
    ? Math.round(allManagers.reduce((s, u) => s + u.matchdayPoints, 0) / allManagers.length)
    : 0;

  sortedOverall.forEach((u, idx) => {
    if (managerMatchdayById[u.id]) {
      managerMatchdayById[u.id].overallMatchdayRank = idx + 1;
      managerMatchdayById[u.id].totalParticipants = sortedOverall.length;
    }
  });

  // Top-Spieler der Elf des Spieltags
  const optimalLineup = Array.isArray(optimalJson?.lineup) ? optimalJson.lineup : [];
  const mvpPlayer = [...optimalLineup].sort((a, b) => (b.points || 0) - (a.points || 0))[0] || null;

  return {
    matchday,
    overallAvg,
    overallWinner: sortedOverall[0]
      ? {
          id: sortedOverall[0].id,
          name: sortedOverall[0].name,
          leagueName: sortedOverall[0].leagueName,
          points: sortedOverall[0].matchdayPoints,
        }
      : null,
    overallTop3: sortedOverall.slice(0, 3).map((u) => ({
      id: u.id,
      name: u.name,
      leagueName: u.leagueName,
      points: u.matchdayPoints,
    })),
    mvpPlayer: mvpPlayer
      ? {
          id: String(mvpPlayer.id),
          name: mvpPlayer.name || mvpPlayer.lastName,
          team: mvpPlayer.teamName || null,
          points: mvpPlayer.points || 0,
          marketValue: mvpPlayer.marketValue || 0,
        }
      : null,
    optimalTeamPoints: optimalJson?.totalPoints || null,
    leagues: leaguesSummary,
    byManagerId: managerMatchdayById,
  };
}

/**
 * Analysiert Transfers im Wochenfenster (letzte 7 Tage ab windowEnd) inklusive
 * Ausgaben, Einnahmen, Netto-Bilanz, Overpay und realisiertem Trade-Gewinn.
 */
function buildWeeklyTransfers(transfersRaw, managersList, techAccounts, windowEndDate) {
  const windowEndMs = windowEndDate.getTime();
  const windowStartMs = windowEndMs - TRANSFER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const managerByLowerName = new Map();
  for (const m of managersList) {
    managerByLowerName.set(String(m.name).toLowerCase(), m);
  }

  // Chronologisch sortieren (aelteste zuerst), damit lastBuy-Tracking sauber laeuft
  const sorted = [...(transfersRaw || [])]
    .filter((t) => t && t.date)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  // Letzter Kaufpreis je (leagueKey|managerLower|playerId)
  const lastBuyMap = new Map();
  const weeklyEvents = [];

  for (const t of sorted) {
    const ts = Date.parse(t.date);
    if (!Number.isFinite(ts) || ts > windowEndMs) continue;

    const leagueKey = normalizeLeagueKey(t._league);
    const price = Number(t.price) || 0;
    const mv = Number(t.marketValueAtTimeOfTransfer) || 0;
    const inWindow = ts >= windowStartMs;

    if (t.buyerName && !techAccounts.names.has(String(t.buyerName).toLowerCase())) {
      const buyerLower = String(t.buyerName).toLowerCase();
      const buyKey = `${leagueKey}|${buyerLower}|${t.playerId}`;
      lastBuyMap.set(buyKey, { price, date: t.date, ts });

      if (inWindow) {
        const overpay = mv > 0 ? price - mv : null;
        const overpayPct = mv > 0 ? Math.round(((price - mv) / mv) * 1000) / 10 : null;
        const mgr = managerByLowerName.get(buyerLower);
        weeklyEvents.push({
          id: `${t.id}-buy`,
          type: 'buy',
          date: t.date,
          leagueKey,
          leagueName: leagueDisplayName(leagueKey),
          managerId: mgr?.id || null,
          managerName: mgr?.name || t.buyerName,
          playerId: String(t.playerId),
          playerName: t.playerName,
          price,
          marketValue: mv,
          overpay,
          overpayPct,
          realizedProfit: null,
          heldDays: null,
        });
      }
    }

    if (t.sellerName && !techAccounts.names.has(String(t.sellerName).toLowerCase())) {
      const sellerLower = String(t.sellerName).toLowerCase();
      const buyKey = `${leagueKey}|${sellerLower}|${t.playerId}`;
      const prevBuy = lastBuyMap.get(buyKey) || null;
      let realizedProfit = null;
      let heldDays = null;
      if (prevBuy) {
        realizedProfit = price - prevBuy.price;
        heldDays = Math.max(0, Math.round((ts - prevBuy.ts) / (1000 * 60 * 60 * 24)));
        lastBuyMap.delete(buyKey);
      }

      if (inWindow) {
        const mgr = managerByLowerName.get(sellerLower);
        weeklyEvents.push({
          id: `${t.id}-sell`,
          type: 'sell',
          date: t.date,
          leagueKey,
          leagueName: leagueDisplayName(leagueKey),
          managerId: mgr?.id || null,
          managerName: mgr?.name || t.sellerName,
          playerId: String(t.playerId),
          playerName: t.playerName,
          price,
          marketValue: mv,
          overpay: null,
          overpayPct: null,
          realizedProfit,
          heldDays,
        });
      }
    }
  }

  // Neueste Events zuerst fuer Anzeige
  weeklyEvents.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  const summarizeEvents = (events) => {
    const buys = events.filter((e) => e.type === 'buy');
    const sells = events.filter((e) => e.type === 'sell');
    const spent = buys.reduce((s, e) => s + e.price, 0);
    const received = sells.reduce((s, e) => s + e.price, 0);
    const netBalance = received - spent;

    const overpayPcts = buys.filter((e) => e.overpayPct != null && e.overpayPct >= -20 && e.overpayPct <= 300).map((e) => e.overpayPct);
    const avgOverpayPct = overpayPcts.length > 0
      ? Math.round((overpayPcts.reduce((s, v) => s + v, 0) / overpayPcts.length) * 10) / 10
      : null;

    const realizedEvents = sells.filter((e) => e.realizedProfit != null);
    const realizedProfit = realizedEvents.reduce((s, e) => s + e.realizedProfit, 0);

    const topBuy = [...buys].sort((a, b) => b.price - a.price)[0] || null;
    const topSale = [...sells].sort((a, b) => b.price - a.price)[0] || null;
    const topOverpay = [...buys]
      .filter((e) => e.overpay != null && e.overpay > 0)
      .sort((a, b) => b.overpay - a.overpay)[0] || null;
    const bestFlip = [...realizedEvents].sort((a, b) => b.realizedProfit - a.realizedProfit)[0] || null;
    const worstFlip = [...realizedEvents].sort((a, b) => a.realizedProfit - b.realizedProfit)[0] || null;

    return {
      totalCount: events.length,
      buyCount: buys.length,
      sellCount: sells.length,
      spent,
      received,
      netBalance,
      avgOverpayPct,
      realizedProfit,
      realizedCount: realizedEvents.length,
      topBuy,
      topSale,
      topOverpay,
      bestFlip: bestFlip && bestFlip.realizedProfit > 0 ? bestFlip : null,
      worstFlip: worstFlip && worstFlip.realizedProfit < 0 ? worstFlip : null,
    };
  };

  const overall = summarizeEvents(weeklyEvents);

  // Pro Liga
  const byLeague = {};
  for (const key of ['LIGA1', 'LIGA2', 'LIGA3']) {
    const lgEvents = weeklyEvents.filter((e) => e.leagueKey === key);
    byLeague[key] = {
      leagueKey: key,
      leagueName: leagueDisplayName(key),
      ...summarizeEvents(lgEvents),
      highlights: lgEvents.slice(0, 12),
    };
  }

  // Pro Manager
  const byManagerId = {};
  const managerBalances = [];
  for (const m of managersList) {
    const mgrEvents = weeklyEvents.filter((e) => e.managerId === m.id || e.managerName.toLowerCase() === m.name.toLowerCase());
    const stats = summarizeEvents(mgrEvents);
    const entry = {
      managerId: m.id,
      managerName: m.name,
      leagueKey: m.leagueKey,
      leagueName: m.leagueName,
      ...stats,
      events: mgrEvents.slice(0, 20),
    };
    byManagerId[m.id] = entry;
    managerBalances.push({
      managerId: m.id,
      managerName: m.name,
      leagueKey: m.leagueKey,
      leagueName: m.leagueName,
      buyCount: stats.buyCount,
      sellCount: stats.sellCount,
      spent: stats.spent,
      received: stats.received,
      netBalance: stats.netBalance,
      realizedProfit: stats.realizedProfit,
      realizedCount: stats.realizedCount,
    });
  }

  // Aktivste Trader & Top-Gewinner der Woche
  const mostActive = [...managerBalances]
    .sort((a, b) => (b.buyCount + b.sellCount) - (a.buyCount + a.sellCount))
    .slice(0, 5);
  const topRealizedTraders = [...managerBalances]
    .filter((m) => m.realizedCount > 0)
    .sort((a, b) => b.realizedProfit - a.realizedProfit)
    .slice(0, 5);

  return {
    windowStart: new Date(windowStartMs).toISOString(),
    windowEnd: new Date(windowEndMs).toISOString(),
    windowDays: TRANSFER_WINDOW_DAYS,
    overall,
    byLeague,
    byManagerId,
    managerBalances,
    mostActive,
    topRealizedTraders,
    recentGlobal: weeklyEvents.slice(0, 25),
  };
}

/**
 * Baut Empfehlungen fuer die kommende Woche:
 *  - Liga-Marktchancen (kombiniert mit Spielplan-Rating)
 *  - Liga-uebergreifende Watchlist (steigender MW + Startelf + guter Spielplan)
 *  - Personalisierte Kader-Warnungen & bezahlbare Markt-Picks pro Manager
 */
function buildRecommendations(advisorData, catalogMap, fixtureRadar, managersList) {
  const teamRatings = fixtureRadar?.teamRatings || {};
  const attachSchedule = (p) => {
    const tr = p?.team ? teamRatings[p.team] : null;
    return {
      ...p,
      scheduleDifficulty: tr ? tr.avgDifficulty : null,
      scheduleLabel: tr ? tr.label : null,
      nextFixtures: tr ? tr.fixtures.map((f) => `${f.isHome ? 'H' : 'A'} ${f.opponentShort}`) : [],
    };
  };

  // Watchlist: Bundesliga-Spieler mit Aufwaertstrend + Fit + hoher Startelf-Chance + gutem Spielplan
  const allEnriched = (advisorData?.players || []).map((p) => attachSchedule(enrichPlayer(p, catalogMap)));

  const watchlist = allEnriched
    .filter((p) => {
      if (p.status !== 0) return false;
      if (p.startElfProbability != null && p.startElfProbability > 2) return false;
      const rising = (p.predictedChange7d || p.predictedChange || 0) > 50_000;
      const goodSchedule = p.scheduleDifficulty != null && p.scheduleDifficulty <= 2.9;
      return rising && goodSchedule;
    })
    .sort((a, b) => {
      const scoreA = ((a.predictedChange7d || a.predictedChange || 0) / 100_000) + ((a.avgPoints || 0) / 25) + (3.5 - (a.scheduleDifficulty || 3)) * 2;
      const scoreB = ((b.predictedChange7d || b.predictedChange || 0) / 100_000) + ((b.avgPoints || 0) / 25) + (3.5 - (b.scheduleDifficulty || 3)) * 2;
      return scoreB - scoreA;
    })
    .slice(0, 8);

  const byLeague = {};
  const byManagerId = {};

  for (const key of ['LIGA1', 'LIGA2', 'LIGA3']) {
    const lgData = advisorData?.leagues?.[key];
    if (!lgData) continue;

    const marketEnriched = (lgData.marketRecommendations || [])
      .map((p) => attachSchedule(enrichPlayer(p, catalogMap)))
      .filter((p) => p.status === 0);

    const marketPicks = [...marketEnriched]
      .filter((p) => p.buyRecommended || p.predictedChange >= 25_000)
      .sort((a, b) => {
        const sA = (a.playRecommended ? 40 : 0) + (a.tradeRecommended ? 25 : 0) + (a.predictedChange / 10_000) + ((a.avgPoints || 0) * 0.4) - ((a.scheduleDifficulty || 3) * 5);
        const sB = (b.playRecommended ? 40 : 0) + (b.tradeRecommended ? 25 : 0) + (b.predictedChange / 10_000) + ((b.avgPoints || 0) * 0.4) - ((b.scheduleDifficulty || 3) * 5);
        return sB - sA;
      })
      .slice(0, 6);

    byLeague[key] = {
      leagueKey: key,
      leagueName: leagueDisplayName(key),
      marketCount: marketEnriched.length,
      marketPicks,
    };

    const managerSquads = lgData.managerSquads || {};
    const managerBudgets = lgData.managerBudgets || {};

    for (const [managerId, squadRaw] of Object.entries(managerSquads)) {
      const squad = (squadRaw || []).map((p) => attachSchedule(enrichPlayer(p, catalogMap)));
      const budgetInfo = managerBudgets[managerId] || null;
      const availableBudget = budgetInfo?.availableBudget ?? budgetInfo?.budget ?? null;

      // Kader-Warnungen: verletzt/gesperrt, Verkaufsempfehlung, oder schwerer Spielplan + fallender MW
      const alerts = squad
        .filter((p) => p.sellRecommended || p.status !== 0)
        .sort((a, b) => {
          const prioA = (a.status !== 0 ? 100 : 0) + (a.sellRecommended ? 40 : 0) + Math.abs(Math.min(0, a.predictedChange)) / 10_000;
          const prioB = (b.status !== 0 ? 100 : 0) + (b.sellRecommended ? 40 : 0) + Math.abs(Math.min(0, b.predictedChange)) / 10_000;
          return prioB - prioA;
        })
        .slice(0, 5);

      // Kader-Formstarke mit gruenem Spielplan ("Halten / Aufstellen")
      const holdStars = squad
        .filter((p) => p.status === 0 && (p.startElfProbability == null || p.startElfProbability <= 2))
        .sort((a, b) => {
          const sA = (a.avgPoints || 0) + (3.5 - (a.scheduleDifficulty || 3)) * 18 + Math.max(0, a.predictedChange / 15_000);
          const sB = (b.avgPoints || 0) + (3.5 - (b.scheduleDifficulty || 3)) * 18 + Math.max(0, b.predictedChange / 15_000);
          return sB - sA;
        })
        .slice(0, 3);

      // Bezahlbare Markt-Picks aus der eigenen Liga
      const affordablePicks = marketPicks
        .filter((p) => availableBudget == null || p.marketValue <= availableBudget)
        .slice(0, 4);

      byManagerId[String(managerId)] = {
        managerId: String(managerId),
        leagueKey: key,
        budget: budgetInfo?.budget ?? null,
        availableBudget,
        squadSize: squad.length,
        injuredCount: squad.filter((p) => p.status !== 0).length,
        sellAlertCount: squad.filter((p) => p.sellRecommended).length,
        alerts,
        holdStars,
        affordablePicks,
      };
    }
  }

  // Sicherstellen, dass jeder bekannte Manager einen Eintrag hat
  for (const m of managersList) {
    if (!byManagerId[m.id]) {
      byManagerId[m.id] = {
        managerId: m.id,
        leagueKey: m.leagueKey,
        budget: null,
        availableBudget: null,
        squadSize: 0,
        injuredCount: 0,
        sellAlertCount: 0,
        alerts: [],
        holdStars: [],
        affordablePicks: byLeague[m.leagueKey]?.marketPicks?.slice(0, 4) || [],
      };
    }
  }

  return {
    advisorGeneratedAt: advisorData?.generatedAt || null,
    watchlist,
    byLeague,
    byManagerId,
  };
}

/**
 * Deterministischer Redaktionstext (funktioniert immer, 0 Kosten, faktentreu).
 */
function buildDeterministicEditorial(recap, transfers, fixtureRadar) {
  const md = recap.matchday;
  const nextMd = fixtureRadar.upcomingMatchdays?.[0]?.number || md + 1;
  const winner = recap.overallWinner;
  const mvp = recap.mvpPlayer;

  const headline = winner
    ? `Spieltag ${md}: ${winner.name} setzt mit ${formatPoints(winner.points)} Punkten die Bestmarke`
    : `Wochenrückblick Spieltag ${md} & Ausblick auf Spieltag ${nextMd}`;

  const introParts = [];
  if (winner) {
    introParts.push(
      `Am ${md}. Spieltag lag der Ligasystem-Schnitt bei ${formatPoints(recap.overallAvg)} Punkten – die Bestmarke sicherte sich ${winner.name} (${winner.leagueName}) mit starken ${formatPoints(winner.points)} Zählern.`
    );
  }
  if (mvp) {
    introParts.push(
      `Überragender Bundesliga-Akteur war ${mvp.name} (${mvp.team}) mit ${formatPoints(mvp.points)} Kickbase-Punkten.`
    );
  }

  const leagueTakes = recap.leagues.map((lg) => {
    const parts = [];
    if (lg.winner) {
      parts.push(`${lg.winner.name} holt den Spieltagssieg (${formatPoints(lg.winner.points)} Pkt., Schnitt ${formatPoints(lg.avgPoints)}).`);
    }
    if (lg.leader) {
      const gapText = lg.leader.gapToSecond != null && lg.leader.runnerUpName
        ? ` mit ${formatPoints(lg.leader.gapToSecond)} Pkt. Vorsprung auf ${lg.leader.runnerUpName}`
        : '';
      parts.push(`Tabellenführer ist ${lg.leader.name}${gapText}.`);
    }
    if (lg.biggestClimber) {
      parts.push(`Aufsteiger der Woche: ${lg.biggestClimber.name} (+${lg.biggestClimber.delta} auf Rang ${lg.biggestClimber.rank}).`);
    }
    return {
      leagueKey: lg.key,
      leagueName: lg.name,
      text: parts.join(' '),
    };
  });

  const ov = transfers.overall;
  const transferParts = [
    `In den letzten ${transfers.windowDays} Tagen wurden ligaübergreifend ${ov.totalCount} Transfers abgewickelt (${ov.buyCount} Käufe über ${formatEuroUnsigned(ov.spent)}, ${ov.sellCount} Verkäufe über ${formatEuroUnsigned(ov.received)}).`,
  ];
  if (ov.topBuy) {
    transferParts.push(
      `Der teuerste Deal der Woche war ${ov.topBuy.playerName} zu ${ov.topBuy.managerName} (${ov.topBuy.leagueName}) für ${formatEuroUnsigned(ov.topBuy.price)}.`
    );
  }
  if (ov.bestFlip) {
    transferParts.push(
      `Den stärksten realisierten Wochen-Gewinn landete ${ov.bestFlip.managerName} mit ${ov.bestFlip.playerName} (${formatEuroShort(ov.bestFlip.realizedProfit)}).`
    );
  }

  const greenTeams = (fixtureRadar.greenSchedule || []).slice(0, 3).map((t) => t.team);
  const toughTeams = (fixtureRadar.toughSchedule || []).slice(0, 2).map((t) => t.team);
  const outlookParts = [];
  if (greenTeams.length > 0) {
    outlookParts.push(
      `Für die kommenden ${fixtureRadar.upcomingMatchdays.length} Spieltage (ab ST ${nextMd}) haben besonders ${greenTeams.join(', ')} ein dankbares Programm – ideal, um rechtzeitig auf Stammspieler und steigende Marktwerte dieser Klubs zu setzen.`
    );
  }
  if (toughTeams.length > 0) {
    outlookParts.push(
      `Deutlich anspruchsvoller wird es kurzfristig für ${toughTeams.join(' und ')} – hier lohnt sich ein Blick auf Alternativen, falls der Marktwert ohnehin nachgibt.`
    );
  }

  return {
    source: 'deterministic',
    headline,
    intro: introParts.join(' '),
    leagueTakes,
    transferTake: transferParts.join(' '),
    outlookTake: outlookParts.join(' '),
  };
}

/**
 * Optionaler Gemini-API-Hook: Veredelt den Redaktionstext, wenn GEMINI_API_KEY
 * gesetzt ist. Alle Zahlen bleiben aus dem deterministischen Payload.
 */
async function maybeEnhanceWithGemini(deterministicEditorial, recap, transfers, fixtureRadar) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.argv.includes('--no-ai')) {
    return deterministicEditorial;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const facts = {
    matchday: recap.matchday,
    overallAvg: recap.overallAvg,
    overallWinner: recap.overallWinner,
    mvpPlayer: recap.mvpPlayer,
    leagues: recap.leagues.map((l) => ({
      name: l.name,
      avgPoints: l.avgPoints,
      winner: l.winner,
      loser: l.loser,
      leader: l.leader,
      biggestClimber: l.biggestClimber,
      biggestDropper: l.biggestDropper,
    })),
    transfers: {
      windowDays: transfers.windowDays,
      totalCount: transfers.overall.totalCount,
      buyCount: transfers.overall.buyCount,
      sellCount: transfers.overall.sellCount,
      spent: transfers.overall.spent,
      received: transfers.overall.received,
      avgOverpayPct: transfers.overall.avgOverpayPct,
      topBuy: transfers.overall.topBuy
        ? { player: transfers.overall.topBuy.playerName, manager: transfers.overall.topBuy.managerName, league: transfers.overall.topBuy.leagueName, price: transfers.overall.topBuy.price }
        : null,
      bestFlip: transfers.overall.bestFlip
        ? { player: transfers.overall.bestFlip.playerName, manager: transfers.overall.bestFlip.managerName, profit: transfers.overall.bestFlip.realizedProfit }
        : null,
    },
    upcomingMatchdays: fixtureRadar.upcomingMatchdays.map((m) => m.number),
    greenSchedule: fixtureRadar.greenSchedule.slice(0, 4).map((t) => ({
      team: t.team,
      fixtures: t.fixtures.map((f) => `${f.isHome ? 'H' : 'A'} ${f.opponent}`),
    })),
    toughSchedule: fixtureRadar.toughSchedule.slice(0, 3).map((t) => ({
      team: t.team,
      fixtures: t.fixtures.map((f) => `${f.isHome ? 'H' : 'A'} ${f.opponent}`),
    })),
  };

  const prompt = [
    'Du bist Redakteur für das interne Kickbase-Ligasystem (3 Ligen: Liga 1, Liga 2, Liga 3).',
    'Schreibe auf Basis AUSSCHLIESSLICH der folgenden JSON-Fakten eine knackige, lebendige, aber seriöse deutsche Wochenzusammenfassung.',
    'Erfinde KEINE Zahlen, Spieler oder Ergebnisse, die nicht in den Fakten stehen.',
    'Antworte ausschließlich als valides JSON-Objekt mit genau diesem Schema:',
    '{"headline":"...","intro":"2-3 Sätze","leagueTakes":[{"leagueKey":"LIGA1","leagueName":"Liga 1","text":"2 Sätze"},{"leagueKey":"LIGA2","leagueName":"Liga 2","text":"2 Sätze"},{"leagueKey":"LIGA3","leagueName":"Liga 3","text":"2 Sätze"}],"transferTake":"2-3 Sätze","outlookTake":"2-3 Sätze"}',
    '',
    'FAKTEN:',
    JSON.stringify(facts),
  ].join('\n');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const payload = await res.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Leere Gemini-Antwort');
    const parsed = JSON.parse(rawText);
    if (!parsed.headline || !parsed.intro || !Array.isArray(parsed.leagueTakes)) {
      throw new Error('Unerwartetes JSON-Schema von Gemini');
    }
    console.log(`Gemini-Redaktionstext erfolgreich generiert (${model}).`);
    return {
      source: `gemini:${model}`,
      headline: String(parsed.headline),
      intro: String(parsed.intro),
      leagueTakes: parsed.leagueTakes,
      transferTake: String(parsed.transferTake || deterministicEditorial.transferTake),
      outlookTake: String(parsed.outlookTake || deterministicEditorial.outlookTake),
    };
  } catch (err) {
    console.warn('Gemini-Aufruf fehlgeschlagen, nutze deterministischen Fallback:', err.message);
    return deterministicEditorial;
  }
}

async function main() {
  const dataJson = readJsonSafe(path.join(PUBLIC_DIR, 'data.json'));
  if (!dataJson) {
    console.error('frontend/public/data.json fehlt - Abbruch.');
    process.exit(1);
  }

  const matchday = dataJson.matchday || 0;
  const prevMatchdayJson = matchday > 1 ? readJsonSafe(path.join(HISTORY_DIR, `spieltag-${matchday - 1}.json`)) : null;
  const startelfJson = readJsonSafe(path.join(HISTORY_DIR, `startelf-md${matchday}.json`));
  const optimalJson = readJsonSafe(path.join(HISTORY_DIR, `optimal-md-${matchday}-final.json`));
  const transfersRaw = readJsonSafe(path.join(HISTORY_DIR, 'transfers.json'), []);
  const allPlayersRaw = readJsonSafe(path.join(HISTORY_DIR, 'all_players.json'), []);
  const advisorData = readJsonSafe(path.join(PUBLIC_DIR, 'advisor-data.json'), {});
  const spielplan = readJsonSafe(path.join(PUBLIC_DIR, 'bundesliga-spielplan.json'), {});
  const techAccounts = loadTechnicalAccounts();

  const { map: catalogMap, teamLogos } = buildCatalogMap(allPlayersRaw);

  // Manager-Liste aus data.json
  const managersList = [];
  for (const lg of dataJson.leagues || []) {
    const leagueKey = normalizeLeagueKey(lg.name);
    for (const u of lg.users || []) {
      managersList.push({
        id: String(u.id),
        name: u.name,
        leagueKey,
        leagueName: leagueDisplayName(leagueKey),
        leagueColor: lg.color,
        rank: u.rank,
      });
    }
  }

  // Zeitfenster-Ende: neuester Zeitstempel aus data.json oder transfers.json
  const dataTs = Date.parse(dataJson.timestamp || '') || Date.now();
  const latestTransferTs = (transfersRaw || []).reduce((max, t) => {
    const ts = Date.parse(t?.date || '');
    return Number.isFinite(ts) && ts > max ? ts : max;
  }, 0);
  const windowEndDate = new Date(Math.max(dataTs, latestTransferTs || dataTs));

  const recap = buildMatchdayRecap(dataJson, prevMatchdayJson, startelfJson, optimalJson);
  const transfers = buildWeeklyTransfers(transfersRaw, managersList, techAccounts, windowEndDate);
  const fixtureRadar = buildFixtureRadar(spielplan, allPlayersRaw, advisorData?.players || [], catalogMap, matchday);
  const recommendations = buildRecommendations(advisorData, catalogMap, fixtureRadar, managersList);

  const deterministicEditorial = buildDeterministicEditorial(recap, transfers, fixtureRadar);
  const editorial = await maybeEnhanceWithGemini(deterministicEditorial, recap, transfers, fixtureRadar);

  const isoWeek = getIsoWeekNumber(windowEndDate);
  const nextMdNumbers = fixtureRadar.upcomingMatchdays.map((m) => m.number);
  const outlookRange = nextMdNumbers.length > 1
    ? `ST ${nextMdNumbers[0]}–${nextMdNumbers[nextMdNumbers.length - 1]}`
    : nextMdNumbers.length === 1
      ? `ST ${nextMdNumbers[0]}`
      : `ST ${matchday + 1}`;

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    dataTimestamp: dataJson.timestamp || null,
    matchday,
    nextMatchday: nextMdNumbers[0] || matchday + 1,
    isoWeek,
    editionLabel: `KW ${isoWeek} · Rückblick ST ${matchday} & Ausblick ${outlookRange}`,
    hasAiCommentary: editorial.source.startsWith('gemini:'),
    editorial,
    teamLogos,
    managers: managersList,
    recap,
    transfers,
    fixtureRadar,
    recommendations,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output), 'utf8');
  console.log(`Weekly Summary gespeichert: ${OUTPUT_PATH}`);
  console.log(`  Ausgabe: ${output.editionLabel}`);
  console.log(`  Transfers (7T): ${transfers.overall.totalCount} (${transfers.overall.buyCount} Käufe / ${transfers.overall.sellCount} Verkäufe)`);
  console.log(`  Grüner Spielplan: ${fixtureRadar.greenSchedule.map((t) => `${t.team} (${t.avgDifficulty})`).join(', ')}`);
  console.log(`  Watchlist-Spieler: ${recommendations.watchlist.length}`);
}

main().catch((err) => {
  console.error('Fehler beim Generieren der Weekly Summary:', err);
  process.exit(1);
});
