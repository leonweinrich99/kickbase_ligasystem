// Erstellt ein Mapping Kickbase-playerId -> direkter LigaInsider-Profilpfad
// (z.B. "114" -> "/manuel-neuer_114/") in frontend/public/history/ligainsider-links.json.
//
// Funktionsweise:
// 1. Liest die 18 aktuellen Bundesliga-Vereine direkt von https://www.ligainsider.de/bundesliga/tabelle/
//    (passt sich bei Auf-/Abstiegen automatisch an).
// 2. Laedt die 18 oeffentlichen Kader-Seiten (/<verein>/<id>/kader/) und extrahiert
//    alle Spieler-Direktlinks (/<spieler-slug>_<ligainsider-id>/).
// 3. Ordnet alle Spieler aus frontend/public/advisor-data.json (und optional
//    player-catalog-lite.json) ueber Verein + normalisierten Namen zu.
// 4. Best-effort: schlaegt ein Request fehl, bleibt das bisherige Mapping erhalten
//    und der taegliche Workflow laeuft trotzdem gruen durch.
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.ligainsider.de';
const ADVISOR_PATH = path.join(__dirname, '../../frontend/public/advisor-data.json');
const CATALOG_LITE_PATH = path.join(__dirname, '../../frontend/public/history/player-catalog-lite.json');
const OUTPUT_PATH = path.join(__dirname, '../../frontend/public/history/ligainsider-links.json');

const MIN_REFRESH_HOURS = 18;
const FORCE = process.argv.includes('--force') || process.env.FORCE_LIGAINSIDER === 'true';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; KickbaseLigasystemBot/1.0)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'de-DE,de;q=0.9',
};

function stripDiacritics(str) {
  return String(str || '')
    .replace(/ä/g, 'ae').replace(/Ä/g, 'ae')
    .replace(/ö/g, 'oe').replace(/Ö/g, 'oe')
    .replace(/ü/g, 'ue').replace(/Ü/g, 'ue')
    .replace(/ø/g, 'oe').replace(/Ø/g, 'oe')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l').replace(/Ł/g, 'l')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function stripDiacriticsPlain(str) {
  return String(str || '')
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o').replace(/Ø/g, 'o')
    .replace(/æ/g, 'a').replace(/Æ/g, 'a')
    .replace(/ł/g, 'l').replace(/Ł/g, 'l')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function toTokens(str, plain = false) {
  const norm = plain ? stripDiacriticsPlain(str) : stripDiacritics(str);
  return norm.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function toSlug(str, plain = false) {
  return toTokens(str, plain).join('-');
}

function canonicalTeamKey(teamStr) {
  const s = stripDiacritics(teamStr).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!s) return '';
  if (s.includes('bayern')) return 'bayern';
  if (s.includes('dortmund') || s === 'bvb') return 'dortmund';
  if (s.includes('leipzig') || s === 'rbl') return 'leipzig';
  if (s.includes('stuttgart') || s === 'vfb') return 'stuttgart';
  if (s.includes('hoffenheim') || s === 'tsg') return 'hoffenheim';
  if (s.includes('leverkusen') || s === 'b04') return 'leverkusen';
  if (s.includes('freiburg') || s === 'scf') return 'freiburg';
  if (s.includes('frankfurt') || s === 'sge') return 'frankfurt';
  if (s.includes('augsburg') || s === 'fca') return 'augsburg';
  if (s.includes('mainz') || s === 'm05') return 'mainz';
  if (s.includes('union') || s === 'fcu') return 'union';
  if (s.includes('gladbach') || s === 'bmg') return 'gladbach';
  if (s.includes('hamburg') || s === 'hsv') return 'hsv';
  if (s.includes('koeln') || s.includes('koln') || s === 'koe' || s === 'effzeh') return 'koeln';
  if (s.includes('bremen') || s.includes('werder') || s === 'svw') return 'bremen';
  if (s.includes('schalke') || s === 's04') return 'schalke';
  if (s.includes('elversberg') || s === 'sve') return 'elversberg';
  if (s.includes('paderborn') || s === 'scp') return 'paderborn';
  if (s.includes('wolfsburg') || s === 'wob') return 'wolfsburg';
  if (s.includes('heidenheim') || s === 'fch') return 'heidenheim';
  if (s.includes('pauli') || s === 'stp') return 'stpauli';
  if (s.includes('bochum') || s === 'boc') return 'bochum';
  if (s.includes('kiel') || s === 'ksv') return 'kiel';
  if (s.includes('hertha') || s === 'bsc') return 'hertha';
  if (s.includes('darmstadt') || s === 'd98') return 'darmstadt';
  if (s.includes('hannover') || s === 'h96') return 'hannover';
  if (s.includes('duesseldorf') || s.includes('dusseldorf') || s === 'f95') return 'duesseldorf';
  if (s.includes('kaiserslautern') || s === 'fck') return 'kaiserslautern';
  if (s.includes('nuernberg') || s.includes('nurnberg') || s === 'fcn') return 'nuernberg';
  if (s.includes('karlsruhe') || s === 'ksc') return 'karlsruhe';
  if (s.includes('magdeburg') || s === 'fcm') return 'magdeburg';
  return s.replace(/\s+/g, '');
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function loadKickbasePlayers() {
  const byId = new Map();

  if (fs.existsSync(ADVISOR_PATH)) {
    try {
      const advisor = JSON.parse(fs.readFileSync(ADVISOR_PATH, 'utf8'));
      for (const p of advisor.players || []) {
        const id = String(p.playerId || p.id || '').trim();
        if (!id) continue;
        byId.set(id, {
          id,
          firstName: p.firstName || '',
          lastName: p.name || p.lastName || '',
          team: p.team || '',
        });
      }
    } catch (err) {
      console.warn('Warnung beim Lesen von advisor-data.json:', err.message);
    }
  }

  if (fs.existsSync(CATALOG_LITE_PATH)) {
    try {
      const lite = JSON.parse(fs.readFileSync(CATALOG_LITE_PATH, 'utf8'));
      const list = Array.isArray(lite.players) ? lite.players : Object.values(lite.players || {});
      for (const p of list) {
        const id = String(p.playerId || p.id || '').trim();
        if (!id || byId.has(id)) continue;
        byId.set(id, {
          id,
          firstName: p.firstName || '',
          lastName: p.name || p.lastName || '',
          team: p.team || '',
        });
      }
    } catch (err) {
      console.warn('Warnung beim Lesen von player-catalog-lite.json:', err.message);
    }
  }

  return [...byId.values()];
}

function matchPlayer(kbPlayer, liPlayersByTeam, allLiPlayers) {
  const teamKey = canonicalTeamKey(kbPlayer.team);
  const teamCandidates = teamKey && liPlayersByTeam.get(teamKey) ? liPlayersByTeam.get(teamKey) : [];

  const fullName = [kbPlayer.firstName, kbPlayer.lastName].filter(Boolean).join(' ').trim();
  const slugAe = toSlug(fullName, false);
  const slugPlain = toSlug(fullName, true);
  const lastSlugAe = toSlug(kbPlayer.lastName, false);
  const lastSlugPlain = toSlug(kbPlayer.lastName, true);
  const firstTokensAe = toTokens(kbPlayer.firstName, false);
  const firstTokensPlain = toTokens(kbPlayer.firstName, true);
  const lastTokensAe = toTokens(kbPlayer.lastName, false);
  const lastTokensPlain = toTokens(kbPlayer.lastName, true);
  const fullTokensAe = [...firstTokensAe, ...lastTokensAe];
  const fullTokensPlain = [...firstTokensPlain, ...lastTokensPlain];

  const tryMatchIn = (pool, allowLastNameOnly) => {
    if (!pool.length) return null;

    // 1. Exakter Slug-Match (vorname-nachname)
    for (const c of pool) {
      if (c.slug === slugAe || c.slug === slugPlain) return c;
      if (!kbPlayer.firstName && (c.slug === lastSlugAe || c.slug === lastSlugPlain)) return c;
    }

    // 2. Exakter Token-Satz (unabhaengig von Reihenfolge, z.B. "Minjae Kim" <-> "Kim Min-Jae")
    const sortedAe = [...fullTokensAe].sort().join('|');
    const sortedPlain = [...fullTokensPlain].sort().join('|');
    for (const c of pool) {
      if (c.sortedTokens === sortedAe || c.sortedTokens === sortedPlain) return c;
    }

    // 3. Alle Kickbase-Tokens im LigaInsider-Slug enthalten (oder umgekehrt, bei Doppel-/Mittelnamen)
    if (fullTokensAe.length >= 2) {
      const subsetMatches = pool.filter((c) => {
        const cSet = c.tokenSet;
        const allKbInLi =
          fullTokensAe.every((t) => cSet.has(t)) ||
          fullTokensPlain.every((t) => cSet.has(t));
        const allLiInKb =
          c.tokens.length >= 2 &&
          (c.tokens.every((t) => fullTokensAe.includes(t)) ||
            c.tokens.every((t) => fullTokensPlain.includes(t)));
        return allKbInLi || allLiInKb;
      });
      if (subsetMatches.length === 1) return subsetMatches[0];
    }

    // 4. Nachname (oder letztes Token) + Vorname-Anfangsbuchstabe stimmt ueberein
    if (lastTokensAe.length > 0 && firstTokensAe.length > 0) {
      const firstInit = firstTokensAe[0][0];
      const firstInitPlain = firstTokensPlain[0]?.[0];
      const lastMatches = pool.filter((c) => {
        const hasLast =
          lastTokensAe.every((t) => c.tokenSet.has(t)) ||
          lastTokensPlain.every((t) => c.tokenSet.has(t)) ||
          c.slug.endsWith(`-${lastSlugAe}`) ||
          c.slug.endsWith(`-${lastSlugPlain}`);
        if (!hasLast) return false;
        const cFirst = c.tokens[0]?.[0];
        return cFirst === firstInit || cFirst === firstInitPlain;
      });
      if (lastMatches.length === 1) return lastMatches[0];
    }

    // 5. Nur innerhalb desselben Vereins: eindeutiger Nachname / Kuenstlername
    if (allowLastNameOnly && lastTokensAe.length > 0) {
      const byLast = pool.filter((c) => {
        if (c.slug === lastSlugAe || c.slug === lastSlugPlain) return true;
        if (lastTokensAe.every((t) => c.tokenSet.has(t)) || lastTokensPlain.every((t) => c.tokenSet.has(t))) {
          return true;
        }
        // Kompakt ohne Bindestrich (z.B. "min-jae" vs "minjae")
        const compactLi = c.slug.replace(/-/g, '');
        const compactLastAe = lastSlugAe.replace(/-/g, '');
        const compactLastPlain = lastSlugPlain.replace(/-/g, '');
        return (
          (compactLastAe.length >= 4 && compactLi.includes(compactLastAe)) ||
          (compactLastPlain.length >= 4 && compactLi.includes(compactLastPlain))
        );
      });
      if (byLast.length === 1) return byLast[0];
    }

    // 6. Nur innerhalb desselben Vereins: eindeutiger Vorname + gleicher Nachname-Anfang
    //    (faengt Transliterations-Varianten wie "Yukhym Konoplia" <-> "Yukhym Konoplya")
    if (allowLastNameOnly && firstTokensAe.length > 0 && lastTokensAe.length > 0) {
      const firstToken = firstTokensAe[0];
      const lastPrefix = lastTokensAe[0].slice(0, 4);
      if (firstToken.length >= 4 && lastPrefix.length >= 3) {
        const byFirst = pool.filter(
          (c) => c.tokenSet.has(firstToken) && c.tokens.some((t) => t.startsWith(lastPrefix)),
        );
        if (byFirst.length === 1) return byFirst[0];
      }
    }

    return null;
  };

  // Zuerst im eigenen Verein suchen (hoechste Praezision)
  const teamHit = tryMatchIn(teamCandidates, true);
  if (teamHit) return teamHit;

  // Fallback global (z.B. kurz nach einem Transfer innerhalb der Bundesliga)
  return tryMatchIn(allLiPlayers, false);
}

async function run() {
  let existingData = null;
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      existingData = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    } catch {
      existingData = null;
    }
  }

  if (!FORCE && existingData?.updatedAt) {
    const ageHours = (Date.now() - new Date(existingData.updatedAt).getTime()) / 3600000;
    if (ageHours >= 0 && ageHours < MIN_REFRESH_HOURS && Object.keys(existingData.links || {}).length > 300) {
      console.log(`ligainsider-links.json ist erst ${ageHours.toFixed(1)}h alt (< ${MIN_REFRESH_HOURS}h) - ueberspringe Abruf.`);
      return;
    }
  }

  console.log('Lade Bundesliga-Vereine von LigaInsider...');
  const tableHtml = await fetchHtml(`${BASE_URL}/bundesliga/tabelle/`);
  const teamPathMatches = [...tableHtml.matchAll(/href="(\/[a-z0-9-]+\/\d+\/)"/gi)];
  const teamPaths = [...new Set(teamPathMatches.map((m) => m[1]))];

  if (teamPaths.length < 15) {
    console.warn(`Zu wenige Vereine gefunden (${teamPaths.length}) - behalte bestehende ligainsider-links.json.`);
    return;
  }

  console.log(`${teamPaths.length} Bundesliga-Vereine gefunden. Lade Kaderseiten...`);

  const liPlayersByTeam = new Map();
  const allLiPlayers = [];
  const seenLiPaths = new Set();

  // Hoefliche Concurrency = 3
  for (let i = 0; i < teamPaths.length; i += 3) {
    const batch = teamPaths.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async (teamPath) => {
        try {
          const html = await fetchHtml(`${BASE_URL}${teamPath}kader/`);
          return { teamPath, html };
        } catch (err) {
          console.warn(`Fehler bei ${teamPath}kader/:`, err.message);
          return { teamPath, html: '' };
        }
      }),
    );

    for (const { teamPath, html } of results) {
      if (!html) continue;
      const teamSlug = teamPath.split('/').filter(Boolean)[0] || '';
      const teamKey = canonicalTeamKey(teamSlug);
      if (!liPlayersByTeam.has(teamKey)) liPlayersByTeam.set(teamKey, []);

      const playerMatches = [...html.matchAll(/href="(\/([a-z0-9-]+)_(\d+)\/)"/gi)];
      const teamSeen = new Set();
      for (const m of playerMatches) {
        const relPath = m[1];
        const slug = m[2].toLowerCase();
        if (teamSeen.has(relPath)) continue;
        teamSeen.add(relPath);

        const tokens = slug.split('-').filter(Boolean);
        const entry = {
          path: relPath,
          slug,
          teamKey,
          tokens,
          tokenSet: new Set(tokens),
          sortedTokens: [...tokens].sort().join('|'),
        };
        liPlayersByTeam.get(teamKey).push(entry);
        if (!seenLiPaths.has(relPath)) {
          seenLiPaths.add(relPath);
          allLiPlayers.push(entry);
        }
      }
    }
  }

  console.log(`${allLiPlayers.length} eindeutige Spieler-Links auf LigaInsider gesammelt.`);

  const kbPlayers = loadKickbasePlayers();
  if (kbPlayers.length === 0) {
    console.warn('Keine Kickbase-Spieler gefunden - breche ab ohne zu ueberschreiben.');
    return;
  }

  // Bestehende Links als Sicherheitsnetz behalten, neue Matches ueberschreiben sie
  const links = { ...(existingData?.links || {}) };
  let matched = 0;
  const unmatched = [];

  for (const p of kbPlayers) {
    const hit = matchPlayer(p, liPlayersByTeam, allLiPlayers);
    if (hit) {
      links[p.id] = hit.path;
      matched += 1;
    } else {
      unmatched.push(`${p.firstName} ${p.lastName} (${p.team}, #${p.id})`);
    }
  }

  console.log(`LigaInsider-Match: ${matched}/${kbPlayers.length} Spieler (${((matched / kbPlayers.length) * 100).toFixed(1)}%).`);
  if (unmatched.length > 0) {
    console.log(`Nicht gematcht (${unmatched.length}):`, unmatched.slice(0, 15).join(', '));
  }

  if (!fs.existsSync(path.dirname(OUTPUT_PATH))) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  }

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        matchedCount: matched,
        totalPlayers: kbPlayers.length,
        links,
      },
      null,
      2,
    ),
  );
  console.log(`ligainsider-links.json geschrieben (${OUTPUT_PATH}).`);
}

run().catch((err) => {
  console.error('Fehler beim Erstellen von ligainsider-links.json:', err.message);
  // Best-effort: Workflow soll bei externer Stoerung trotzdem gruen bleiben.
});
