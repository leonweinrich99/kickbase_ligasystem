// Hilfsfunktionen fuer den Trading Advisor:
// 1) Anreicherung fehlender/unvollstaendiger Spielerdaten aus all_players.json
//    (z.B. Spieler, fuer die im letzten Advisor-Lauf keine ML-Zeile vorlag).
// 2) Kader- und Startelf-Bewertung: vergleicht einen Markt-/Datenbank-Spieler
//    anhand seiner tatsaechlichen Spielpunkte (avgPoints) direkt mit dem
//    eigenen Kader & der eigenen Startelf und ordnet ihn eindeutig ein:
//    - "Startelf-Upgrade": punktet spuerbar staerker als der schwaechste
//      Stammspieler auf seiner Position (oder fuellt eine offene Pflichtposition)
//    - "Kader-Ergaenzung": punktet stark genug als Rotation/Tiefe im Kader
//    - "Nur Trading": punktetechnisch kein Upgrade fuer die eigene Elf, aber
//      durch steigenden Marktwert fuers Trading interessant

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

const MIN_POSITION_SLOTS = { TW: 1, ABW: 3, MF: 3, ST: 2 };
const MAX_POSITION_SLOTS = { TW: 1, ABW: 5, MF: 5, ST: 3 };
const BUY_MIN_PREDICTED_CHANGE = 5000;

const IMAGE_BASE = 'https://kickbase.b-cdn.net/';

const statusLabelFromCode = (code) => {
  if (code == null) return null;
  return STATUS_LABELS[code] || (code ? `Status ${code}` : 'Fit');
};

export const getEffectiveAvgPoints = (player) => {
  if (!player) return 0;
  if (typeof player.avgPoints === 'number' && !Number.isNaN(player.avgPoints)) return player.avgPoints;
  if (typeof player.ap === 'number' && !Number.isNaN(player.ap)) return player.ap;
  if (typeof player.seasonPoints === 'number' && typeof player.appearances === 'number' && player.appearances > 0) {
    return Math.round((player.seasonPoints / player.appearances) * 10) / 10;
  }
  if (typeof player.lastPoints === 'number' && !Number.isNaN(player.lastPoints)) return player.lastPoints;
  return 0;
};

const formatPlayerShort = (p) => {
  if (!p) return 'deinem Stammspieler';
  return p.name || p.firstName || 'deinem Stammspieler';
};

// Fuellt fehlende Stammdaten (Name, Team, Position, Marktwert, Schnittpunkte,
// Foto) aus all_players.json auf, falls ein Eintrag im Advisor-Export lueckenhaft
// war (z.B. Youri Regeer mit name=null / marketValue=0).
export const enrichPlayerWithCatalog = (entry, catalogMap) => {
  if (!entry || !catalogMap || catalogMap.size === 0) return entry;
  const raw = catalogMap.get(String(entry.playerId));
  if (!raw) return entry;

  const posLabel = POS_CODE_TO_LABEL[raw.pos] || raw.pos || null;
  const rawImgUrl = raw.pim ? `${IMAGE_BASE}${raw.pim}` : null;

  return {
    ...entry,
    firstName: entry.firstName || raw.fn || null,
    name: entry.name || raw.ln || raw.fn || null,
    position: entry.position || posLabel,
    team: entry.team || raw.tn || null,
    marketValue: entry.marketValue > 0 ? entry.marketValue : (raw.mv || 0),
    avgPoints: typeof entry.avgPoints === 'number' ? entry.avgPoints : (typeof raw.ap === 'number' ? raw.ap : undefined),
    seasonPoints: typeof entry.seasonPoints === 'number' && entry.seasonPoints !== 0
      ? entry.seasonPoints
      : (typeof raw.tp === 'number' ? raw.tp : entry.seasonPoints),
    status: entry.status ?? raw.st ?? 0,
    statusLabel: entry.statusLabel || statusLabelFromCode(raw.st),
    imagePath: entry.imagePath || raw.pim || null,
    imageUrl: entry.imageUrl || rawImgUrl,
  };
};

// Ergaenzt die Advisor-Spielerdatenbank um alle Bundesliga-Spieler aus
// all_players.json, die im letzten Advisor-Lauf fehlten, damit die Suche und
// Favoriten immer vollstaendig sind.
export const buildCompletePlayerCatalog = (advisorPlayers, allPlayersRaw, catalogMap) => {
  const enrichedExisting = (advisorPlayers || []).map((p) => enrichPlayerWithCatalog(p, catalogMap));
  if (!Array.isArray(allPlayersRaw) || allPlayersRaw.length === 0) return enrichedExisting;

  const existingIds = new Set(enrichedExisting.map((p) => String(p.playerId)));
  const missingEntries = [];

  for (const raw of allPlayersRaw) {
    const pid = String(raw.i);
    if (!raw.i || existingIds.has(pid)) continue;
    const posLabel = POS_CODE_TO_LABEL[raw.pos] || null;
    const avgPts = typeof raw.ap === 'number' ? raw.ap : undefined;
    missingEntries.push({
      playerId: pid,
      firstName: raw.fn || null,
      name: raw.ln || raw.fn || `Spieler ${pid}`,
      position: posLabel,
      team: raw.tn || null,
      marketValue: raw.mv || 0,
      changeYesterday: null,
      changeLast3Days: null,
      trendLast7DaysPercent: null,
      lastPoints: null,
      avgPoints: avgPts,
      seasonPoints: typeof raw.tp === 'number' ? raw.tp : null,
      predictedChange: 0,
      predictedChange3d: undefined,
      predictedChange7d: undefined,
      status: raw.st ?? 0,
      statusLabel: statusLabelFromCode(raw.st),
      imagePath: raw.pim || null,
      imageUrl: raw.pim ? `${IMAGE_BASE}${raw.pim}` : null,
      history: [],
      tradeRecommended: false,
      playRecommended: false,
      buyRecommended: false,
      buyReasons: [],
      sellRecommended: false,
      sellReasons: [],
      fromCatalogFallback: true,
    });
  }

  return [...enrichedExisting, ...missingEntries];
};

// Rekonstruiert aus dem eigenen Kader die aktuell punktstaerkste gueltige
// Startelf (1 TW, min. 3 ABW, min. 3 MF, min. 2 ST + 2 beste Feldspieler)
// sowie Vergleichswerte je Position.
export const analyzeOwnSquad = (ownSquad) => {
  if (!Array.isArray(ownSquad) || ownSquad.length === 0) return null;

  const byPos = { TW: [], ABW: [], MF: [], ST: [] };
  const squadIds = new Set();

  for (const p of ownSquad) {
    if (!p) continue;
    squadIds.add(String(p.playerId));
    if (byPos[p.position]) {
      byPos[p.position].push({ ...p, _avg: getEffectiveAvgPoints(p) });
    }
  }

  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => b._avg - a._avg);
  }

  const startersByPos = { TW: [], ABW: [], MF: [], ST: [] };
  const usedIds = new Set();

  for (const pos of ['TW', 'ABW', 'MF', 'ST']) {
    const minNeed = MIN_POSITION_SLOTS[pos];
    for (const p of byPos[pos].slice(0, minNeed)) {
      startersByPos[pos].push(p);
      usedIds.add(String(p.playerId));
    }
  }

  const remainingField = [...byPos.ABW, ...byPos.MF, ...byPos.ST]
    .filter((p) => !usedIds.has(String(p.playerId)))
    .sort((a, b) => b._avg - a._avg);

  let starterCount = Object.values(startersByPos).reduce((sum, list) => sum + list.length, 0);
  for (const p of remainingField) {
    if (starterCount >= 11) break;
    if (startersByPos[p.position].length < MAX_POSITION_SLOTS[p.position]) {
      startersByPos[p.position].push(p);
      usedIds.add(String(p.playerId));
      starterCount += 1;
    }
  }

  const posStats = {};
  for (const pos of ['TW', 'ABW', 'MF', 'ST']) {
    const all = byPos[pos];
    const starters = startersByPos[pos];
    const weakestStarter = starters.length ? starters[starters.length - 1] : null;
    const weakestOverall = all.length ? all[all.length - 1] : null;
    const avgAll = all.length ? all.reduce((s, p) => s + p._avg, 0) / all.length : 0;
    const avgStarters = starters.length ? starters.reduce((s, p) => s + p._avg, 0) / starters.length : 0;
    posStats[pos] = {
      count: all.length,
      starterCount: starters.length,
      missingMandatory: all.length < MIN_POSITION_SLOTS[pos],
      weakestStarter,
      weakestStarterAvg: weakestStarter ? weakestStarter._avg : 0,
      weakestOverall,
      weakestOverallAvg: weakestOverall ? weakestOverall._avg : 0,
      avgAll: Math.round(avgAll),
      avgStarters: Math.round(avgStarters),
    };
  }

  // Nur Feld-Stammspieler auf einer ueberbesetzten Position (> Pflichtminimum)
  // koennen per Formationswechsel durch eine andere Feldposition verdraengt werden.
  const replaceableFieldStarters = [...startersByPos.ABW, ...startersByPos.MF, ...startersByPos.ST]
    .filter((p) => posStats[p.position].starterCount > MIN_POSITION_SLOTS[p.position])
    .sort((a, b) => a._avg - b._avg);
  const weakestFieldStarter = replaceableFieldStarters[0] || null;

  return { squadIds, posStats, weakestFieldStarter };
};

// Bewertet einen Spieler im Vergleich zum eigenen Kader:
// Liefert klares Label ("Startelf-Upgrade", "Kader-Ergaenzung", "Nur Trading"
// oder null) plus Begruendungstext fuer die KI-Analyse.
export const evaluatePlayerForSquad = (entry, squadAnalysis) => {
  const isFit = (entry.status == null || entry.status === 0) && !entry.isInjured;
  const predicted = entry.predictedChange || 0;
  const hasRisingValue = predicted >= BUY_MIN_PREDICTED_CHANGE;

  // Fallback ohne verknuepften eigenen Kader: bisherige Bewertung beibehalten.
  if (!squadAnalysis) {
    if (entry.playRecommended) {
      return {
        tier: 'kader',
        badgeLabel: '✓ Kader-Potenzial',
        reasonText: null,
        isBuyRecommended: true,
        isPlayFit: true,
        isTradeOnly: false,
      };
    }
    if (entry.tradeRecommended || hasRisingValue) {
      return {
        tier: 'trading',
        badgeLabel: '📈 Nur Trading',
        reasonText: null,
        isBuyRecommended: true,
        isPlayFit: false,
        isTradeOnly: true,
      };
    }
    return {
      tier: null,
      badgeLabel: null,
      reasonText: null,
      isBuyRecommended: false,
      isPlayFit: false,
      isTradeOnly: false,
    };
  }

  // Spieler gehoert bereits zum eigenen Kader -> keine Kaufempfehlung.
  if (squadAnalysis.squadIds.has(String(entry.playerId))) {
    return {
      tier: null,
      badgeLabel: null,
      reasonText: null,
      isBuyRecommended: false,
      isPlayFit: false,
      isTradeOnly: false,
    };
  }

  const pos = entry.position;
  const posInfo = pos ? squadAnalysis.posStats[pos] : null;
  const avg = getEffectiveAvgPoints(entry);
  const avgRounded = Math.round(avg);
  const hasPointsEvidence = avg > 0;

  if (isFit && posInfo && hasPointsEvidence) {
    // 1. Offene Pflichtposition im eigenen Kader
    if (posInfo.missingMandatory && avg >= 40) {
      return {
        tier: 'startelf',
        badgeLabel: '★ Startelf-Upgrade',
        reasonText: `Direkte Verstärkung für deine Startelf: Auf deiner ${pos}-Position fehlt noch ein Stammplatz und er liefert Ø ${avgRounded} Pkt. pro Spiel.`,
        isBuyRecommended: true,
        isPlayFit: true,
        isTradeOnly: false,
      };
    }

    // 2. Direktes Startelf-Upgrade gegenueber dem schwaechsten Stammspieler auf dieser Position
    const starterThreshold = posInfo.weakestStarterAvg;
    if (avg >= 60 && avg >= starterThreshold + 8) {
      const refName = formatPlayerShort(posInfo.weakestStarter);
      return {
        tier: 'startelf',
        badgeLabel: '★ Startelf-Upgrade',
        reasonText: `Starkes Startelf-Upgrade für deine ${pos}-Position: Mit Ø ${avgRounded} Pkt. liegt er klar über deinem schwächsten ${pos}-Stammspieler (${refName}, Ø ${Math.round(starterThreshold)} Pkt.).`,
        isBuyRecommended: true,
        isPlayFit: true,
        isTradeOnly: false,
      };
    }

    // 3. Flex-Upgrade in die 11 (fuer Feldspieler, falls noch Spielraum in der Formation)
    const flexWeakest = squadAnalysis.weakestFieldStarter;
    if (
      pos !== 'TW' &&
      flexWeakest &&
      posInfo.starterCount < MAX_POSITION_SLOTS[pos] &&
      avg >= 70 &&
      avg >= flexWeakest._avg + 10
    ) {
      return {
        tier: 'startelf',
        badgeLabel: '★ Startelf-Upgrade',
        reasonText: `Mit Ø ${avgRounded} Pkt. punktet er deutlich stärker als dein schwächster Feld-Stammspieler (${formatPlayerShort(flexWeakest)}, Ø ${Math.round(flexWeakest._avg)} Pkt.) und wäre direkt ein Kandidat für deine erste Elf.`,
        isBuyRecommended: true,
        isPlayFit: true,
        isTradeOnly: false,
      };
    }

    // 4. Sinnvolle Kader-Ergaenzung / Rotation (nahe an der Startelf auf dieser Position)
    const closeToStarter = avg >= 60 && avg >= starterThreshold - 15;
    if (closeToStarter) {
      return {
        tier: 'kader',
        badgeLabel: '✓ Kader-Ergänzung',
        reasonText: `Solide Kader-Ergänzung für deine ${pos}-Position: Mit Ø ${avgRounded} Pkt. liegt er nah an deinem schwächsten ${pos}-Stammspieler (${formatPlayerShort(posInfo.weakestStarter)}, Ø ${Math.round(starterThreshold)} Pkt.).`,
        isBuyRecommended: true,
        isPlayFit: true,
        isTradeOnly: false,
      };
    }
  }

  // 5. Punktetechnisch (oder wegen Fitness) kein Startelf-Upgrade, aber finanziell interessant -> Nur Trading
  if (hasRisingValue) {
    if (!isFit) {
      return {
        tier: 'trading',
        badgeLabel: '📈 Nur Trading',
        reasonText: `Aktuell nicht einsatzbereit (${entry.statusLabel || 'angeschlagen/verletzt'}), aber durch den erwarteten Marktwertanstieg fürs Trading interessant.`,
        isBuyRecommended: true,
        isPlayFit: false,
        isTradeOnly: true,
      };
    }
    const compareHint = posInfo && posInfo.weakestStarter
      ? ` (Ø ${avgRounded} Pkt. vs. Ø ${Math.round(posInfo.weakestStarterAvg)} Pkt. bei ${formatPlayerShort(posInfo.weakestStarter)} auf ${pos})`
      : '';
    return {
      tier: 'trading',
      badgeLabel: '📈 Nur Trading',
      reasonText: `Für deine Startelf punktetechnisch kein Upgrade${compareHint} – aber durch den erwarteten Marktwertanstieg interessant fürs Trading.`,
      isBuyRecommended: true,
      isPlayFit: false,
      isTradeOnly: true,
    };
  }

  return {
    tier: null,
    badgeLabel: null,
    reasonText: posInfo && hasPointsEvidence && isFit
      ? `Punktetechnisch aktuell keine Verstärkung für deine ${pos}-Position (Ø ${avgRounded} Pkt. vs. Ø ${posInfo.avgStarters} Pkt. in deiner Startelf).`
      : null,
    isBuyRecommended: false,
    isPlayFit: false,
    isTradeOnly: false,
  };
};
