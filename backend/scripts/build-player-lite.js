/**
 * Generiert zwei stark komprimierte Frontend-Dateien aus dem 40-MB-Katalog
 * `frontend/public/history/all_players.json`:
 *
 * 1) `frontend/public/history/players-lite.json` (~120 KB):
 *    Kompakter Katalog + vorberechneter kalibrierter xP (`xpSeason`, `xpNext`,
 *    `nextOpponent`, `isHome`, `matchupFactor`) fuer Newsfeed Hot Shots,
 *    Live "Mein Kader" und Trading Advisor. Spart ~99,7 % Datenvolumen und
 *    Client-CPU.
 *
 * 2) `frontend/public/history/player-matchdays.json` (~500 KB):
 *    Deduplizierte Team-Tabelle (`teams`) + kompakte Spieltags-Tupel ueber
 *    ALLE verfuegbaren Saisons je Spieler (wird lazy erst auf der
 *    Spieler-Detailseite geladen).
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const HISTORY_DIR = path.resolve(__dirname, '../../frontend/public/history');
const ALL_PLAYERS_PATH = path.join(HISTORY_DIR, 'all_players.json');
const LITE_OUT_PATH = path.join(HISTORY_DIR, 'players-lite.json');
const MATCHDAYS_OUT_PATH = path.join(HISTORY_DIR, 'player-matchdays.json');
const XP_MODEL_PATH = path.resolve(__dirname, '../../frontend/src/playerXpModel.js');

async function main() {
  if (!fs.existsSync(ALL_PLAYERS_PATH)) {
    console.warn('all_players.json nicht gefunden - ueberspringe build-player-lite.');
    return;
  }

  const allPlayers = JSON.parse(fs.readFileSync(ALL_PLAYERS_PATH, 'utf8'));
  if (!Array.isArray(allPlayers) || allPlayers.length === 0) {
    console.warn('all_players.json ist leer - ueberspringe build-player-lite.');
    return;
  }

  const { buildPlayerXpMap } = await import(pathToFileURL(XP_MODEL_PATH).href);
  const { nextMatchday, byId: xpById } = buildPlayerXpMap(allPlayers);

  // Deduplizierte Team-Map (ID -> { n: Name, im: SVG-Pfad }) aus Stamm- und Matchdaten
  const teams = {};
  const registerTeam = (tid, name, im) => {
    if (tid == null || tid === '') return;
    const key = String(tid);
    if (!teams[key]) teams[key] = { n: '', im: '' };
    if (name && !teams[key].n) teams[key].n = name;
    if (im && !teams[key].im) teams[key].im = im;
  };

  for (const p of allPlayers) {
    registerTeam(p?.tid, p?.tn, p?.tim);
    const seasons = Array.isArray(p?.performance?.it) ? p.performance.it : [];
    for (const s of seasons) {
      for (const e of (Array.isArray(s?.ph) ? s.ph : [])) {
        if (e?.t1 && e?.t1im) registerTeam(e.t1, null, e.t1im);
        if (e?.t2 && e?.t2im) registerTeam(e.t2, null, e.t2im);
      }
    }
  }

  const litePlayers = [];
  const matchdaysById = {};

  for (const p of allPlayers) {
    if (p?.i == null) continue;
    const pid = String(p.i);
    const xp = xpById.get(pid) || null;

    // Nur die im Frontend tatsaechlich genutzten Katalog-Felder + vorberechneter xP
    const lite = {
      i: pid,
      fn: p.fn || '',
      n: p.n || p.ln || '',
      ln: p.ln || '',
      tn: p.tn || '',
      tid: p.tid != null ? String(p.tid) : '',
      tim: p.tim || '',
      pim: p.pim || '',
      pos: p.pos ?? null,
      mv: p.mv ?? 0,
      mvt: p.mvt ?? null,
      st: p.st ?? 0,
      prob: p.prob ?? null,
      ap: p.ap ?? null,
      tp: p.tp ?? null,
      sec: p.sec ?? null,
      g: p.g ?? null,
      a: p.a ?? null,
      smc: p.smc ?? null,
      ismc: p.ismc ?? null,
    };

    if (xp) {
      lite.xp = {
        s: xp.xpSeason,
        n: xp.xpNext,
        m: Number((xp.matchupFactor || 1).toFixed(3)),
        h: xp.isHome,
        o: xp.nextOpponent || null,
        md: xp.nextMatchday ?? nextMatchday ?? null,
        ps: Number((xp.pStart ?? 0).toFixed(2)),
      };
    }

    litePlayers.push(lite);

    // Alle Saisons mit gespielten Spieltagen + naechstem Spieltag kompakt als Tupel:
    // [day, points (null if DNP), st, minutes, oppTid, isHome (1/0/null), t1g, t2g, played(1/0)]
    const rawSeasons = Array.isArray(p?.performance?.it) ? p.performance.it : [];
    const compactSeasons = [];
    const ownTid = p.tid != null ? String(p.tid) : '';

    for (let si = 0; si < rawSeasons.length; si += 1) {
      const s = rawSeasons[si];
      const ph = Array.isArray(s?.ph) ? s.ph : [];
      const isLatestSeason = si === rawSeasons.length - 1;
      const rows = [];

      for (const e of ph) {
        if (!e || typeof e.day !== 'number') continue;
        const isPlayed = e.mdst === 2 || typeof e.p === 'number';
        const isNextUpcoming = isLatestSeason && nextMatchday != null && e.day === nextMatchday;
        if (!isPlayed && !isNextUpcoming) continue;

        const t1 = e.t1 != null ? String(e.t1) : '';
        const t2 = e.t2 != null ? String(e.t2) : '';
        const playerTeam = e.pt != null ? String(e.pt) : ownTid;
        let isHome = null;
        let oppTid = '';
        if (playerTeam && t1 && t2) {
          if (playerTeam === t1) {
            isHome = 1;
            oppTid = t2;
          } else if (playerTeam === t2) {
            isHome = 0;
            oppTid = t1;
          }
        }
        const minutes = parseInt(String(e.mp || '0'), 10) || 0;
        const pts = typeof e.p === 'number' && !Number.isNaN(e.p) ? e.p : null;
        rows.push([
          e.day,
          pts,
          e.st ?? null,
          minutes,
          oppTid,
          isHome,
          typeof e.t1g === 'number' ? e.t1g : null,
          typeof e.t2g === 'number' ? e.t2g : null,
          isPlayed ? 1 : 0,
        ]);
      }

      if (rows.length > 0) {
        rows.sort((a, b) => a[0] - b[0]);
        compactSeasons.push({
          ti: s.ti || `Saison ${si + 1}`,
          ph: rows,
        });
      }
    }

    if (compactSeasons.length > 0) {
      matchdaysById[pid] = compactSeasons;
    }
  }

  const litePayload = {
    generatedAt: new Date().toISOString(),
    nextMatchday,
    teams,
    players: litePlayers,
  };

  const matchdaysPayload = {
    generatedAt: new Date().toISOString(),
    nextMatchday,
    teams,
    byId: matchdaysById,
  };

  fs.writeFileSync(LITE_OUT_PATH, JSON.stringify(litePayload));
  fs.writeFileSync(MATCHDAYS_OUT_PATH, JSON.stringify(matchdaysPayload));

  const origMb = (fs.statSync(ALL_PLAYERS_PATH).size / 1024 / 1024).toFixed(2);
  const liteKb = (fs.statSync(LITE_OUT_PATH).size / 1024).toFixed(1);
  const mdKb = (fs.statSync(MATCHDAYS_OUT_PATH).size / 1024).toFixed(1);
  console.log(`Built players-lite.json (${liteKb} KB) & player-matchdays.json (${mdKb} KB) from all_players.json (${origMb} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
