// Hilfsfunktionen fuer den Trading Advisor:
// 1) Anreicherung fehlender/unvollstaendiger Spielerdaten aus all_players.json
//    inkl. neuem Spieler-xP (xpSeason & xpNext aus playerXpModel.js).
// 2) Saubere Bilanz-Budget-Schaetzung auf Basis von Startkapital + Gesamtgewinn
//    + Punktepraemien - aktuellem Teamwert (inkl. Trennung zwischen Spieltags-
//    Ziel >= 0 EUR und 33%-Dispo-Spielraum unter der Woche).
// 3) xP-basierte Kader-, Startelf- & Kauf-/Verkaufsempfehlungen.

import { normalizeStartProbCode } from './startProbMeta.js';

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
const START_CAPITAL_EUR = 150_000_000; // 150M Startbudget der Liga
const DISPO_RATIO = 0.33;              // Kickbase erlaubt ~33% Minus unter der Woche

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

// Primaere Qualitaets-Metrik im Advisor: neuer Spieler-xP (matchup-neutral fuer
// faire langfristige Kader-Entscheidungen), mit defensivem Fallback auf avgPoints.
export const getEffectiveXp = (player) => {
  if (!player) return 0;
  if (typeof player.xpSeason === 'number' && !Number.isNaN(player.xpSeason)) return player.xpSeason;
  const isUnavailable = (typeof player.status === 'number' && player.status !== 0) || Boolean(player.isInjured);
  if (isUnavailable) return 0;
  const probCode = normalizeStartProbCode(player.startElfProbability ?? player.prob);
  const probMult = probCode === 1 ? 1.0 : probCode === 2 ? 0.85 : probCode === 3 ? 0.5 : probCode === 4 ? 0.2 : probCode === 5 ? 0.05 : 0.7;
  return Math.round(getEffectiveAvgPoints(player) * probMult);
};

const formatPlayerShort = (p) => {
  if (!p) return 'deinem Stammspieler';
  return p.name || p.firstName || 'deinem Stammspieler';
};

// Berechnet saubere, konsistente Manager-Budgets per Bilanzgleichung:
//   Gesamtvermoegen = Startkapital (200M) + Login/Erfolgsboni + Gesamtgewinn + Punkte*1000
//   Spieltags-Budget (Ziel >= 0) = Gesamtvermoegen - aktueller Teamwert
//   Max. erlaubtes Minus unter der Woche (33%-Dispo) = 0,33 * Gesamtvermoegen
//   Gebots-Spielraum unter der Woche = Spieltags-Budget + Max. Minus
export const computeCleanLeagueBudgets = (league, ratingsMap) => {
  if (!league) return { budgetsList: [], budgetsById: {} };

  const ratingsByName = new Map();
  const ratingsById = new Map();
  if (ratingsMap && typeof ratingsMap === 'object') {
    Object.entries(ratingsMap).forEach(([uid, r]) => {
      if (!r || !r.league) return;
      ratingsById.set(String(uid), r);
      if (r.name) ratingsByName.set(r.name.toLowerCase(), { uid: String(uid), r });
    });
  }

  const managerIdByName = new Map();
  (league.managers || []).forEach((m) => {
    if (m?.name && m?.id != null) managerIdByName.set(m.name.toLowerCase(), String(m.id));
  });

  const rawBudgets = Array.isArray(league.budgets) ? league.budgets : [];
  const budgetsById = {};
  const budgetsList = rawBudgets.map((b) => {
    const nameKey = (b.manager || '').toLowerCase();
    const mid = managerIdByName.get(nameKey) || ratingsByName.get(nameKey)?.uid || null;
    const rating = (mid && ratingsById.get(mid)) || ratingsByName.get(nameKey)?.r || null;
    const tv = typeof b.teamValue === 'number' ? b.teamValue : 0;

    // Nur fuer echte Manager in manager-ratings.json ueber die Bilanzgleichung verfeinern;
    // fehlende/ausgeschiedene Manager behalten defensiv den Advisor-Rohwert.
    if (!rating) {
      const fallbackWealth = Math.max(0, tv + (b.budget || 0));
      const dispoBuffer = typeof b.dispoBuffer === 'number' ? b.dispoBuffer : Math.round(fallbackWealth * DISPO_RATIO);
      const entry = {
        ...b,
        managerId: mid,
        wealth: fallbackWealth,
        totalProfit: null,
        dispoBuffer,
        midweekBuyingPower: (b.budget || 0) + dispoBuffer,
        budgetBasis: 'activityFeed',
      };
      if (mid) budgetsById[mid] = entry;
      return entry;
    }

    const totalProfit = typeof rating.totalProfit === 'number' ? rating.totalProfit : 0;
    const points = rating.calculation?.pkt?.points || 0;
    const pointsBonus = points * 1000;
    // Geschaetzte Login- & Erfolgsboni (kalibriert an echten Kontostaenden, 3,5M..12,5M)
    const loginAndAchievementBonus = 3_500_000 + Math.min(9_000_000, Math.round(points * 800));
    const wealth = Math.max(0, START_CAPITAL_EUR + loginAndAchievementBonus + totalProfit + pointsBonus);
    const estBudget = Math.round(wealth - tv);
    // Kickbase Dispo-Limit unter der Woche (~33% vom Kaderwert / Finanzkraft)
    const dispoBuffer = Math.round(Math.max(tv, wealth) * DISPO_RATIO);
    const midweekBuyingPower = estBudget + dispoBuffer;

    const entry = {
      ...b,
      managerId: mid,
      teamValue: tv,
      budget: estBudget,
      rawActivityBudget: b.budget,
      wealth: Math.round(wealth),
      totalProfit: Math.round(totalProfit),
      pointsBonus,
      dispoBuffer,
      midweekBuyingPower,
      budgetBasis: 'balanceSheet',
    };
    if (mid) budgetsById[mid] = entry;
    return entry;
  });

  // Nach Spieltags-Budget absteigend sortieren
  budgetsList.sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0));

  // Auch eventuelle managerBudgets-Eintraege abdecken, die nicht in league.budgets standen
  Object.entries(league.managerBudgets || {}).forEach(([mid, mb]) => {
    if (!budgetsById[mid]) {
      const tv = mb.teamValue || 0;
      const wealth = Math.max(0, tv + (mb.budget || 0));
      const dispoBuffer = mb.dispoBuffer ?? Math.round(wealth * DISPO_RATIO);
      budgetsById[mid] = {
        ...mb,
        managerId: mid,
        wealth,
        dispoBuffer,
        midweekBuyingPower: (mb.budget || 0) + dispoBuffer,
        budgetBasis: 'activityFeed',
      };
    }
  });

  return { budgetsList, budgetsById };
};

// Fuellt fehlende Stammdaten aus all_players.json auf UND haengt Spieler-xP an.
export const enrichPlayerWithCatalog = (entry, catalogMap, xpMap) => {
  if (!entry) return entry;
  const pid = String(entry.playerId);
  const raw = catalogMap && catalogMap.size > 0 ? catalogMap.get(pid) : null;
  const xpInfo = xpMap && xpMap.size > 0 ? xpMap.get(pid) : null;

  const posLabel = raw ? (POS_CODE_TO_LABEL[raw.pos] || raw.pos || null) : null;
  const rawImgUrl = raw?.pim ? `${IMAGE_BASE}${raw.pim}` : null;

  const base = raw ? {
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
    prob: typeof raw.prob === 'number' ? raw.prob : (entry.prob ?? null),
    startElfProbability: entry.startElfProbability ?? (typeof raw.prob === 'number' ? raw.prob : null),
    imagePath: entry.imagePath || raw.pim || null,
    imageUrl: entry.imageUrl || rawImgUrl,
  } : { ...entry };

  if (xpInfo) {
    // Falls extern als verletzt gemeldet (API-Football), auf 0 fuer kommenden ST drosseln
    const extInjured = Boolean(base.isInjured);
    return {
      ...base,
      xpSeason: extInjured ? 0 : xpInfo.xpSeason,
      xpNext: extInjured ? 0 : xpInfo.xpNext,
      xpAvgStartPts: xpInfo.avgStartPts,
      xpStartProb: extInjured ? 0 : xpInfo.pStart,
      xpMatchupFactor: xpInfo.matchupFactor,
      nextOpponent: xpInfo.nextOpponent,
      isHome: xpInfo.isHome,
      nextMatchday: xpInfo.nextMatchday,
    };
  }

  return base;
};

// Ergaenzt die Advisor-Spielerdatenbank um alle Bundesliga-Spieler aus
// all_players.json, die im letzten Advisor-Lauf fehlten.
export const buildCompletePlayerCatalog = (advisorPlayers, allPlayersRaw, catalogMap, xpMap) => {
  const enrichedExisting = (advisorPlayers || []).map((p) => enrichPlayerWithCatalog(p, catalogMap, xpMap));
  if (!Array.isArray(allPlayersRaw) || allPlayersRaw.length === 0) return enrichedExisting;

  const existingIds = new Set(enrichedExisting.map((p) => String(p.playerId)));
  const missingEntries = [];

  for (const raw of allPlayersRaw) {
    const pid = String(raw.i);
    if (!raw.i || existingIds.has(pid)) continue;
    const posLabel = POS_CODE_TO_LABEL[raw.pos] || null;
    const avgPts = typeof raw.ap === 'number' ? raw.ap : undefined;
    const baseEntry = {
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
      prob: typeof raw.prob === 'number' ? raw.prob : null,
      startElfProbability: typeof raw.prob === 'number' ? raw.prob : null,
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
    };
    missingEntries.push(enrichPlayerWithCatalog(baseEntry, catalogMap, xpMap));
  }

  return [...enrichedExisting, ...missingEntries];
};

// Rekonstruiert aus dem eigenen Kader die aktuell xP-staerkste gueltige
// Startelf (1 TW, min. 3 ABW, min. 3 MF, min. 2 ST + 2 beste Feldspieler).
// Verletzte oder Bankdruecker mit 0 xP blockieren dadurch keine Stammplaetze mehr!
export const analyzeOwnSquad = (ownSquad) => {
  if (!Array.isArray(ownSquad) || ownSquad.length === 0) return null;

  const byPos = { TW: [], ABW: [], MF: [], ST: [] };
  const squadIds = new Set();

  for (const p of ownSquad) {
    if (!p) continue;
    squadIds.add(String(p.playerId));
    if (byPos[p.position]) {
      const xp = getEffectiveXp(p);
      const nextXp = typeof p.xpNext === 'number' ? p.xpNext : xp;
      byPos[p.position].push({ ...p, _xp: xp, _nextXp: nextXp });
    }
  }

  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => b._xp - a._xp || (b.marketValue || 0) - (a.marketValue || 0));
  }

  const startersByPos = { TW: [], ABW: [], MF: [], ST: [] };
  const starterIds = new Set();

  for (const pos of ['TW', 'ABW', 'MF', 'ST']) {
    const minNeed = MIN_POSITION_SLOTS[pos];
    for (const p of byPos[pos].slice(0, minNeed)) {
      startersByPos[pos].push(p);
      starterIds.add(String(p.playerId));
    }
  }

  const remainingField = [...byPos.ABW, ...byPos.MF, ...byPos.ST]
    .filter((p) => !starterIds.has(String(p.playerId)))
    .sort((a, b) => b._xp - a._xp || (b.marketValue || 0) - (a.marketValue || 0));

  let starterCount = Object.values(startersByPos).reduce((sum, list) => sum + list.length, 0);
  for (const p of remainingField) {
    if (starterCount >= 11) break;
    if (startersByPos[p.position].length < MAX_POSITION_SLOTS[p.position]) {
      startersByPos[p.position].push(p);
      starterIds.add(String(p.playerId));
      starterCount += 1;
    }
  }

  const allStarters = [...startersByPos.TW, ...startersByPos.ABW, ...startersByPos.MF, ...startersByPos.ST];
  const missingSlots = Math.max(0, 11 - allStarters.length);
  const bestLineupXp = Math.round(allStarters.reduce((s, p) => s + p._xp, 0) - missingSlots * 100);
  const bestLineupNextXp = Math.round(allStarters.reduce((s, p) => s + p._nextXp, 0) - missingSlots * 100);

  const posStats = {};
  for (const pos of ['TW', 'ABW', 'MF', 'ST']) {
    const all = byPos[pos];
    const starters = startersByPos[pos];
    const weakestStarter = starters.length ? starters[starters.length - 1] : null;
    const weakestOverall = all.length ? all[all.length - 1] : null;
    const avgAll = all.length ? all.reduce((s, p) => s + p._xp, 0) / all.length : 0;
    const avgStarters = starters.length ? starters.reduce((s, p) => s + p._xp, 0) / starters.length : 0;
    posStats[pos] = {
      count: all.length,
      starterCount: starters.length,
      missingMandatory: all.length < MIN_POSITION_SLOTS[pos],
      weakestStarter,
      weakestStarterXp: weakestStarter ? weakestStarter._xp : 0,
      weakestOverall,
      weakestOverallXp: weakestOverall ? weakestOverall._xp : 0,
      avgAll: Math.round(avgAll),
      avgStarters: Math.round(avgStarters),
    };
  }

  const replaceableFieldStarters = [...startersByPos.ABW, ...startersByPos.MF, ...startersByPos.ST]
    .filter((p) => posStats[p.position].starterCount > MIN_POSITION_SLOTS[p.position])
    .sort((a, b) => a._xp - b._xp);
  const weakestFieldStarter = replaceableFieldStarters[0] || null;

  // Schwaechste Position der eigenen Startelf bestimmen
  const weakestPos = ['TW', 'ABW', 'MF', 'ST']
    .map((pos) => ({ pos, val: posStats[pos].missingMandatory ? -100 : posStats[pos].weakestStarterXp }))
    .sort((a, b) => a.val - b.val)[0]?.pos || null;

  return {
    squadIds,
    starterIds,
    startersByPos,
    posStats,
    weakestFieldStarter,
    weakestPos,
    starterCount: allStarters.length,
    bestLineupXp,
    bestLineupNextXp,
  };
};

// Bewertet einen eigenen Kader-Spieler realistisch mit xP-Kontext:
// Ein gesetzter Top-Starter (in bester 11, fit, prob 1/2, >= 70 xP) wird nicht
// wegen eines kleinen 3-Tage-Marktwert-Dips fälschlich zum Verkauf empfohlen!
export const evaluateOwnSquadMember = (entry, squadAnalysis) => {
  if (!entry) return entry;
  const pid = String(entry.playerId);
  const inBestEleven = Boolean(squadAnalysis?.starterIds?.has(pid));
  const xp = getEffectiveXp(entry);
  const isFit = (entry.status == null || entry.status === 0) && !entry.isInjured;
  const probCode = normalizeStartProbCode(entry.startElfProbability ?? entry.prob);
  const predicted = entry.predictedChange || 0;

  let smartSell = Boolean(entry.sellRecommended);
  let squadRole = inBestEleven ? 'startelf' : 'bank';
  let squadNote = null;

  if (!isFit) {
    smartSell = true;
    squadNote = `Aktuell nicht einsatzbereit (${entry.statusLabel || 'verletzt/gesperrt'}) – liefert aktuell 0 xP.`;
  } else if (inBestEleven && xp >= 70 && (probCode === 1 || probCode === 2)) {
    // Gesetzter Leistungstraeger deiner Startelf -> kein voreiliger Verkaufs-Alarm
    smartSell = false;
    squadNote = `Stammspieler in deiner stärksten Elf (${xp} xP${entry.nextOpponent ? `, nächster ST: ${entry.xpNext ?? xp} xP ${entry.isHome ? 'vs.' : '@'} ${entry.nextOpponent}` : ''}).`;
  } else if (!inBestEleven && predicted < -3000 && (probCode === 4 || probCode === 5 || xp < 45)) {
    smartSell = true;
    squadNote = `Aktuell nur Bank (${xp} xP) bei fallendem Marktwert – guter Verkaufskandidat für Budget.`;
  } else if (!inBestEleven) {
    squadNote = `Aktuell Bank / Rotation (${xp} xP) hinter deiner stärksten 11.`;
  } else {
    squadNote = `In deiner Startelf (${xp} xP), aber auf dieser Position perspektivisch ausbaufähig.`;
  }

  return {
    ...entry,
    inBestEleven,
    squadRole,
    sellRecommended: smartSell,
    squadEval: {
      tier: null,
      badgeLabel: inBestEleven ? 'S11' : 'Bank',
      reasonText: squadNote,
      isBuyRecommended: false,
      isPlayFit: inBestEleven,
      isTradeOnly: false,
      xpDelta: 0,
    },
  };
};

// Schlaegt bei negativem Spieltags-Budget die schmerzaermsten Verkaeufe vor
// (geringster xP-Verlust pro Million EUR, bevorzugt Bankspieler, wahrt Pflichtpositionen).
export const suggestSalesToClearDeficit = (ownSquad, deficitAmount, squadAnalysis) => {
  if (!Array.isArray(ownSquad) || deficitAmount <= 0) return [];
  const counts = { TW: 0, ABW: 0, MF: 0, ST: 0 };
  ownSquad.forEach((p) => { if (counts[p?.position] != null) counts[p.position] += 1; });

  const candidates = ownSquad
    .filter((p) => (p?.marketValue || 0) > 0)
    .map((p) => {
      const xp = getEffectiveXp(p);
      const mvMio = Math.max(0.5, (p.marketValue || 0) / 1_000_000);
      const inBest = Boolean(squadAnalysis?.starterIds?.has(String(p.playerId)));
      const sellPenalty = p.sellRecommended ? 0 : 1;
      // Niedriger Score = zuerst verkaufen (Bank vor Startelf, Verkaufskandidaten zuerst, kleinster xP/Mio)
      const painScore = (inBest ? 1000 : 0) + sellPenalty * 100 + (xp / mvMio);
      return { player: p, xp, painScore };
    })
    .sort((a, b) => a.painScore - b.painScore);

  const chosen = [];
  let raised = 0;
  for (const c of candidates) {
    if (raised >= deficitAmount) break;
    const pos = c.player.position;
    // Pflichtpositionen nach Moeglichkeit nicht unter Minimum reissen
    if (pos && counts[pos] <= (MIN_POSITION_SLOTS[pos] || 0) && ownSquad.length - chosen.length <= 11) {
      continue;
    }
    chosen.push(c.player);
    raised += c.player.marketValue || 0;
    if (pos && counts[pos] != null) counts[pos] -= 1;
  }

  return chosen;
};

// Bewertet einen Markt-/Datenbank-Spieler anhand von xP v2 direkt gegen den eigenen Kader.
export const evaluatePlayerForSquad = (entry, squadAnalysis) => {
  const isFit = (entry.status == null || entry.status === 0) && !entry.isInjured;
  const probCode = normalizeStartProbCode(entry.startElfProbability ?? entry.prob);
  const isUnlikelyStarter = probCode === 4 || probCode === 5;
  const predicted = entry.predictedChange || 0;
  const hasRisingValue = predicted >= BUY_MIN_PREDICTED_CHANGE;
  const xp = getEffectiveXp(entry);
  const nextHint = entry.nextOpponent && typeof entry.xpNext === 'number'
    ? ` (nächster ST: ${entry.xpNext} xP ${entry.isHome ? 'vs.' : '@'} ${entry.nextOpponent})`
    : '';

  if (!squadAnalysis) {
    if (isFit && !isUnlikelyStarter && xp >= 75) {
      return {
        tier: 'kader',
        badgeLabel: '✓ Kader-Potenzial',
        reasonText: `Starker Stammspieler-Kandidat mit ${xp} xP${nextHint}.`,
        isBuyRecommended: true,
        isPlayFit: true,
        isTradeOnly: false,
        xpDelta: 0,
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
        xpDelta: 0,
      };
    }
    return { tier: null, badgeLabel: null, reasonText: null, isBuyRecommended: false, isPlayFit: false, isTradeOnly: false, xpDelta: 0 };
  }

  if (squadAnalysis.squadIds.has(String(entry.playerId))) {
    return { tier: null, badgeLabel: null, reasonText: null, isBuyRecommended: false, isPlayFit: false, isTradeOnly: false, xpDelta: 0 };
  }

  const pos = entry.position;
  const posInfo = pos ? squadAnalysis.posStats[pos] : null;

  if (isFit && !isUnlikelyStarter && posInfo && xp > 0) {
    // 1. Offene Pflichtposition im eigenen Kader
    if (posInfo.missingMandatory && xp >= 40) {
      return {
        tier: 'startelf',
        badgeLabel: '★ Startelf-Upgrade',
        reasonText: `Direkte Verstärkung für deine Startelf: Auf ${pos} fehlt noch ein Pflichtplatz und er bringt ${xp} xP${nextHint}.`,
        isBuyRecommended: true,
        isPlayFit: true,
        isTradeOnly: false,
        xpDelta: xp,
      };
    }

    // 2. Direktes Startelf-Upgrade gegenueber dem schwaechsten Stammspieler auf dieser Position
    const starterThreshold = posInfo.weakestStarterXp;
    const deltaPos = Math.round(xp - starterThreshold);
    if (xp >= 60 && deltaPos >= 10) {
      const refName = formatPlayerShort(posInfo.weakestStarter);
      return {
        tier: 'startelf',
        badgeLabel: '★ Startelf-Upgrade',
        reasonText: `Starkes Startelf-Upgrade auf ${pos} (+${deltaPos} xP): Mit ${xp} xP${nextHint} liegt er klar vor deinem schwächsten ${pos}-Starter (${refName}, ${Math.round(starterThreshold)} xP).`,
        isBuyRecommended: true,
        isPlayFit: true,
        isTradeOnly: false,
        xpDelta: deltaPos,
      };
    }

    // 3. Flex-Upgrade in die beste 11 per Formationswechsel
    const flexWeakest = squadAnalysis.weakestFieldStarter;
    if (
      pos !== 'TW' &&
      flexWeakest &&
      posInfo.starterCount < MAX_POSITION_SLOTS[pos] &&
      xp >= 70 &&
      xp >= flexWeakest._xp + 12
    ) {
      const deltaFlex = Math.round(xp - flexWeakest._xp);
      return {
        tier: 'startelf',
        badgeLabel: '★ Startelf-Upgrade',
        reasonText: `Startelf-Upgrade (+${deltaFlex} xP per Systemwechsel): Mit ${xp} xP${nextHint} klar vor deinem schwächsten Feld-Starter (${formatPlayerShort(flexWeakest)}, ${Math.round(flexWeakest._xp)} xP).`,
        isBuyRecommended: true,
        isPlayFit: true,
        isTradeOnly: false,
        xpDelta: deltaFlex,
      };
    }

    // 4. Solide Kader-Ergaenzung / Rotation (nahe an deiner Startelf)
    if (xp >= 60 && xp >= starterThreshold - 12) {
      return {
        tier: 'kader',
        badgeLabel: '✓ Kader-Ergänzung',
        reasonText: `Solide Kader-Ergänzung auf ${pos}: Mit ${xp} xP${nextHint} liegt er nah an deinem schwächsten ${pos}-Starter (${formatPlayerShort(posInfo.weakestStarter)}, ${Math.round(starterThreshold)} xP).`,
        isBuyRecommended: true,
        isPlayFit: true,
        isTradeOnly: false,
        xpDelta: deltaPos,
      };
    }
  }

  // 5. Kein Startelf-/Kader-Upgrade, aber steigender Marktwert -> Nur Trading
  if (hasRisingValue) {
    if (!isFit) {
      return {
        tier: 'trading',
        badgeLabel: '📈 Nur Trading',
        reasonText: `Aktuell nicht einsatzbereit (${entry.statusLabel || 'verletzt/angeschlagen'}, 0 xP), aber durch den Marktwertanstieg fürs Trading interessant.`,
        isBuyRecommended: true,
        isPlayFit: false,
        isTradeOnly: true,
        xpDelta: 0,
      };
    }
    if (isUnlikelyStarter) {
      return {
        tier: 'trading',
        badgeLabel: '📈 Nur Trading',
        reasonText: `Aktuell kaum Startelf-Aussicht (${xp} xP), aber durch das Marktwert-Momentum fürs Trading interessant.`,
        isBuyRecommended: true,
        isPlayFit: false,
        isTradeOnly: true,
        xpDelta: 0,
      };
    }
    const compareHint = posInfo && posInfo.weakestStarter
      ? ` (${xp} xP vs. ${Math.round(posInfo.weakestStarterXp)} xP bei ${formatPlayerShort(posInfo.weakestStarter)} auf ${pos})`
      : '';
    return {
      tier: 'trading',
      badgeLabel: '📈 Nur Trading',
      reasonText: `Für deine Startelf kein xP-Upgrade${compareHint} – aber durch den erwarteten Marktwertanstieg fürs Trading interessant.`,
      isBuyRecommended: true,
      isPlayFit: false,
      isTradeOnly: true,
      xpDelta: 0,
    };
  }

  return {
    tier: null,
    badgeLabel: null,
    reasonText: posInfo && isFit && xp > 0
      ? `Aktuell keine Verstärkung für deine ${pos}-Position (${xp} xP vs. Ø ${posInfo.avgStarters} xP in deiner Startelf).`
      : null,
    isBuyRecommended: false,
    isPlayFit: false,
    isTradeOnly: false,
    xpDelta: 0,
  };
};
