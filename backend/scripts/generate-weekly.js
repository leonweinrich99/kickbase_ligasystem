const fs = require('fs');
const path = require('path');

/**
 * Generiert die personalisierte Weekly-Summary-Ausgabe (Artikel-Format) und
 * pflegt das Ausgaben-Archiv in:
 *   frontend/public/weekly-summary.json
 *
 * Datenquellen:
 *   - Lokale Kickbase-/Advisor-Daten:
 *       data.json, history/spieltag-{N}.json, history/startelf-md{N}.json,
 *       history/transfers.json, history/all_players.json, advisor-data.json,
 *       bundesliga-spielplan.json
 *   - Live-Bundesliga-Tabelle & 5-Spiele-Form (OpenLigaDB):
 *       https://api.openligadb.de/getbltable/bl1/{season}
 *       https://api.openligadb.de/getmatchdata/bl1/{season}
 *
 * Optionaler KI-Feinschliff:
 *   Ist GEMINI_API_KEY gesetzt, erzeugt ein einziger kompakter Gemini-Aufruf
 *   personalisierte 1-2-Satz-Takes je Manager sowie eine kurze Form-Einordnung
 *   strikt auf Basis der berechneten Fakten. Ohne Key oder bei API-Fehler
 *   greift nahtlos der deterministische Text-Generator.
 */

const PUBLIC_DIR = path.join(__dirname, '../../frontend/public');
const HISTORY_DIR = path.join(PUBLIC_DIR, 'history');
const OUTPUT_PATH = path.join(PUBLIC_DIR, 'weekly-summary.json');
const TECHNICAL_ACCOUNTS_PATH = path.join(__dirname, '../technical-accounts.json');

const TRANSFER_WINDOW_DAYS = 7;
const LOOKAHEAD_MATCHDAYS = 3;
const MAX_STORED_EDITIONS = 16;
const OPENLIGA_BASE = 'https://api.openligadb.de';

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

// Vereinheitlichung aller Teamnamen (Spielplan + OpenLigaDB -> Kickbase-Name)
const TEAM_ALIAS_TO_KICKBASE = {
  'bayern münchen': 'Bayern',
  'fc bayern münchen': 'Bayern',
  bayern: 'Bayern',
  'borussia dortmund': 'Dortmund',
  dortmund: 'Dortmund',
  'bayer 04 leverkusen': 'Leverkusen',
  'bayer leverkusen': 'Leverkusen',
  leverkusen: 'Leverkusen',
  'rb leipzig': 'Leipzig',
  leipzig: 'Leipzig',
  'vfb stuttgart': 'Stuttgart',
  stuttgart: 'Stuttgart',
  'eintracht frankfurt': 'Frankfurt',
  frankfurt: 'Frankfurt',
  'sc freiburg': 'Freiburg',
  freiburg: 'Freiburg',
  'sv werder bremen': 'Bremen',
  'werder bremen': 'Bremen',
  bremen: 'Bremen',
  'tsg hoffenheim': 'Hoffenheim',
  'tsg 1899 hoffenheim': 'Hoffenheim',
  hoffenheim: 'Hoffenheim',
  'fc augsburg': 'Augsburg',
  augsburg: 'Augsburg',
  '1. fsv mainz 05': 'Mainz',
  'fsv mainz 05': 'Mainz',
  mainz: 'Mainz',
  '1. fc union berlin': 'Union Berlin',
  'union berlin': 'Union Berlin',
  'borussia mönchengladbach': "M'gladbach",
  gladbach: "M'gladbach",
  "m'gladbach": "M'gladbach",
  '1. fc köln': 'Köln',
  köln: 'Köln',
  'hamburger sv': 'Hamburg',
  hsv: 'Hamburg',
  hamburg: 'Hamburg',
  'fc schalke 04': 'Schalke',
  'schalke 04': 'Schalke',
  s04: 'Schalke',
  schalke: 'Schalke',
  'sc paderborn 07': 'Paderborn',
  paderborn: 'Paderborn',
  'sv 07 elversberg': 'Elversberg',
  'sv elversberg': 'Elversberg',
  elversberg: 'Elversberg',
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

function normalizeTeamName(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  return TEAM_ALIAS_TO_KICKBASE[key] || String(name).trim();
}

function formatEuroSigned(val) {
  if (val === null || val === undefined || !Number.isFinite(val)) return '–';
  const sign = val > 0 ? '+' : val < 0 ? '-' : '';
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2).replace('.', ',')} Mrd €`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k €`;
  return `${sign}${Math.round(abs)} €`;
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

function getBundesligaSeasonYear(spielplan, refDate) {
  const m = String(spielplan?.season || '').match(/^(\d{4})/);
  if (m) return Number(m[1]);
  return refDate.getUTCMonth() >= 6 ? refDate.getUTCFullYear() : refDate.getUTCFullYear() - 1;
}

function loadTechnicalAccounts() {
  const raw = readJsonSafe(TECHNICAL_ACCOUNTS_PATH, null);
  const names = new Set();
  if (Array.isArray(raw)) {
    raw.forEach((x) => {
      if (typeof x === 'string') names.add(x.toLowerCase());
      else if (x?.name) names.add(String(x.name).toLowerCase());
    });
  } else if (raw && typeof raw === 'object') {
    (raw.names || raw.excludedNames || []).forEach((n) => names.add(String(n).toLowerCase()));
  }
  return { names };
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
  const firstName = entry.firstName || raw?.fn || '';
  const name = entry.name || raw?.ln || raw?.fn || `Spieler ${entry.playerId}`;
  return {
    playerId: String(entry.playerId),
    name,
    fullName: [firstName, name].filter(Boolean).join(' ').trim() || name,
    position: pos,
    team: normalizeTeamName(entry.team || raw?.tn || null),
    marketValue: entry.marketValue > 0 ? Math.round(entry.marketValue) : Math.round(raw?.mv || 0),
    predictedChange: Math.round(entry.predictedChange || 0),
    predictedChange7d: entry.predictedChange7d != null ? Math.round(entry.predictedChange7d) : null,
    avgPoints: typeof entry.avgPoints === 'number' ? Math.round(entry.avgPoints * 10) / 10 : (typeof raw?.ap === 'number' ? raw.ap : null),
    status,
    statusLabel: STATUS_LABELS[status] || (status ? `Status ${status}` : 'Fit'),
    startElfProbability: prob,
    buyRecommended: Boolean(entry.buyRecommended),
    playRecommended: Boolean(entry.playRecommended),
    tradeRecommended: Boolean(entry.tradeRecommended),
    sellRecommended: Boolean(entry.sellRecommended),
    sellReasonLabels: (entry.sellReasons || []).map((r) => SELL_REASON_LABELS[r] || r),
    imageUrl: entry.imageUrl || (imagePath ? `https://kickbase.b-cdn.net/${imagePath}` : null),
  };
}

/**
 * Holt die echte aktuelle Bundesliga-Tabelle und die Ergebnisse der letzten
 * 5 Spiele je Team von OpenLigaDB. Bei Netzwerkfehler (z.B. Offline-Test)
 * liefert die Funktion null und wir fallen defensiv auf den Spielplan zurueck.
 */
async function fetchOpenLigaFormAndTable(seasonYear) {
  try {
    const [tableRes, matchesRes] = await Promise.all([
      fetch(`${OPENLIGA_BASE}/getbltable/bl1/${seasonYear}`),
      fetch(`${OPENLIGA_BASE}/getmatchdata/bl1/${seasonYear}`),
    ]);
    if (!tableRes.ok || !matchesRes.ok) {
      throw new Error(`HTTP ${tableRes.status}/${matchesRes.status}`);
    }
    const [tableRaw, matchesRaw] = await Promise.all([tableRes.json(), matchesRes.json()]);
    if (!Array.isArray(tableRaw) || tableRaw.length === 0) {
      throw new Error('Leere Bundesliga-Tabelle von OpenLigaDB');
    }

    // Letzte 5 beendete Spiele pro Team aus matchesRaw extrahieren
    const finished = (Array.isArray(matchesRaw) ? matchesRaw : [])
      .filter((m) => m?.matchIsFinished && Array.isArray(m.matchResults) && m.matchResults.length > 0)
      .sort((a, b) => {
        const gA = a?.group?.groupOrderID ?? 0;
        const gB = b?.group?.groupOrderID ?? 0;
        if (gA !== gB) return gA - gB;
        return Date.parse(a.matchDateTimeUTC || 0) - Date.parse(b.matchDateTimeUTC || 0);
      });

    const teamMatchesMap = new Map();
    for (const m of finished) {
      const home = normalizeTeamName(m.team1?.teamName || m.team1?.shortName);
      const away = normalizeTeamName(m.team2?.teamName || m.team2?.shortName);
      const finalRes =
        m.matchResults.find((r) => r.resultTypeID === 2) ||
        [...m.matchResults].sort((a, b) => (b.resultOrderID ?? 0) - (a.resultOrderID ?? 0))[0];
      if (!home || !away || !finalRes) continue;

      const gH = Number(finalRes.pointsTeam1 ?? 0);
      const gA = Number(finalRes.pointsTeam2 ?? 0);
      if (!teamMatchesMap.has(home)) teamMatchesMap.set(home, []);
      if (!teamMatchesMap.has(away)) teamMatchesMap.set(away, []);

      teamMatchesMap.get(home).push({
        res: gH > gA ? 'S' : gH === gA ? 'U' : 'N',
        pts: gH > gA ? 3 : gH === gA ? 1 : 0,
        gf: gH,
        ga: gA,
      });
      teamMatchesMap.get(away).push({
        res: gA > gH ? 'S' : gA === gH ? 'U' : 'N',
        pts: gA > gH ? 3 : gA === gH ? 1 : 0,
        gf: gA,
        ga: gH,
      });
    }

    const tableByTeam = {};
    const tableList = tableRaw.map((row, idx) => {
      const team = normalizeTeamName(row.teamName || row.shortName);
      const recent5 = (teamMatchesMap.get(team) || []).slice(-5);
      const form = recent5.map((x) => x.res);
      const formPoints = recent5.reduce((s, x) => s + x.pts, 0);
      const formWins = recent5.filter((x) => x.res === 'S').length;
      const formLosses = recent5.filter((x) => x.res === 'N').length;
      const formGf = recent5.reduce((s, x) => s + x.gf, 0);
      const formGa = recent5.reduce((s, x) => s + x.ga, 0);

      const entry = {
        team,
        short: KICKBASE_TO_SHORT_TEAM[team] || team.slice(0, 3).toUpperCase(),
        rank: idx + 1,
        points: Number(row.points ?? 0),
        matches: Number(row.matches ?? 0),
        won: Number(row.won ?? 0),
        draw: Number(row.draw ?? 0),
        lost: Number(row.lost ?? 0),
        goalsFor: Number(row.goals ?? 0),
        goalsAgainst: Number(row.opponentGoals ?? 0),
        goalDiff: Number(row.goalDiff ?? (Number(row.goals ?? 0) - Number(row.opponentGoals ?? 0))),
        form, // z.B. ['S','S','U','S','N'] (aeltestes -> neuestes)
        formString: form.join('-'),
        formPoints, // 0..15
        formWins,
        formLosses,
        formGf,
        formGa,
      };
      tableByTeam[team] = entry;
      return entry;
    });

    console.log(`OpenLigaDB Bundesliga-Tabelle & 5-Spiele-Form geladen (${tableList.length} Teams, Saison ${seasonYear}).`);
    return { source: 'openligadb', tableByTeam, tableList };
  } catch (err) {
    console.warn('OpenLigaDB nicht erreichbar, nutze Spielplan-Fallback:', err.message);
    return null;
  }
}

/**
 * Bewertet die kommenden 3 Spieltage jedes Teams anhand echter Tabellensituation
 * (Tabellenplatz, Punkte, Tordifferenz) UND 5-Spiele-Form (Punkte aus letzten 5).
 */
function buildFormAndScheduleRadar(spielplan, blData, advisorPlayers, catalogMap, currentMatchday) {
  const upcoming = (spielplan?.matchdays || [])
    .filter((md) => md.number > currentMatchday)
    .slice(0, LOOKAHEAD_MATCHDAYS);

  const tableByTeam = blData?.tableByTeam || {};
  const hasRealTable = Object.keys(tableByTeam).length >= 16;

  // Staerke-Score 0..100 pro Team aus echtem Tabellenplatz (55%) + 5-Spiele-Form (45%)
  const teamStrengthScore = (team) => {
    const t = tableByTeam[team];
    if (!t) return 50;
    const rankScore = ((19 - t.rank) / 18) * 100; // Platz 1 -> 100, Platz 18 -> 5.5
    const formScore = (t.formPoints / 15) * 100;  // 15/15 -> 100, 0/15 -> 0
    return Math.round(rankScore * 0.55 + formScore * 0.45);
  };

  // Enriched Spieler pro Team fuer konkrete Empfehlungen
  const playersByTeam = new Map();
  for (const rawEntry of advisorPlayers || []) {
    const p = enrichPlayer(rawEntry, catalogMap);
    if (!p?.team) continue;
    if (!playersByTeam.has(p.team)) playersByTeam.set(p.team, []);
    playersByTeam.get(p.team).push(p);
  }

  const fixturesByTeam = new Map();
  for (const md of upcoming) {
    for (const m of md.matches || []) {
      const home = normalizeTeamName(m.home);
      const away = normalizeTeamName(m.away);
      if (!fixturesByTeam.has(home)) fixturesByTeam.set(home, []);
      if (!fixturesByTeam.has(away)) fixturesByTeam.set(away, []);

      const buildFix = (opponent, isHome) => {
        const oppTable = tableByTeam[opponent] || null;
        const oppStrength = teamStrengthScore(opponent);
        // Heimvorteil verschiebt empfundene Gegnerstaerke leicht nach unten
        const effectiveOppStrength = Math.max(0, Math.min(100, oppStrength + (isHome ? -8 : 8)));
        const tier =
          effectiveOppStrength <= 38
            ? 'easy'
            : effectiveOppStrength >= 66
              ? 'hard'
              : 'medium';
        return {
          matchday: md.number,
          dateRange: md.dateRange,
          opponent,
          opponentShort: KICKBASE_TO_SHORT_TEAM[opponent] || opponent.slice(0, 3).toUpperCase(),
          isHome,
          opponentRank: oppTable?.rank ?? null,
          opponentPoints: oppTable?.points ?? null,
          opponentForm: oppTable?.formString || null,
          opponentFormPoints: oppTable?.formPoints ?? null,
          effectiveOppStrength,
          tier,
        };
      };

      fixturesByTeam.get(home).push(buildFix(away, true));
      fixturesByTeam.get(away).push(buildFix(home, false));
    }
  }

  const byTeam = {};
  const list = [];

  for (const [team, fixtures] of fixturesByTeam.entries()) {
    const tInfo = tableByTeam[team] || null;
    const ownStrength = teamStrengthScore(team);
    const avgOppStrength =
      fixtures.length > 0
        ? Math.round(fixtures.reduce((s, f) => s + f.effectiveOppStrength, 0) / fixtures.length)
        : 50;
    const avgOppRank =
      fixtures.length > 0 && fixtures.every((f) => f.opponentRank != null)
        ? Math.round((fixtures.reduce((s, f) => s + f.opponentRank, 0) / fixtures.length) * 10) / 10
        : null;

    // Attraktivitaet fuer Kickbase: eigene Form/Tabellenstaerke MINUS Gegnerstaerke
    const attractiveness = ownStrength - avgOppStrength;

    // Klare, nachvollziehbare Begruendung auf Basis von Tabelle + 5-Spiele-Form
    const easiestOpp = [...fixtures].sort((a, b) => a.effectiveOppStrength - b.effectiveOppStrength)[0] || null;
    const hardestOpp = [...fixtures].sort((a, b) => b.effectiveOppStrength - a.effectiveOppStrength)[0] || null;

    let reason = '';
    if (tInfo) {
      const formDesc = `${tInfo.formPoints}/15 Pkt aus den letzten 5 (${tInfo.formString})`;
      if (easiestOpp && easiestOpp.opponentRank != null) {
        reason = `Platz ${tInfo.rank} (${tInfo.points} Pkt, Form: ${formDesc}) – trifft u. a. auf ${easiestOpp.opponent} (Platz ${easiestOpp.opponentRank}, Form ${easiestOpp.opponentForm || '–'}).`;
      } else {
        reason = `Platz ${tInfo.rank} (${tInfo.points} Pkt, Form: ${formDesc}).`;
      }
    }

    let toughReason = '';
    if (tInfo && hardestOpp && hardestOpp.opponentRank != null) {
      const hardOpps = fixtures.filter((f) => f.opponentRank != null && f.opponentRank <= 6);
      const oppListText = (hardOpps.length > 0 ? hardOpps : [hardestOpp])
        .map((f) => `${f.opponent} (#${f.opponentRank})`)
        .join(' & ');
      toughReason = `Platz ${tInfo.rank} (${tInfo.formPoints}/15 Pkt zuletzt) – mit ${oppListText} wartet ein anspruchsvolles Programm.`;
    }

    const keyPlayers = (playersByTeam.get(team) || [])
      .filter((p) => p.status === 0 && (p.startElfProbability == null || p.startElfProbability <= 2))
      .sort((a, b) => ((b.avgPoints || 0) * 1.3 + Math.max(0, (b.predictedChange7d || 0) / 30000)) - ((a.avgPoints || 0) * 1.3 + Math.max(0, (a.predictedChange7d || 0) / 30000)))
      .slice(0, 3)
      .map((p) => ({
        playerId: p.playerId,
        name: p.name,
        fullName: p.fullName,
        position: p.position,
        avgPoints: p.avgPoints,
        predictedChange: p.predictedChange,
      }));

    const item = {
      team,
      short: KICKBASE_TO_SHORT_TEAM[team] || team.slice(0, 3).toUpperCase(),
      rank: tInfo?.rank ?? null,
      points: tInfo?.points ?? null,
      goalDiff: tInfo?.goalDiff ?? null,
      form: tInfo?.form || [],
      formString: tInfo?.formString || null,
      formPoints: tInfo?.formPoints ?? null,
      avgOppRank,
      avgOppStrength,
      attractiveness,
      reason,
      toughReason,
      fixtures,
      keyPlayers,
    };

    byTeam[team] = item;
    list.push(item);
  }

  // Top 3 Teams mit der besten Kombination aus eigener Form/Tabelle + schwaecheren Gegnern
  const hotTeams = [...list]
    .sort((a, b) => b.attractiveness - a.attractiveness)
    .slice(0, 3);

  // 2-3 Teams mit besonders unangenehmem Programm (starke Gegner + eigene Schwaeche)
  const toughTeams = [...list]
    .sort((a, b) => a.attractiveness - b.attractiveness)
    .slice(0, 3);

  return {
    hasRealTable,
    upcomingMatchdays: upcoming.map((m) => ({
      number: m.number,
      dateRange: m.dateRange,
    })),
    hotTeams,
    toughTeams,
    byTeam,
  };
}

/**
 * Baut pro Manager strikt persoenliche Daten fuer Spieltag, Transfers (7T) und
 * Ausblick/Empfehlungen.
 */
function buildPersonalizedManagers(dataJson, startelfJson, transfersRaw, advisorData, catalogMap, formRadar, techAccounts, windowEndDate) {
  const matchday = dataJson.matchday || 0;
  const windowEndMs = windowEndDate.getTime();
  const windowStartMs = windowEndMs - TRANSFER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // 1. Manager-Grundliste + Spieltags-Auswertung (nur aktueller Spieltag!)
  const managersList = [];
  const mdByManagerId = {};

  for (const lg of dataJson.leagues || []) {
    const leagueKey = normalizeLeagueKey(lg.name);
    const users = (lg.users || []).map((u) => ({
      id: String(u.id),
      name: u.name,
      leagueKey,
      leagueName: leagueDisplayName(leagueKey),
      leagueColor: lg.color,
      seasonRank: u.rank,
      matchdayPoints: parseGermanInt(u.pointsMatchday),
    }));

    const sortedByMd = [...users].sort((a, b) => b.matchdayPoints - a.matchdayPoints);
    const leagueAvg = users.length > 0
      ? Math.round(users.reduce((s, u) => s + u.matchdayPoints, 0) / users.length)
      : 0;

    for (const u of users) {
      managersList.push({
        id: u.id,
        name: u.name,
        leagueKey: u.leagueKey,
        leagueName: u.leagueName,
        leagueColor: u.leagueColor,
        rank: u.seasonRank,
      });

      const mdRank = sortedByMd.findIndex((x) => x.id === u.id) + 1;
      const startelfEntry = startelfJson?.managers?.[u.id] || null;
      const lineup = Array.isArray(startelfEntry?.lineup) ? startelfEntry.lineup : [];
      const sortedLineup = [...lineup].sort((a, b) => (b.points || 0) - (a.points || 0));

      const topPlayers = sortedLineup.slice(0, 3).map((p) => ({
        id: String(p.id),
        name: p.name || p.lastName,
        team: normalizeTeamName(p.teamName),
        points: p.points || 0,
      }));
      const flopPlayers = sortedLineup
        .filter((p) => (p.points || 0) <= 10)
        .slice(-2)
        .reverse()
        .map((p) => ({
          id: String(p.id),
          name: p.name || p.lastName,
          team: normalizeTeamName(p.teamName),
          points: p.points || 0,
        }));

      const diffToAvg = u.matchdayPoints - leagueAvg;
      const top1 = topPlayers[0];
      const flop1 = flopPlayers[0];
      let note = `Mit ${formatPoints(u.matchdayPoints)} Punkten landest du an Spieltag ${matchday} auf Platz ${mdRank} von ${users.length} in ${u.leagueName} (${diffToAvg >= 0 ? '+' : ''}${formatPoints(diffToAvg)} vs. Ligaschnitt).`;
      if (top1) {
        note += ` Bester Scorer deiner Elf war ${top1.name} (${top1.points} Pkt)`;
        if (flop1 && flop1.points <= 0) {
          note += `, während ${flop1.name} (${flop1.points} Pkt) Punkte liegen ließ.`;
        } else {
          note += '.';
        }
      }

      mdByManagerId[u.id] = {
        points: u.matchdayPoints,
        leagueAvg,
        diffToAvg,
        matchdayRank: mdRank,
        leagueSize: users.length,
        topPlayers,
        flopPlayers,
        note,
      };
    }
  }

  // 2. Persoenliche Transfer-Bilanz (nur letzte 7 Tage, mit historischem Last-Buy fuer echte Flips)
  const managerByLowerName = new Map(managersList.map((m) => [m.name.toLowerCase(), m]));
  const sortedTransfers = [...(transfersRaw || [])]
    .filter((t) => t?.date)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  const lastBuyMap = new Map();
  const eventsByManagerId = new Map(managersList.map((m) => [m.id, []]));

  for (const t of sortedTransfers) {
    const ts = Date.parse(t.date);
    if (!Number.isFinite(ts) || ts > windowEndMs) continue;

    const leagueKey = normalizeLeagueKey(t._league);
    const price = Number(t.price) || 0;
    const mv = Number(t.marketValueAtTimeOfTransfer) || 0;
    const inWindow = ts >= windowStartMs;

    if (t.buyerName && !techAccounts.names.has(String(t.buyerName).toLowerCase())) {
      const buyerLower = String(t.buyerName).toLowerCase();
      const buyKey = `${leagueKey}|${buyerLower}|${t.playerId}`;
      lastBuyMap.set(buyKey, { price, ts });

      if (inWindow) {
        const mgr = managerByLowerName.get(buyerLower);
        if (mgr) {
          const overpayPct = mv > 0 ? Math.round(((price - mv) / mv) * 1000) / 10 : null;
          eventsByManagerId.get(mgr.id).push({
            id: `${t.id}-buy`,
            type: 'buy',
            date: t.date,
            playerId: String(t.playerId),
            playerName: t.playerName,
            price,
            overpayPct,
            realizedProfit: null,
            heldDays: null,
          });
        }
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
        if (mgr) {
          eventsByManagerId.get(mgr.id).push({
            id: `${t.id}-sell`,
            type: 'sell',
            date: t.date,
            playerId: String(t.playerId),
            playerName: t.playerName,
            price,
            overpayPct: null,
            realizedProfit,
            heldDays,
          });
        }
      }
    }
  }

  // 3. Persoenlicher Ausblick + Kader-Check + Budget-Markt-Picks (angereichert mit Tabelle & Form!)
  const teamRadar = formRadar.byTeam || {};
  const attachFormMatchup = (p) => {
    const tr = p?.team ? teamRadar[p.team] : null;
    const nextFix = tr?.fixtures?.[0] || null;
    return {
      ...p,
      teamRank: tr?.rank ?? null,
      teamForm: tr?.formString || null,
      nextOpponent: nextFix
        ? {
            short: nextFix.opponentShort,
            name: nextFix.opponent,
            isHome: nextFix.isHome,
            rank: nextFix.opponentRank,
            form: nextFix.opponentForm,
            tier: nextFix.tier,
          }
        : null,
      upcomingFixtures: (tr?.fixtures || []).map((f) => ({
        short: f.opponentShort,
        isHome: f.isHome,
        rank: f.opponentRank,
        tier: f.tier,
      })),
    };
  };

  const marketByLeague = {};
  for (const key of ['LIGA1', 'LIGA2', 'LIGA3']) {
    const lgData = advisorData?.leagues?.[key];
    const market = (lgData?.marketRecommendations || [])
      .map((p) => attachFormMatchup(enrichPlayer(p, catalogMap)))
      .filter((p) => p.status === 0 && (p.buyRecommended || p.predictedChange >= 25_000))
      .sort((a, b) => {
        const trA = teamRadar[a.team]?.attractiveness ?? 0;
        const trB = teamRadar[b.team]?.attractiveness ?? 0;
        const sA = (a.playRecommended ? 35 : 0) + (a.tradeRecommended ? 20 : 0) + (a.predictedChange / 12_000) + ((a.avgPoints || 0) * 0.35) + trA * 0.25;
        const sB = (b.playRecommended ? 35 : 0) + (b.tradeRecommended ? 20 : 0) + (b.predictedChange / 12_000) + ((b.avgPoints || 0) * 0.35) + trB * 0.25;
        return sB - sA;
      });
    marketByLeague[key] = market;
  }

  const byManagerId = {};
  for (const m of managersList) {
    const events = (eventsByManagerId.get(m.id) || []).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const buys = events.filter((e) => e.type === 'buy');
    const sells = events.filter((e) => e.type === 'sell');
    const spent = buys.reduce((s, e) => s + e.price, 0);
    const received = sells.reduce((s, e) => s + e.price, 0);
    const netBalance = received - spent;
    const realized = sells.filter((e) => e.realizedProfit != null);
    const realizedProfit = realized.reduce((s, e) => s + e.realizedProfit, 0);
    const overpays = buys.filter((e) => e.overpayPct != null && e.overpayPct >= -20 && e.overpayPct <= 300).map((e) => e.overpayPct);
    const avgOverpayPct = overpays.length > 0
      ? Math.round((overpays.reduce((s, v) => s + v, 0) / overpays.length) * 10) / 10
      : null;
    const bestFlip = [...realized].sort((a, b) => b.realizedProfit - a.realizedProfit)[0] || null;

    const lgData = advisorData?.leagues?.[m.leagueKey] || {};
    const squadRaw = lgData.managerSquads?.[m.id] || [];
    const squad = squadRaw.map((p) => attachFormMatchup(enrichPlayer(p, catalogMap)));
    const budgetInfo = lgData.managerBudgets?.[m.id] || null;
    const availableBudget = budgetInfo?.availableBudget ?? budgetInfo?.budget ?? null;

    // Kader-Warnungen (kompakt: max 4)
    const squadAlerts = squad
      .filter((p) => p.sellRecommended || p.status !== 0)
      .sort((a, b) => ((b.status !== 0 ? 100 : 0) + (b.sellRecommended ? 40 : 0)) - ((a.status !== 0 ? 100 : 0) + (a.sellRecommended ? 40 : 0)))
      .slice(0, 4);

    // Eigene fitte Stammspieler mit interessantem Matchup am naechsten Spieltag (leichter Gegner / starke eigene Form)
    const squadSpotlight = squad
      .filter((p) => p.status === 0 && (p.startElfProbability == null || p.startElfProbability <= 2) && p.nextOpponent)
      .sort((a, b) => {
        const scoreA = (a.nextOpponent?.tier === 'easy' ? 30 : a.nextOpponent?.tier === 'hard' ? -15 : 0) + (teamRadar[a.team]?.attractiveness ?? 0) * 0.4 + (a.avgPoints || 0) * 0.25;
        const scoreB = (b.nextOpponent?.tier === 'easy' ? 30 : b.nextOpponent?.tier === 'hard' ? -15 : 0) + (teamRadar[b.team]?.attractiveness ?? 0) * 0.4 + (b.avgPoints || 0) * 0.25;
        return scoreB - scoreA;
      })
      .slice(0, 3);

    // Bezahlbare Markt-Empfehlungen (kompakt: max 3)
    const marketPicks = (marketByLeague[m.leagueKey] || [])
      .filter((p) => availableBudget == null || p.marketValue <= availableBudget)
      .slice(0, 3);

    // Deterministischer persoenlicher Ausblick-Satz
    const outlookParts = [];
    const injuredCount = squad.filter((p) => p.status !== 0).length;
    if (injuredCount > 0) {
      const names = squad.filter((p) => p.status !== 0).slice(0, 2).map((p) => p.name).join(' & ');
      outlookParts.push(`Handlungsbedarf im Kader: ${names} (${injuredCount} angeschlagen/gesperrt).`);
    } else if (squadAlerts.length > 0) {
      outlookParts.push(`${squadAlerts[0].name} zeigt ein Verkaufssignal (${squadAlerts[0].sellReasonLabels[0] || 'Marktwert'}).`);
    } else {
      outlookParts.push('Dein Kader wirkt fit und ohne akute Baustellen.');
    }
    if (squadSpotlight[0]?.nextOpponent?.rank != null) {
      const sp = squadSpotlight[0];
      outlookParts.push(
        `Für Spieltag ${formRadar.upcomingMatchdays?.[0]?.number || matchday + 1} besonders spannend: ${sp.name} (${sp.team}, Platz ${sp.teamRank ?? '–'}) ${sp.nextOpponent.isHome ? 'zu Hause gegen' : 'bei'} ${sp.nextOpponent.name} (Platz ${sp.nextOpponent.rank}).`
      );
    }

    byManagerId[m.id] = {
      managerId: m.id,
      managerName: m.name,
      leagueKey: m.leagueKey,
      leagueName: m.leagueName,
      leagueColor: m.leagueColor,
      matchday: mdByManagerId[m.id],
      transfers: {
        windowDays: TRANSFER_WINDOW_DAYS,
        totalCount: events.length,
        buyCount: buys.length,
        sellCount: sells.length,
        spent,
        received,
        netBalance,
        realizedProfit,
        realizedCount: realized.length,
        avgOverpayPct,
        bestFlip: bestFlip && bestFlip.realizedProfit > 0 ? {
          playerName: bestFlip.playerName,
          profit: bestFlip.realizedProfit,
          heldDays: bestFlip.heldDays,
        } : null,
        events: events.slice(0, 20),
      },
      outlook: {
        availableBudget,
        injuredCount,
        squadAlerts,
        squadSpotlight,
        marketPicks,
        note: outlookParts.join(' '),
      },
    };
  }

  return { managersList, byManagerId };
}

/**
 * Optionaler Gemini-API-Hook: Generiert in EINEM kompakten Batch-Call
 * knackige, persoenliche 1-2-Satz-Takes je Manager (Spieltag + Ausblick) und
 * eine kurze Form-Einordnung auf Basis der echten Bundesliga-Tabelle.
 */
async function maybeEnhanceWithGemini(byManagerId, formRadar, matchday) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.argv.includes('--no-ai')) {
    return { hasAiCommentary: false, formSummary: buildDeterministicFormSummary(formRadar) };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const compactManagers = Object.values(byManagerId).map((m) => ({
    id: m.managerId,
    name: m.managerName,
    league: m.leagueName,
    mdPoints: m.matchday.points,
    mdDiffAvg: m.matchday.diffToAvg,
    mdRank: `${m.matchday.matchdayRank}/${m.matchday.leagueSize}`,
    top: m.matchday.topPlayers.slice(0, 2).map((p) => `${p.name} (${p.points})`),
    flop: m.matchday.flopPlayers.slice(0, 1).map((p) => `${p.name} (${p.points})`),
    deals: `${m.transfers.buyCount}K/${m.transfers.sellCount}V`,
    realized: m.transfers.realizedCount > 0 ? formatEuroSigned(m.transfers.realizedProfit) : null,
    injured: m.outlook.injuredCount,
    alerts: m.outlook.squadAlerts.slice(0, 2).map((a) => `${a.name} (${a.sellReasonLabels[0] || a.statusLabel})`),
    topPick: m.outlook.marketPicks[0] ? `${m.outlook.marketPicks[0].name} (${m.outlook.marketPicks[0].team})` : null,
  }));

  const facts = {
    matchday,
    upcomingMatchdays: formRadar.upcomingMatchdays.map((m) => m.number),
    hotTeams: formRadar.hotTeams.map((t) => ({
      team: t.team,
      rank: t.rank,
      points: t.points,
      form: t.formString,
      formPoints: t.formPoints,
      fixtures: t.fixtures.map((f) => `${f.isHome ? 'H' : 'A'} ${f.opponent} (#${f.opponentRank})`),
    })),
    toughTeams: formRadar.toughTeams.map((t) => ({
      team: t.team,
      rank: t.rank,
      form: t.formString,
      fixtures: t.fixtures.map((f) => `${f.isHome ? 'H' : 'A'} ${f.opponent} (#${f.opponentRank})`),
    })),
    managers: compactManagers,
  };

  const prompt = [
    'Du schreibst sehr kompakte, persönliche deutsche Weekly-Notizen für Kickbase-Manager (Du-Anrede).',
    'Erfinde KEINE Fakten oder Zahlen. Nutze ausschließlich die übergebenen Daten.',
    'Für jeden Manager:',
    '- matchdayNote: 1-2 knackige Sätze NUR zu seinem eigenen Spieltag (Punkte, Top-/Flop-Spieler). Kein allgemeiner Liga-Gesamtbericht!',
    '- outlookNote: 1-2 konkrete Sätze zu seinen Kader-Baustellen / Markt-Chancen für die nächste Woche.',
    'Außerdem formSummary: 2 kurze Sätze, warum die hotTeams anhand ihrer aktuellen Bundesliga-Tabellenposition und 5-Spiele-Form jetzt besonders spannend sind.',
    'Antworte ausschließlich als valides JSON:',
    '{"formSummary":"...","managers":{"<id>":{"matchdayNote":"...","outlookNote":"..."}}}',
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
          temperature: 0.45,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Leere Gemini-Antwort');
    const parsed = JSON.parse(rawText);

    if (parsed.managers && typeof parsed.managers === 'object') {
      for (const [id, notes] of Object.entries(parsed.managers)) {
        if (!byManagerId[id]) continue;
        if (notes?.matchdayNote) byManagerId[id].matchday.note = String(notes.matchdayNote);
        if (notes?.outlookNote) byManagerId[id].outlook.note = String(notes.outlookNote);
      }
    }

    console.log(`Personalisierte Gemini-Notizen erfolgreich generiert (${model}).`);
    return {
      hasAiCommentary: true,
      formSummary: parsed.formSummary ? String(parsed.formSummary) : buildDeterministicFormSummary(formRadar),
    };
  } catch (err) {
    console.warn('Gemini-Aufruf fehlgeschlagen, nutze deterministischen Fallback:', err.message);
    return { hasAiCommentary: false, formSummary: buildDeterministicFormSummary(formRadar) };
  }
}

function buildDeterministicFormSummary(formRadar) {
  const hot = formRadar.hotTeams || [];
  if (hot.length === 0) return 'Aktuelle Form- und Spielplan-Auswertung für die kommenden Spieltage.';
  const top = hot[0];
  const second = hot[1];
  const parts = [];
  if (top.rank != null) {
    parts.push(
      `Auf Basis von Tabelle und 5-Spiele-Form sticht vor allem ${top.team} (Platz ${top.rank}, ${top.formPoints}/15 Pkt zuletzt) mit einem machbaren Programm heraus.`
    );
  }
  if (second?.rank != null) {
    parts.push(
      `Auch ${second.team} (Platz ${second.rank}, Form ${second.formString}) bietet gute Chancen auf stabile Kickbase-Punkte.`
    );
  }
  return parts.join(' ');
}

async function main() {
  const dataJson = readJsonSafe(path.join(PUBLIC_DIR, 'data.json'));
  if (!dataJson) {
    console.error('frontend/public/data.json fehlt - Abbruch.');
    process.exit(1);
  }

  const matchday = dataJson.matchday || 0;
  const startelfJson = readJsonSafe(path.join(HISTORY_DIR, `startelf-md${matchday}.json`));
  const transfersRaw = readJsonSafe(path.join(HISTORY_DIR, 'transfers.json'), []);
  const allPlayersRaw = readJsonSafe(path.join(HISTORY_DIR, 'all_players.json'), []);
  const advisorData = readJsonSafe(path.join(PUBLIC_DIR, 'advisor-data.json'), {});
  const spielplan = readJsonSafe(path.join(PUBLIC_DIR, 'bundesliga-spielplan.json'), {});
  const techAccounts = loadTechnicalAccounts();

  const { map: catalogMap, teamLogos } = buildCatalogMap(allPlayersRaw);

  const dataTs = Date.parse(dataJson.timestamp || '') || Date.now();
  const latestTransferTs = (transfersRaw || []).reduce((max, t) => {
    const ts = Date.parse(t?.date || '');
    return Number.isFinite(ts) && ts > max ? ts : max;
  }, 0);
  const windowEndDate = new Date(Math.max(dataTs, latestTransferTs || dataTs));
  const seasonYear = getBundesligaSeasonYear(spielplan, windowEndDate);

  const blData = await fetchOpenLigaFormAndTable(seasonYear);
  const formRadar = buildFormAndScheduleRadar(spielplan, blData, advisorData?.players || [], catalogMap, matchday);
  const { managersList, byManagerId } = buildPersonalizedManagers(
    dataJson,
    startelfJson,
    transfersRaw,
    advisorData,
    catalogMap,
    formRadar,
    techAccounts,
    windowEndDate,
  );

  const { hasAiCommentary, formSummary } = await maybeEnhanceWithGemini(byManagerId, formRadar, matchday);

  const isoWeek = getIsoWeekNumber(windowEndDate);
  const nextMds = formRadar.upcomingMatchdays.map((m) => m.number);
  const nextRange = nextMds.length > 1 ? `ST ${nextMds[0]}–${nextMds[nextMds.length - 1]}` : `ST ${matchday + 1}`;
  const slug = `weekly-st-${matchday}`;
  const isoDate = windowEndDate.toISOString().slice(0, 10);

  const newEdition = {
    slug,
    category: 'weekly',
    date: isoDate,
    matchday,
    nextMatchday: nextMds[0] || matchday + 1,
    isoWeek,
    kicker: `DEIN WEEKLY · KW ${isoWeek}`,
    title: `Dein Weekly zu Spieltag ${matchday}`,
    subtitle: `Dein persönlicher Spieltags-Rückblick, 7-Tage-Transferbilanz & Form-Ausblick (${nextRange})`,
    author: 'Ligasystem Weekly',
    edition: `KW ${isoWeek} · ST ${matchday}`,
    readTimeMin: 2,
    image: '/feed-images/weekly-cover.svg',
    generatedAt: new Date().toISOString(),
    advisorGeneratedAt: advisorData?.generatedAt || null,
    hasAiCommentary,
    formSummary,
    teamLogos,
    managers: managersList,
    formRadar: {
      hasRealTable: formRadar.hasRealTable,
      upcomingMatchdays: formRadar.upcomingMatchdays,
      hotTeams: formRadar.hotTeams,
      toughTeams: formRadar.toughTeams,
    },
    byManagerId,
  };

  // Bestehende aeltere Ausgaben im Archiv erhalten (gleichen Slug aktualisieren)
  const existing = readJsonSafe(OUTPUT_PATH, null);
  const prevEditions = Array.isArray(existing?.editions)
    ? existing.editions.filter((e) => e && e.slug && e.slug !== slug)
    : [];

  const editions = [newEdition, ...prevEditions]
    .sort((a, b) => (b.matchday || 0) - (a.matchday || 0))
    .slice(0, MAX_STORED_EDITIONS);

  const output = {
    version: 2,
    updatedAt: new Date().toISOString(),
    editions,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output), 'utf8');
  console.log(`Weekly Summary (v2) gespeichert: ${OUTPUT_PATH}`);
  console.log(`  Ausgabe: ${newEdition.title} (${newEdition.slug}), Ausgaben im Archiv: ${editions.length}`);
  console.log(`  OpenLigaDB Tabelle & Form: ${formRadar.hasRealTable ? 'aktiv' : 'Fallback'}`);
  console.log(`  Top Form+Spielplan: ${formRadar.hotTeams.map((t) => `${t.team} (#${t.rank}, ${t.formString})`).join(', ')}`);
  console.log(`  Knackiges Programm: ${formRadar.toughTeams.map((t) => `${t.team} (#${t.rank}, ${t.formString})`).join(', ')}`);
}

main().catch((err) => {
  console.error('Fehler beim Generieren der Weekly Summary:', err);
  process.exit(1);
});
