// Einheitliches Spieler-xP-Modell (xP v2) fuer den Trading Advisor.
// Spiegelt die kalibrierte Logik aus backend/scripts/calculate-ratings.js wider
// (r = 0,895 / 80 % Erklaerungskraft ueber 10 Spieltage), angewendet auf den
// AKTUELLEN Stand jedes Bundesliga-Spielers fuer den kommenden Spieltag:
//   - Offizielle Kickbase-Einsatzprognose (`prob` 1..5) + Fitness-Status (`st`)
//   - Marktwert- & Team-Prior mit Empirical-Bayes-Glaettung (w = 4,0)
//   - Leichte Form-Gewichtung (0,95 pro Spieltag zurueck)
//   - Empirischer Joker-Beitrag fuer Nicht-Startelf-Faelle
//   - Heim-/Auswaertsfaktor & Gegnerstaerke fuer den naechsten Spieltag (`xpNext`)
//   - Matchup-neutraler Basis-Wert (`xpSeason`) fuer faire langfristige Kader-Upgrades

const PROB_WEIGHT_BY_CODE = {
  1: 1.0,  // Sicher
  2: 0.85, // Erwartet
  3: 0.5,  // Unsicher
  4: 0.15, // Unwahrscheinlich
  5: 0.0,  // Ausgeschlossen
};

const PRIOR_START_PROB = 0.55;
const PRIOR_START_PTS = 82;
const PRIOR_JOKER_PTS = 26;
const XP_SHRINKAGE_WEIGHT = 4.0;
const XP_RECENCY_DECAY = 0.95;

function parsePlayedMinutes(mp) {
  return parseInt(String(mp || '0'), 10) || 0;
}

export function normalizeProbWeight(prob, status, curBefore = [], prevEntries = [], mv = 0) {
  // Verletzte/gesperrte Spieler haben fuer den kommenden Spieltag 0 Startelf-Chance
  if (typeof status === 'number' && status !== 0) {
    return 0;
  }
  if (prob != null && Object.prototype.hasOwnProperty.call(PROB_WEIGHT_BY_CODE, Math.round(Number(prob)))) {
    return PROB_WEIGHT_BY_CODE[Math.round(Number(prob))];
  }
  // Fallback ohne offizielle Kickbase-Prognose: juengste Einsatzrolle
  const last3 = curBefore.slice(-3);
  const last2 = curBefore.slice(-2);
  const last1 = curBefore.slice(-1)[0];
  if (last3.length === 3 && last3.every((e) => e.st === 5)) return 1.0;
  if (last2.length === 2 && last2.every((e) => e.st === 5)) return 0.95;
  if (last1 && last1.st === 5) return 0.85;
  if (curBefore.length > 0) {
    const recent5 = curBefore.slice(-5);
    const starts = recent5.filter((e) => e.st === 5).length;
    return starts / recent5.length;
  }
  if (prevEntries.length > 0) {
    return prevEntries.filter((e) => e.st === 5).length / prevEntries.length;
  }
  if (mv >= 20_000_000) return 0.92;
  if (mv >= 10_000_000) return 0.82;
  if (mv >= 5_000_000) return 0.68;
  if (mv > 0 && mv < 1_500_000) return 0.30;
  return PRIOR_START_PROB;
}

/**
 * Berechnet fuer alle Spieler in `allPlayersRaw` (frontend/public/history/all_players.json)
 * sowohl den matchup-neutralen Basis-xP (`xpSeason`) als auch den konkreten
 * Spieltags-xP fuer den kommenden Spieltag (`xpNext` inkl. Heim/Auswaerts & Gegner).
 */
export function buildPlayerXpMap(allPlayersRaw) {
  const byId = new Map();
  if (!Array.isArray(allPlayersRaw) || allPlayersRaw.length === 0) {
    return { nextMatchday: null, byId };
  }

  const teamNames = new Map();
  const teamFor = new Map();
  const teamOpp = new Map();
  const prevTeamFor = new Map();
  const prevTeamOpp = new Map();
  let curHomeSum = 0, curHomeN = 0, curAwaySum = 0, curAwayN = 0;
  let prevHomeSum = 0, prevHomeN = 0, prevAwaySum = 0, prevAwayN = 0;
  let curAllSum = 0, curAllN = 0, prevAllSum = 0, prevAllN = 0;
  let maxPlayedDay = 0;
  const mvSamples = [];

  const parsed = allPlayersRaw.map((p) => {
    const pid = String(p?.i ?? '');
    if (p?.tid != null && p?.tn) teamNames.set(String(p.tid), p.tn);
    const seasons = Array.isArray(p?.performance?.it) ? p.performance.it : [];
    const curSeason = seasons.length > 0 ? seasons[seasons.length - 1] : null;
    const prevSeason = seasons.length >= 2 ? seasons[seasons.length - 2] : null;
    const prevEntries = (Array.isArray(prevSeason?.ph) ? prevSeason.ph : [])
      .filter((e) => e.st === 5 || (e.st === 3 && parsePlayedMinutes(e.mp) > 0) || e.st === 4);
    const curPh = Array.isArray(curSeason?.ph) ? curSeason.ph : [];

    for (const e of curPh) {
      if (e.mdst === 2 && typeof e.day === 'number' && e.day > maxPlayedDay) {
        maxPlayedDay = e.day;
      }
    }

    return { p, pid, prevEntries, curPh };
  });

  const nextMatchday = maxPlayedDay > 0 ? maxPlayedDay + 1 : 1;

  // 1. Liga-Kontext aus allen abgeschlossenen Spielen (day <= maxPlayedDay) + Vorsaison
  for (const { p, prevEntries, curPh } of parsed) {
    for (const e of prevEntries) {
      if (e.st !== 5 || typeof e.p !== 'number') continue;
      prevAllSum += e.p;
      prevAllN += 1;
      const pt = String(e.pt || '');
      const t1 = String(e.t1 || '');
      const t2 = String(e.t2 || '');
      if (pt && t1 && t2) {
        const isHome = pt === t1;
        const opp = isHome ? t2 : t1;
        if (isHome) { prevHomeSum += e.p; prevHomeN += 1; } else { prevAwaySum += e.p; prevAwayN += 1; }
        const tf = prevTeamFor.get(pt) || { sum: 0, n: 0 }; tf.sum += e.p; tf.n += 1; prevTeamFor.set(pt, tf);
        const to = prevTeamOpp.get(opp) || { sum: 0, n: 0 }; to.sum += e.p; to.n += 1; prevTeamOpp.set(opp, to);
      }
    }

    const curStarts = [];
    for (const e of curPh) {
      if (typeof e.day !== 'number' || e.day > maxPlayedDay || e.st !== 5 || typeof e.p !== 'number') continue;
      curAllSum += e.p;
      curAllN += 1;
      curStarts.push(e.p);
      const pt = String(e.pt || p?.tid || '');
      const t1 = String(e.t1 || '');
      const t2 = String(e.t2 || '');
      if (pt && t1 && t2) {
        const isHome = pt === t1;
        const opp = isHome ? t2 : t1;
        if (isHome) { curHomeSum += e.p; curHomeN += 1; } else { curAwaySum += e.p; curAwayN += 1; }
        const tf = teamFor.get(pt) || { sum: 0, n: 0 }; tf.sum += e.p; tf.n += 1; teamFor.set(pt, tf);
        const to = teamOpp.get(opp) || { sum: 0, n: 0 }; to.sum += e.p; to.n += 1; teamOpp.set(opp, to);
      }
    }

    const mv = p?.mv || 0;
    if (mv >= 500_000 && curStarts.length >= 2) {
      const avg = curStarts.reduce((a, b) => a + b, 0) / curStarts.length;
      mvSamples.push({ x: Math.log10(mv / 1_000_000), y: avg });
    }
  }

  const leagueMean = curAllN >= 100
    ? curAllSum / curAllN
    : (prevAllN > 0 ? prevAllSum / prevAllN : PRIOR_START_PTS);

  const homeAvg = (curHomeSum + 0.25 * prevHomeSum) / Math.max(1, curHomeN + 0.25 * prevHomeN);
  const awayAvg = (curAwaySum + 0.25 * prevAwaySum) / Math.max(1, curAwayN + 0.25 * prevAwayN);
  const haMean = (homeAvg + awayAvg) / 2 || leagueMean;
  const homeMult = haMean > 0 ? homeAvg / haMean : 1.0;
  const awayMult = haMean > 0 ? awayAvg / haMean : 1.0;

  let mvA = 65;
  let mvB = 52;
  if (mvSamples.length >= 20) {
    const mx = mvSamples.reduce((s, o) => s + o.x, 0) / mvSamples.length;
    const my = mvSamples.reduce((s, o) => s + o.y, 0) / mvSamples.length;
    let num = 0, den = 0;
    for (const o of mvSamples) {
      num += (o.x - mx) * (o.y - my);
      den += (o.x - mx) ** 2;
    }
    if (den > 0) {
      mvB = num / den;
      mvA = my - mvB * mx;
    }
  }

  const predictFromMV = (mv) => {
    if (!mv || mv < 500_000) return leagueMean;
    return Math.max(45, Math.min(185, mvA + mvB * Math.log10(mv / 1_000_000)));
  };

  const getTeamForAvg = (tid) => {
    const key = String(tid || '');
    const c = teamFor.get(key) || { sum: 0, n: 0 };
    const pr = prevTeamFor.get(key) || { sum: 0, n: 0 };
    const prW = Math.min(25, pr.n * 0.12);
    const prMean = pr.n > 0 ? pr.sum / pr.n : leagueMean;
    return (c.sum + prW * prMean + 15 * leagueMean) / (c.n + prW + 15);
  };

  const getOppAllowedRatio = (oppTid) => {
    const key = String(oppTid || '');
    const c = teamOpp.get(key) || { sum: 0, n: 0 };
    const pr = prevTeamOpp.get(key) || { sum: 0, n: 0 };
    const prW = Math.min(25, pr.n * 0.12);
    const prMean = pr.n > 0 ? pr.sum / pr.n : leagueMean;
    const allowed = (c.sum + prW * prMean + 25 * leagueMean) / (c.n + prW + 25);
    return leagueMean > 0 ? (allowed / leagueMean) : 1.0;
  };

  // 2. Pro Spieler xpSeason (neutral) & xpNext (naechster Spieltag inkl. Matchup) berechnen
  for (const { p, pid, prevEntries, curPh } of parsed) {
    if (!pid) continue;
    const curPlayed = curPh
      .filter((e) => typeof e.day === 'number' && e.day <= maxPlayedDay && (e.st === 5 || e.st === 3 || e.st === 4 || e.st === 1))
      .sort((a, b) => a.day - b.day);

    const mv = p?.mv || 0;
    const pStart = normalizeProbWeight(p?.prob, p?.st, curPlayed, prevEntries, mv);

    const curStartPts = curPlayed.filter((e) => e.st === 5 && typeof e.p === 'number').map((e) => e.p);
    const prevStartPts = prevEntries.filter((e) => e.st === 5 && typeof e.p === 'number').map((e) => e.p);

    const ownTid = String(p?.tid || '');
    let priorAnchor = leagueMean;
    if (mv >= 500_000 && ownTid) {
      priorAnchor = 0.7 * predictFromMV(mv) + 0.3 * getTeamForAvg(ownTid);
    } else if (mv >= 500_000) {
      priorAnchor = predictFromMV(mv);
    } else if (ownTid) {
      priorAnchor = getTeamForAvg(ownTid);
    }

    let startPtsSum = XP_SHRINKAGE_WEIGHT * priorAnchor;
    let startPtsWeight = XP_SHRINKAGE_WEIGHT;
    if (prevStartPts.length > 0) {
      const prevAvg = prevStartPts.reduce((a, b) => a + b, 0) / prevStartPts.length;
      const wPrev = curStartPts.length >= 5 ? 0.5 : Math.min(2, prevStartPts.length * 0.2);
      startPtsSum += wPrev * prevAvg;
      startPtsWeight += wPrev;
    }
    curStartPts.forEach((pts, idx) => {
      const recW = Math.pow(XP_RECENCY_DECAY, curStartPts.length - 1 - idx);
      startPtsSum += recW * pts;
      startPtsWeight += recW;
    });
    const avgStartPts = Math.max(0, startPtsSum / startPtsWeight);

    // Joker-Anteil
    const allBefore = [...prevEntries.slice(-8), ...curPlayed];
    const subEntries = allBefore.filter((e) => e.st === 3 && parsePlayedMinutes(e.mp) > 0 && typeof e.p === 'number');
    const unusedEntries = allBefore.filter((e) => e.st === 4 || (e.st === 3 && parsePlayedMinutes(e.mp) === 0));
    const nonStartGames = subEntries.length + unusedEntries.length;
    const pJoker = nonStartGames >= 2 ? (subEntries.length + 0.5) / (nonStartGames + 1.5) : 0.3;

    let jokerPtsSum = PRIOR_JOKER_PTS;
    let jokerPtsWeight = 1.0;
    subEntries.forEach((e) => {
      jokerPtsSum += Math.max(-10, Math.min(120, e.p));
      jokerPtsWeight += 1;
    });
    const avgSubPts = Math.max(0, jokerPtsSum / jokerPtsWeight);

    // Wenn Spieler verletzt/gesperrt ist (st !== 0), kein Joker-Einsatz fuer naechsten ST
    const isUnavailable = typeof p?.st === 'number' && p.st !== 0;
    const expectedJokerPts = isUnavailable ? 0 : (1 - pStart) * pJoker * avgSubPts;

    // Matchup fuer naechsten Spieltag
    const nextEntry = curPh.find((e) => e.day === nextMatchday) || null;
    let isHome = null;
    let nextOpponent = null;
    let matchupFactor = 1.0;
    if (nextEntry && nextEntry.t1 && nextEntry.t2 && ownTid) {
      const t1 = String(nextEntry.t1);
      const t2 = String(nextEntry.t2);
      if (ownTid === t1 || ownTid === t2) {
        isHome = ownTid === t1;
        const oppTid = isHome ? t2 : t1;
        nextOpponent = teamNames.get(oppTid) || null;
        matchupFactor = Math.max(0.75, Math.min(1.25, (isHome ? homeMult : awayMult) * getOppAllowedRatio(oppTid)));
      }
    }

    const xpSeason = Math.max(0, pStart * avgStartPts + expectedJokerPts);
    const xpNext = Math.max(0, pStart * avgStartPts * matchupFactor + expectedJokerPts);

    byId.set(pid, {
      xpSeason: Math.round(xpSeason),
      xpNext: Math.round(xpNext),
      avgStartPts: Math.round(avgStartPts),
      pStart,
      matchupFactor,
      isHome,
      nextOpponent,
      nextMatchday,
    });
  }

  return { nextMatchday, byId };
}
