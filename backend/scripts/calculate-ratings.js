const fs = require('fs');
const path = require('path');

// --- Liga-spezifische Konstanten ---
// Wir spielen OHNE Underpay (Kauf unter Marktwert ist verboten -> jeder Kauf
// liegt bei/über Marktwert). "Overpay" ist also der Normalfall, keine Regelverletzung.
// Referenzwert: eine Prämie von ~8% über Marktwert gilt als "fair" in einer Liga mit
// Bieterwettbewerb; deutlich mehr wird negativ bewertet, deutlich weniger (nah am
// Marktwert eingekauft) positiv.
const REFERENCE_OVERPAY_RATIO = 0.08;

// Wer am Spieltag 250+ Punkte holt, MUSS den Spieler laut Liga-Regel zeitnah verkaufen
// (analog zur "Zwangsverkauf Top 3"-Regel). Das ist kein Trading-Können, sondern eine
// erzwungene Aktion mit quasi-garantiertem Gewinn -> wird im Score gedämpft, aber
// weiterhin transparent ausgewiesen.
const FORCED_SALE_POINTS_THRESHOLD = 250;
const FORCED_SALE_WINDOW_DAYS = 6; // Regel verlangt Verkauf bis Montag 22 Uhr nach dem Spieltag

// Gewichtung der verschiedenen Trade-Arten im PRO-Score (reiner Profit, Owner-
// Feedback 23.11.2026: "nicht so gängig" fand den alten gewichteten DURCHSCHNITT
// inkl. Verkaufs-Timing - jetzt stattdessen die gewichtete SUMME, ohne Timing,
// das ausschliesslich noch bei TIM einfliesst):
// - realized: abgeschlossener Kauf+Verkauf -> volle Wertung
// - forcedRealized: abgeschlossen, aber durch die 250-Punkte-Regel erzwungen -> gedämpft
// - unrealized: noch offene Position (gekauft, noch nicht verkauft) -> nicht sicher, daher reduziert
// - orphanSale: Verkauf ohne bekannten Einstandspreis (zugeloster Kaderspieler zu Saisonbeginn)
//   -> bewertet relativ zum Marktwert zum Verkaufszeitpunkt, moderat gewichtet, da die
//   Referenz (Marktwert) eine Schätzung ist, kein exakter Einstandspreis
const SCORE_WEIGHTS = {
    realized: 1,
    forcedRealized: 0.35,
    unrealized: 0.5,
    orphanSale: 0.7,
    forcedOrphanSale: 0.2, // erzwungen UND ohne bekannten Einstandspreis -> kaum Aussagekraft fürs Trading-Können
};

// Eine offene Position (gekauft, noch nicht verkauft) ist am Kauftag praktisch IMMER
// im Minus: Da Underpay verboten ist, kauft man mindestens zum Marktwert - der
// gezahlte Aufschlag zeigt sich sofort als "Buchverlust", obwohl noch gar keine Zeit
// war, sich zu entwickeln (Punkte zu sammeln, Marktwert nachzuziehen). Ohne Korrektur
// würde jede aktive Kaderarbeit kurzfristig wie ein schlechtes Investment aussehen.
// Deshalb bekommt der unrealisierte Gewinn/Verlust einer Position erst nach und nach
// volles Gewicht im Score - frisch gekaufte Spieler zählen kaum, "gereifte" Positionen
// (>= MATURITY_DAYS) zählen voll. Die rohen Anzeige-Werte (unrealizedProfit) bleiben
// davon unberührt, das betrifft NUR die Score-Gewichtung.
const OPEN_POSITION_MATURITY_DAYS = 14;
const OPEN_POSITION_MIN_CONFIDENCE = 0.2;

function openPositionConfidence(buyDate, now = new Date()) {
    const daysHeld = (now.getTime() - new Date(buyDate).getTime()) / (1000 * 60 * 60 * 24);
    if (!Number.isFinite(daysHeld) || daysHeld <= 0) return OPEN_POSITION_MIN_CONFIDENCE;
    return Math.max(OPEN_POSITION_MIN_CONFIDENCE, Math.min(1, daysHeld / OPEN_POSITION_MATURITY_DAYS));
}

// --- Kader-Vollständigkeit & Budget-Risiko ---
// Ein unvollständiger Kader (keine startelf-fähige Aufstellung) UND/ODER ein
// negatives/knappes Budget sind ein echtes Risiko: es bleibt kaum Spielraum, die
// Lücke ohne Not-Verkäufe (und damit potenziell schlechte Preise) zu schließen -
// unabhängig davon, wie gut die bisherigen Trades gelaufen sind.
// SQUAD_MIN_POSITIONS/SQUAD_MIN_TOTAL leben zentral in ../squadRules.js (auch
// vom Trading Advisor Budget-Check genutzt, siehe frontend/src/squadRules.js).
const { computeSquadReadiness, SQUAD_MIN_POSITIONS, SQUAD_MIN_TOTAL } = require('../squadRules');
const NEGATIVE_BUDGET_PENALTY_PER_MIO = 0.4; // pro 1 Mio. im Minus, gedeckelt
const MAX_SQUAD_RISK_PENALTY = 20;

// Zieht aus dem Betrags-String den tatsächlichen (ggf. negativen) Wert - Kickbase
// erlaubt ein Budget im Minus (z.B. bei Überbietungen), ein naives
// `replace(/[^0-9]/g,'')` würde das Minuszeichen verschlucken und aus "-33.000.000 €"
// fälschlich +33 Mio machen.
function parseSignedMoney(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    const cleaned = val.toString().replace(/[^0-9-]/g, '');
    const parsed = parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

// -20 (leerer/nicht finanzierbarer Kader) bis 0 (startelf-fähig, solventes Budget).
// Beide Risiken zusammen (unvollständig UND im Minus) wiegen überproportional schwerer.
function computeSquadRiskPenalty(readiness, budget) {
    if (readiness === null) return 0; // keine Kaderdaten verfügbar -> nicht bewerten
    const incompletenessPenalty = (1 - readiness) * 14;
    const budgetPenalty = budget < 0 ? Math.min(10, (Math.abs(budget) / 1_000_000) * NEGATIVE_BUDGET_PENALTY_PER_MIO) : 0;
    const comboMultiplier = (readiness < 1 && budget < 0) ? 1.3 : 1;
    return -Math.min(MAX_SQUAD_RISK_PENALTY, (incompletenessPenalty + budgetPenalty) * comboMultiplier);
}

// Der Trading Advisor exportiert pro Liga den aktuellen Kader jedes Managers
// (managerSquads). Wir brauchen daraus Positionsverteilung + Gesamtgröße
// (fürs alte Flaschenhals-Readiness) UND die einzelnen Spieler-IDs je Position
// (für die REALISTISCHE Startelf-Wahrscheinlichkeit, siehe
// computeRealisticSquadReadiness weiter unten) - zusammengeführt über ALLE
// Ligen zu einer einzigen Map (Manager-IDs sind liga-übergreifend eindeutig).
function loadManagerSquads() {
    const advisorPath = path.join(__dirname, '../../frontend/public/advisor-data.json');
    const map = new Map();
    try {
        if (fs.existsSync(advisorPath)) {
            const advisorData = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));
            Object.values(advisorData.leagues || {}).forEach(league => {
                Object.entries(league.managerSquads || {}).forEach(([managerId, squad]) => {
                    const positionCounts = {};
                    const players = [];
                    (squad || []).forEach(p => {
                        if (p.position) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
                        if (p.playerId) players.push({ id: p.playerId, position: p.position });
                    });
                    map.set(String(managerId), { total: (squad || []).length, positionCounts, players });
                });
            });
        }
    } catch (e) {
        console.warn('Konnte advisor-data.json nicht lesen (Kaderdaten):', e.message);
    }
    return map;
}

// Liest den aktuellen Marktwert (Kaderwert) pro Manager aus advisor-data.json
// Rückgabe: Map(managerId -> summe(marketValue aller Spieler im Kader))
// Fallback auf 0 wenn Daten fehlen, wird später durch totalSpent ersetzt.
function loadManagerSquadValues() {
    const advisorPath = path.join(__dirname, '../../frontend/public/advisor-data.json');
    const map = new Map();
    try {
        if (fs.existsSync(advisorPath)) {
            const advisorData = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));
            Object.values(advisorData.leagues || {}).forEach(league => {
                Object.entries(league.managerSquads || {}).forEach(([managerId, squad]) => {
                    const squadValue = (squad || []).reduce((sum, player) => {
                        return sum + (typeof player.marketValue === 'number' && player.marketValue > 0 ? player.marketValue : 0);
                    }, 0);
                    if (squadValue > 0) {
                        map.set(String(managerId), squadValue);
                    }
                });
            });
        }
    } catch (e) {
        console.warn('Konnte Kaderwert aus advisor-data.json nicht lesen:', e.message);
    }
    return map;
}

// --- Kaderstaerke (KAD): Rein historischer Erwartungswert (xP) aller aufgestellten Startelfen ---
// Statt einer unterwoechigen Momentaufnahme (die durch Trading-Umbauten / negatives
// Zwischenbudget verzerrt waere) bewerten wir ausschliesslich die TATSAECHLICH an
// jedem Spieltag aufgestellten Startelfen (`startelf-md1..N.json`). Da diese Teams
// am Freitag 20:30 real aufgestellt wurden, ist Budget-Konformitaet garantiert.
//
// Streng OHNE Ergebnis-Glueck ("Point-in-Time", xP v2):
// Fuer jeden Spieltag d zaehlen fuer jeden aufgestellten Spieler NUR Informationen
// VOR Spieltag d (`day < d` + Vorsaison als sanfter Prior, Pre-Matchday-Marktwert
// aus `player-history.json`, Heim-/Auswaerts- und Gegnerstaerke aus Spielen < d,
// sowie ab ST 11 das vor Anstoss eingefrorene Kickbase-`prob` aus `kickoff-squads/md{d}.json`):
//   E[Pkt | vor ST d] = p_start * Ø_Startelf_Pkt(Matchup) + (1 - p_start) * p_joker * Ø_Joker_Pkt
// Was am Spieltag d dann tatsaechlich passierte (Rote Karte, Traumtor, Glueck/Pech),
// fliesst mit 0 % in den Score ein!
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

// Marktwert streng VOR dem Spieltags-Anstoss (mind. 1 Tag vorher, kein Leakage)
function getPreMatchdayMarketValue(mvHistory, playerId, kickoffDate) {
    if (!mvHistory || kickoffDate == null) return null;
    const ms = kickoffDate instanceof Date ? kickoffDate.getTime() : new Date(kickoffDate).getTime();
    if (!Number.isFinite(ms)) return null;
    const dayBefore = new Date(ms - 24 * 60 * 60 * 1000);
    const val = historicalMarketValue(mvHistory, playerId, dayBefore);
    return (val != null && val > 0) ? val : null;
}

// Baut pro Spieltag streng rueckwirkend (nur Spiele mit day < d + Vorsaison) den
// Liga-Kontext: Ligaschnitt, Heim-/Auswaertsfaktor, Teamstaerke, zugelassene
// Gegnerpunkte sowie eine log-lineare Marktwert-zu-Punkte-Kurve fuer Neuzugaenge.
function buildPreMatchdayLeagueContexts(players, mvHistory, matchdayKickoffs, days) {
    const contexts = new Map();
    const parsedPlayers = (players || []).map(p => {
        const pid = String(p.i || p.id || '');
        const seasons = Array.isArray(p?.performance?.it) ? p.performance.it : [];
        const curSeason = seasons.length > 0 ? seasons[seasons.length - 1] : null;
        const prevSeason = seasons.length >= 2 ? seasons[seasons.length - 2] : null;
        const prevEntries = (Array.isArray(prevSeason?.ph) ? prevSeason.ph : [])
            .filter(e => e.st === 5 || (e.st === 3 && parsePlayedMinutes(e.mp) > 0) || e.st === 4);
        const curPh = Array.isArray(curSeason?.ph) ? curSeason.ph : [];
        return { pid, prevEntries, curPh };
    });

    for (const day of days) {
        const teamFor = new Map();
        const teamOpp = new Map();
        const prevTeamFor = new Map();
        const prevTeamOpp = new Map();
        let curHomeSum = 0, curHomeN = 0, curAwaySum = 0, curAwayN = 0;
        let prevHomeSum = 0, prevHomeN = 0, prevAwaySum = 0, prevAwayN = 0;
        let curAllSum = 0, curAllN = 0, prevAllSum = 0, prevAllN = 0;
        const mvSamples = [];

        for (const { pid, prevEntries, curPh } of parsedPlayers) {
            for (const e of prevEntries) {
                if (e.st !== 5 || typeof e.p !== 'number') continue;
                prevAllSum += e.p;
                prevAllN++;
                const pt = String(e.pt || '');
                const t1 = String(e.t1 || '');
                const t2 = String(e.t2 || '');
                if (pt && t1 && t2) {
                    const isHome = pt === t1;
                    const opp = isHome ? t2 : t1;
                    if (isHome) { prevHomeSum += e.p; prevHomeN++; } else { prevAwaySum += e.p; prevAwayN++; }
                    const tf = prevTeamFor.get(pt) || { sum: 0, n: 0 }; tf.sum += e.p; tf.n++; prevTeamFor.set(pt, tf);
                    const to = prevTeamOpp.get(opp) || { sum: 0, n: 0 }; to.sum += e.p; to.n++; prevTeamOpp.set(opp, to);
                }
            }
            for (const e of curPh) {
                if (typeof e.day !== 'number' || e.day >= day || e.st !== 5 || typeof e.p !== 'number') continue;
                curAllSum += e.p;
                curAllN++;
                const pt = String(e.pt || '');
                const t1 = String(e.t1 || '');
                const t2 = String(e.t2 || '');
                if (pt && t1 && t2) {
                    const isHome = pt === t1;
                    const opp = isHome ? t2 : t1;
                    if (isHome) { curHomeSum += e.p; curHomeN++; } else { curAwaySum += e.p; curAwayN++; }
                    const tf = teamFor.get(pt) || { sum: 0, n: 0 }; tf.sum += e.p; tf.n++; teamFor.set(pt, tf);
                    const to = teamOpp.get(opp) || { sum: 0, n: 0 }; to.sum += e.p; to.n++; teamOpp.set(opp, to);
                }
                const eKickoff = matchdayKickoffs.get(e.day);
                const mv = getPreMatchdayMarketValue(mvHistory, pid, eKickoff);
                if (mv && mv >= 500000) {
                    mvSamples.push({ x: Math.log10(mv / 1_000_000), y: e.p });
                }
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

        // Fuer Spieltag 1 (noch keine cur-Spiele) Vorsaison-Starter + Pre-MD1-MV fuer die MV-Kurve nutzen
        if (mvSamples.length < 80) {
            const md1Kickoff = matchdayKickoffs.get(1) || matchdayKickoffs.get(day);
            for (const { pid, prevEntries } of parsedPlayers) {
                const mv = getPreMatchdayMarketValue(mvHistory, pid, md1Kickoff);
                if (!mv || mv < 500000) continue;
                const starts = prevEntries.filter(e => e.st === 5 && typeof e.p === 'number');
                if (starts.length >= 5) {
                    const avg = starts.reduce((s, e) => s + e.p, 0) / starts.length;
                    mvSamples.push({ x: Math.log10(mv / 1_000_000), y: avg });
                }
            }
        }

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

        const predictFromMV = (mv) => {
            if (!mv || mv < 500000) return leagueMean;
            return Math.max(45, Math.min(185, mvA + mvB * Math.log10(mv / 1_000_000)));
        };

        contexts.set(day, { leagueMean, homeMult, awayMult, getTeamForAvg, getOppAllowedRatio, predictFromMV });
    }

    return contexts;
}

function loadHistoricalStartelfs(historyDir) {
    const result = new Map();
    let files = [];
    try {
        files = fs.readdirSync(historyDir).filter(f => /^startelf-md\d+\.json$/.test(f));
    } catch (e) {
        console.warn('Konnte history-Verzeichnis nicht lesen (Startelfen):', e.message);
        return result;
    }
    files.forEach(file => {
        const day = parseInt(file.match(/^startelf-md(\d+)\.json$/)[1], 10);
        try {
            const data = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
            if (data && data.managers) result.set(day, data.managers);
        } catch (e) {
            console.warn(`Konnte ${file} nicht lesen:`, e.message);
        }
    });
    return result;
}

function loadPreKickoffPlayerSnapshots(historyDir) {
    const result = new Map();
    const dir = path.join(historyDir, 'kickoff-squads');
    if (!fs.existsSync(dir)) return result;
    try {
        const files = fs.readdirSync(dir).filter(f => /^md\d+\.json$/.test(f));
        files.forEach(file => {
            const day = parseInt(file.match(/^md(\d+)\.json$/)[1], 10);
            const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            if (data && data.playerPreKickoff) {
                result.set(day, data.playerPreKickoff);
            }
        });
    } catch (e) {
        console.warn('Konnte kickoff-squads nicht lesen:', e.message);
    }
    return result;
}

// Berechnet fuer einen Spieler den rein vor-spieltaglichen Erwartungswert (xP)
// fuer Spieltag `day` - streng OHNE das Ergebnis von Spieltag `day` oder spaeter!
function estimatePreMatchdayPlayerXp(playerId, day, playerMap, preKickoffMap, leagueCtx, mvHistory, kickoffDate) {
    const pid = String(playerId);
    const player = playerMap.get(pid) || playerMap.get(playerId);
    const preSnap = preKickoffMap ? preKickoffMap[pid] : null;
    const preMV = getPreMatchdayMarketValue(mvHistory, pid, kickoffDate);

    // Spieler nicht im aktiven Bundesliga-Katalog (typischerweise 500k-Lueckenfueller
    // ohne Bundesliga-Einsaetze -> nicht pauschal 49 xP schenken!). Nur falls ein
    // echter hochpreisiger Spieler (>= 2 Mio.) spaeter aus der Liga wechselte,
    // nutzen wir einen moderaten MV-Fallback.
    if (!player) {
        if (preMV && preMV >= 2_000_000 && leagueCtx) {
            const mvPts = leagueCtx.predictFromMV(preMV);
            const pStart = 0.35;
            const expectedStartPts = pStart * mvPts;
            const expectedJokerPts = (1 - pStart) * 0.25 * PRIOR_JOKER_PTS;
            return { pStart, expectedStartPts, expectedJokerPts, expectedPoints: expectedStartPts + expectedJokerPts };
        }
        return { pStart: 0, expectedStartPts: 0, expectedJokerPts: 0, expectedPoints: 0 };
    }

    // 1. Historische Spiele VOR Spieltag `day` sammeln (aktuelle Saison day < d +
    //    unmittelbare Vorsaison als sanfter Prior fuer fruehe Spieltage).
    //    Wichtig: In aelteren Kickbase-Saisons hatte st=3 teils mp="0'" (Bank ohne Einsatz),
    //    deshalb zaehlen Einwechslungen nur bei echt gespielten Minuten (mp > 0).
    const seasons = Array.isArray(player?.performance?.it) ? player.performance.it : [];
    const curSeason = seasons.length > 0 ? seasons[seasons.length - 1] : null;
    const prevSeason = seasons.length >= 2 ? seasons[seasons.length - 2] : null;
    const prevSeasonEntries = (Array.isArray(prevSeason?.ph) ? prevSeason.ph : [])
        .filter(e => e.st === 5 || (e.st === 3 && parsePlayedMinutes(e.mp) > 0) || e.st === 4);

    const curPh = Array.isArray(curSeason?.ph) ? curSeason.ph : [];
    const curBefore = curPh
        .filter(e => typeof e.day === 'number' && e.day < day && (e.st === 5 || e.st === 3 || e.st === 4 || e.st === 1))
        .sort((a, b) => a.day - b.day);
    const matchEntry = curPh.find(e => e.day === day) || null;

    // 2. Startelf-Wahrscheinlichkeit VOR Spieltag `day`:
    //    - Falls Pre-Kickoff-Snapshot vorhanden (ab ST 11): direkt offizielle Kickbase-Prognose!
    //    - Sonst (rueckwirkend ST 1..10): Fokus auf die AKTUELLE Rolle unmittelbar vor `day`
    //      (letzte 2-3 Spiele), plus Marktwert-Signal fuer Bundesliga-Neuzugaenge ohne Historie.
    let pStart;
    if (preSnap) {
        if (typeof preSnap.st === 'number' && preSnap.st !== 0) {
            pStart = 0;
        } else if (preSnap.prob != null && Object.prototype.hasOwnProperty.call(PROB_WEIGHT_BY_CODE, Math.round(preSnap.prob))) {
            pStart = PROB_WEIGHT_BY_CODE[Math.round(preSnap.prob)];
        } else {
            pStart = PRIOR_START_PROB;
        }
    } else {
        const last3 = curBefore.slice(-3);
        const last2 = curBefore.slice(-2);
        const last1 = curBefore.slice(-1)[0];

        if (last3.length === 3 && last3.every(e => e.st === 5)) {
            pStart = 1.0;
        } else if (last2.length === 2 && last2.every(e => e.st === 5)) {
            pStart = 0.95;
        } else if (last1 && last1.st === 5) {
            const recent5 = curBefore.slice(-5);
            const fit5 = recent5.filter(e => e.st !== 1);
            const rate = fit5.length > 0 ? fit5.filter(e => e.st === 5).length / fit5.length : 0.8;
            pStart = Math.max(0.8, Math.min(0.95, 0.5 + 0.5 * rate));
        } else if (curBefore.length > 0) {
            const recent5 = curBefore.slice(-5);
            let weightedStarts = 0;
            let weightTotal = 0;
            recent5.forEach((e, idx) => {
                const w = idx >= recent5.length - 2 ? 1.6 : 1.0;
                if (e.st === 5) weightedStarts += w;
                weightTotal += w;
            });
            pStart = weightTotal > 0 ? Math.max(0, Math.min(1, weightedStarts / weightTotal)) : PRIOR_START_PROB;
        } else if (prevSeasonEntries.length > 0) {
            pStart = prevSeasonEntries.filter(e => e.st === 5).length / prevSeasonEntries.length;
        } else if (preMV) {
            // Bundesliga-Neuzugang ohne Historie (z.B. Spieltag 1): teurer Star startet fast immer, 500k-Spieler selten
            if (preMV >= 20_000_000) pStart = 0.92;
            else if (preMV >= 10_000_000) pStart = 0.82;
            else if (preMV >= 5_000_000) pStart = 0.68;
            else if (preMV < 1_500_000) pStart = 0.30;
            else pStart = PRIOR_START_PROB;
        } else {
            pStart = PRIOR_START_PROB;
        }
    }

    // 3. Erwartete Startelf-Punkte (Empirical-Bayes Shrinkage Richtung MV+Team-Prior + leichte Formgewichtung)
    const curStartPts = curBefore.filter(e => e.st === 5 && typeof e.p === 'number').map(e => e.p);
    const prevStartPts = prevSeasonEntries.filter(e => e.st === 5 && typeof e.p === 'number').map(e => e.p);

    const ownTid = matchEntry?.pt ? String(matchEntry.pt) : String(player.tid || '');
    let priorAnchor = leagueCtx ? leagueCtx.leagueMean : PRIOR_START_PTS;
    if (leagueCtx) {
        if (preMV && ownTid) {
            priorAnchor = 0.7 * leagueCtx.predictFromMV(preMV) + 0.3 * leagueCtx.getTeamForAvg(ownTid);
        } else if (preMV) {
            priorAnchor = leagueCtx.predictFromMV(preMV);
        } else if (ownTid) {
            priorAnchor = leagueCtx.getTeamForAvg(ownTid);
        }
    }

    let startPtsSum = XP_SHRINKAGE_WEIGHT * priorAnchor;
    let startPtsWeight = XP_SHRINKAGE_WEIGHT;
    if (prevStartPts.length > 0) {
        const prevAvg = prevStartPts.reduce((a, b) => a + b, 0) / prevStartPts.length;
        const wPrev = curStartPts.length >= 5 ? 0.5 : Math.min(2, prevStartPts.length * 0.2);
        startPtsSum += wPrev * prevAvg;
        startPtsWeight += wPrev;
    }
    curStartPts.forEach((p, idx) => {
        const recencyW = Math.pow(XP_RECENCY_DECAY, curStartPts.length - 1 - idx);
        startPtsSum += recencyW * p;
        startPtsWeight += recencyW;
    });
    let avgStartPts = Math.max(0, startPtsSum / startPtsWeight);

    // 4. Matchup-Anpassung (Heim/Auswaerts * Gegnerstaerke - rein aus Spielplan & Spielen < day!)
    if (leagueCtx && matchEntry && matchEntry.pt && matchEntry.t1 && matchEntry.t2) {
        const pt = String(matchEntry.pt);
        const t1 = String(matchEntry.t1);
        const t2 = String(matchEntry.t2);
        const isHome = pt === t1;
        const oppTid = isHome ? t2 : t1;
        const haMult = isHome ? leagueCtx.homeMult : leagueCtx.awayMult;
        const oppMult = leagueCtx.getOppAllowedRatio(oppTid);
        avgStartPts *= haMult * oppMult;
    }

    // 5. Empirische Joker-Quote & Joker-Punkte aus Nicht-Startelf-Spielen VOR `day`
    const allBefore = [...prevSeasonEntries.slice(-8), ...curBefore];
    const subEntries = allBefore.filter(e => e.st === 3 && parsePlayedMinutes(e.mp) > 0 && typeof e.p === 'number');
    const unusedEntries = allBefore.filter(e => e.st === 4 || (e.st === 3 && parsePlayedMinutes(e.mp) === 0));
    const nonStartGames = subEntries.length + unusedEntries.length;

    const pJoker = nonStartGames >= 2
        ? (subEntries.length + 0.5) / (nonStartGames + 1.5)
        : 0.3;

    let jokerPtsSum = 1.0 * PRIOR_JOKER_PTS;
    let jokerPtsWeight = 1.0;
    subEntries.forEach(e => {
        jokerPtsSum += Math.max(-10, Math.min(120, e.p));
        jokerPtsWeight += 1;
    });
    const avgSubPts = Math.max(0, jokerPtsSum / jokerPtsWeight);

    const expectedStartPts = pStart * avgStartPts;
    const expectedJokerPts = (1 - pStart) * pJoker * avgSubPts;
    const expectedPoints = Math.max(0, expectedStartPts + expectedJokerPts);

    return { pStart, expectedStartPts, expectedJokerPts, expectedPoints };
}

function evaluateHistoricalLineups(uid, startelfByDay, preKickoffByDay, playerMap, xpLeagueCtxByDay, mvHistory, matchdayKickoffs) {
    const days = [...startelfByDay.keys()].sort((a, b) => a - b);
    const breakdown = [];

    for (const day of days) {
        const mgrEntry = startelfByDay.get(day)?.[String(uid)];
        if (!mgrEntry || !Array.isArray(mgrEntry.lineup)) continue;

        const preSnap = preKickoffByDay.get(day) || null;
        const leagueCtx = xpLeagueCtxByDay ? xpLeagueCtxByDay.get(day) : null;
        const kickoffDate = matchdayKickoffs ? matchdayKickoffs.get(day) : null;
        const lineup = mgrEntry.lineup;
        const actualPoints = typeof mgrEntry.pointsMatchday === 'number' ? mgrEntry.pointsMatchday : null;
        const rawLineupSum = lineup.reduce((s, p) => s + (p.points || 0), 0);
        const missingSlots = Math.max(0, 11 - lineup.length);

        // Regel-Fall 1: Im-Minus-Spieltag (Kickbase vergibt 0 Punkte trotz 11er-u.lp,
        // weil das Budget am Freitag 20:30 negativ war -> nicht punkteberechtigt -> 0 xP).
        const isNegativeBudgetDay =
            lineup.length > 0 &&
            actualPoints === 0 &&
            Math.abs(rawLineupSum - missingSlots * 100) >= 50;

        // Regel-Fall 2: Echte leere Positionen (< 11 Spieler aufgestellt -> Kickbase
        // zieht deterministisch -100 Pkt pro leerem Slot ab). Gegenpruefung gegen
        // rawLineupSum verhindert Fehl-Abzuege, falls mal ein aus der Liga wechselnder
        // Spieler im u.lp fehlte (wie bei Marci).
        const confirmedEmptySlots =
            !isNegativeBudgetDay &&
            lineup.length > 0 &&
            missingSlots > 0 &&
            actualPoints != null &&
            actualPoints <= rawLineupSum - missingSlots * 100 + 25
                ? missingSlots
                : 0;

        let expectedPts = 0;
        let jokerPts = 0;
        let startProbSum = 0;
        let likelyStarters = 0;

        if (!isNegativeBudgetDay) {
            for (const p of lineup) {
                const prof = estimatePreMatchdayPlayerXp(p.id, day, playerMap, preSnap, leagueCtx, mvHistory, kickoffDate);
                expectedPts += prof.expectedPoints;
                jokerPts += prof.expectedJokerPts;
                startProbSum += prof.pStart;
                if (prof.pStart >= 0.75) likelyStarters++;
            }
            if (confirmedEmptySlots > 0) {
                expectedPts -= confirmedEmptySlots * 100;
            }
        }

        // Durchschnitt ueber 11 Slots (fehlende Slots / Im-Minus-Spieltage zaehlen als 0 Startelf-Chance)
        const avgStartProb = isNegativeBudgetDay ? 0 : (startProbSum / 11);

        breakdown.push({
            day,
            lineupSize: lineup.length,
            missingSlots: confirmedEmptySlots,
            isNegativeBudgetDay,
            expectedPoints: Math.round(expectedPts),
            jokerExpectedPoints: Math.round(jokerPts),
            avgStartProbability: avgStartProb,
            likelyStarters,
            usedOfficialPreProb: Boolean(preSnap),
            actualPoints,
        });
    }

    if (breakdown.length === 0) return null;

    const n = breakdown.length;
    const avgExpectedPoints = breakdown.reduce((s, b) => s + b.expectedPoints, 0) / n;
    const avgJokerPoints = breakdown.reduce((s, b) => s + b.jokerExpectedPoints, 0) / n;
    const avgStartProbability = breakdown.reduce((s, b) => s + b.avgStartProbability, 0) / n;
    const avgLikelyStarters = breakdown.reduce((s, b) => s + b.likelyStarters, 0) / n;
    const actuals = breakdown.filter(b => b.actualPoints != null).map(b => b.actualPoints);
    const avgActualPoints = actuals.length > 0 ? actuals.reduce((a, b) => a + b, 0) / actuals.length : null;
    const totalMissingSlots = breakdown.reduce((s, b) => s + b.missingSlots, 0);
    const negativeBudgetDays = breakdown.filter(b => b.isNegativeBudgetDay).length;

    return {
        matchdaysEvaluated: n,
        expectedLineupPoints: Math.round(avgExpectedPoints),
        jokerExpectedPoints: Math.round(avgJokerPoints),
        avgStartProbability,
        avgLikelyStarters: Math.round(avgLikelyStarters * 10) / 10,
        avgActualPoints: avgActualPoints != null ? Math.round(avgActualPoints) : null,
        totalMissingSlots,
        negativeBudgetDays,
        strengthScore: avgExpectedPoints,
        breakdown,
    };
}

// --- Verkaufs-Timing (7-Tage-Perspektive vor & nach Verkauf) ---
// Bewertet jeden freiwilligen Verkauf (ohne 250-Pkt-Zwangsverkaeufe):
// - Fiel der Marktwert in den 7 Tagen NACH dem Verkauf? -> Rechtzeitig verkauft (+)
// - Stieg der Marktwert in den 7 Tagen NACH dem Verkauf weiter? -> Zu frueh verkauft (-)
// - War der Marktwert schon in den 7 Tagen VOR dem Verkauf stark gefallen (>=5%)
//   und der Trade schloss im Minus ab? -> Zu spaet reagiert (leichter Malus)
const SALE_TIMING_LOOKAHEAD_DAYS = 7;

function evaluateSaleTiming(mvHistory, playerId, saleDate, tradeProfit) {
    const entries = mvHistory.get(String(playerId));
    if (!entries || entries.length === 0) return null;

    const saleTime = new Date(saleDate).getTime();
    if (!Number.isFinite(saleTime)) return null;

    const saleDateStr = new Date(saleTime).toISOString().slice(0, 10);
    const valueAtSale = lookupValueOnOrBefore(entries, saleDateStr);
    if (valueAtSale == null || valueAtSale <= 0) return null;

    const targetAfterStr = new Date(saleTime + SALE_TIMING_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
    const targetBeforeStr = new Date(saleTime - SALE_TIMING_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);

    // Marktwert ~7 Tage NACH dem Verkauf (oder neuester verfuegbarer danach)
    let valueInWindow = null;
    let valueAfterSale = null;
    for (const [d, mv] of entries) {
        if (mv == null || d <= saleDateStr) continue;
        valueAfterSale = mv;
        if (d <= targetAfterStr) valueInWindow = mv;
    }
    const laterValue = valueInWindow != null ? valueInWindow : valueAfterSale;
    if (laterValue == null || laterValue <= 0) return null;

    // Marktwert ~7 Tage VOR dem Verkauf (fuer "zu spaet verkauft"-Erkennung)
    const valueBefore = lookupValueOnOrBefore(entries, targetBeforeStr);
    const preChangePct = (valueBefore != null && valueBefore > 0)
        ? (valueAtSale - valueBefore) / valueBefore
        : 0;

    const postDeltaEur = laterValue - valueAtSale;
    const postChangePct = postDeltaEur / valueAtSale;
    const postWisdomEur = -postDeltaEur; // positiv = Wertverlust nach Verkauf vermieden
    const clampedPostWisdomPct = Math.max(-0.35, Math.min(0.35, -postChangePct));

    // Klassifizierung fuer transparente Aufschluesselung (7 Tage vor & nach Verkauf + Trade-Profit):
    // - Zu spaet: Spieler war in den 7 Tagen VOR dem Verkauf bereits stark im Fall (>=5%)
    //   und der Trade ging ins Minus -> spaeter Notverkauf darf nicht als "Peak-Exit" belohnt werden.
    // - Zu frueh: Spieler stieg in den 7 Tagen NACH dem Verkauf weiter (>+1%).
    // - Rechtzeitig: Spieler fiel in den 7 Tagen NACH dem Verkauf (<0%) ohne vorherigen Absturz-Verlust.
    const isTooLate = preChangePct <= -0.05 && typeof tradeProfit === 'number' && tradeProfit < 0;
    const isTooEarly = postChangePct > 0.01 && !isTooLate;
    const isGoodExit = postChangePct < 0 && !isTooLate;

    let timingScorePct;
    if (isTooLate) {
        // Absturz vor dem Verkauf wird als Malus gewertet (gedeckelt auf -25%)
        timingScorePct = Math.max(-0.25, preChangePct);
    } else if (isTooEarly) {
        // Weiter gestiegen nach Verkauf -> negativ (Gewinn liegengelassen)
        timingScorePct = clampedPostWisdomPct;
    } else if (isGoodExit) {
        // Rechtzeitig im Plus ausgestiegen zaehlt voll; frueher Stop-Loss im Minus zur Haelfte
        timingScorePct = (typeof tradeProfit === 'number' && tradeProfit < 0)
            ? clampedPostWisdomPct * 0.5
            : clampedPostWisdomPct;
    } else {
        timingScorePct = 0;
    }

    return {
        postWisdomEur,
        postChangePct,
        preChangePct,
        timingScorePct,
        category: isTooLate ? 'tooLate' : isTooEarly ? 'tooEarly' : isGoodExit ? 'goodExit' : 'neutral',
    };
}

function getCurrentSeasonPerformance(player) {
    const seasons = player && player.performance && player.performance.it;
    if (!Array.isArray(seasons) || seasons.length === 0) return null;
    return seasons[seasons.length - 1]; // letzter Eintrag = aktuelle Saison
}

// Prüft, ob ein Verkauf plausibel durch die 250-Punkte-Zwangsverkaufsregel ausgelöst wurde:
// Der Spieler muss in einem Spieltag VOR (oder am selben Tag wie) dem Verkauf mindestens
// FORCED_SALE_POINTS_THRESHOLD Punkte geholt haben, und der Verkauf muss innerhalb des
// Zeitfensters danach liegen. Wir können nicht prüfen, ob der Spieler in der Startelf
// stand - das ist eine bewusste, konservative Vereinfachung (lieber ein paar echte
// Trades fälschlich als "erzwungen" werten, als Zwangsverkäufe als Trading-Genie zu feiern).
function findForcedSaleTrigger(player, saleDate) {
    const season = getCurrentSeasonPerformance(player);
    if (!season || !Array.isArray(season.ph)) return null;

    const saleTime = saleDate.getTime();
    if (!Number.isFinite(saleTime)) return null;
    const windowMs = FORCED_SALE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    let trigger = null;
    for (const entry of season.ph) {
        if (typeof entry.p !== 'number' || entry.p < FORCED_SALE_POINTS_THRESHOLD) continue;
        if (!entry.md) continue;
        const matchTime = new Date(entry.md).getTime();
        if (!Number.isFinite(matchTime)) continue;

        const diff = saleTime - matchTime;
        if (diff >= 0 && diff <= windowMs) {
            if (!trigger || entry.p > trigger.points) {
                trigger = { points: entry.p, day: entry.day, matchDate: entry.md };
            }
        }
    }
    return trigger;
}

// --- FIFA-Karten-Attribute (0-99, wie PAC/SHO/PAS/DRI/DEF/PHY) ---
// Streckt die bestehenden Bonus-/Malus-Werte (die urspruenglich fuer die
// 50±x-Score-Formel gedacht waren) auf eine 1-99-Skala, wie man sie von
// FIFA/FC-Spielerkarten kennt. NEUTRAL_CARD_SCORE ist der Fallback-Wert,
// wenn fuer eine Kategorie schlicht keine Datenbasis existiert (z.B. noch
// keine Trades) - lieber ein neutraler Mittelwert als eine irrefuehrende 0.
const NEUTRAL_CARD_SCORE = 50;

function clampCardScore(val) {
    if (!Number.isFinite(val)) return NEUTRAL_CARD_SCORE;
    return Math.max(1, Math.min(99, Math.round(val)));
}

// Prozentrang (0-100) einer Metrik unter echten Liga-Kollegen: "wie viel
// Prozent der eigenen Liga liegen bei dieser Metrik schlechter?" - genutzt
// fuer OVP und AKT, weil "aktiv" oder "diszipliniert beim Einkauf" stark von
// der jeweiligen Liga-Kultur abhaengt, statt an einem global fixen Referenz-
// wert festgemacht zu werden. higherIsBetter=false dreht die Richtung um
// (z.B. bei Overpay ist WENIGER Aufschlag besser). Gleiche Werte teilen sich
// ihren Rang fair (Mittelrang-Methode); bei nur einem Vergleichswert (Liga
// mit 1 Mitglied) gibt es keinen sinnvollen Rang -> neutral 50.
function percentileRank(value, allValues, higherIsBetter = true) {
    if (!Number.isFinite(value) || allValues.length === 0) return null;
    if (allValues.length === 1) return 50;
    let worseCount = 0;
    let equalCount = 0;
    allValues.forEach(v => {
        if (higherIsBetter ? v < value : v > value) worseCount++;
        else if (v === value) equalCount++;
    });
    return ((worseCount + equalCount / 2) / allValues.length) * 100;
}

// PRO (Profit): liga-relativ statt fixer -20..+25-Streckung (Owner-Vorgabe
// 29.08.2026, "auch fuer die anderen Werte" - siehe OVP/PKT/AKT). Bleibt im
// ersten Durchlauf neutral (Platzhalter), da der Liga-Vergleich erst nach
// allen Liga-Mitgliedern moeglich ist - final gesetzt im zweiten Durchlauf
// (siehe computeLeagueRelativeScore, Ende von run()).
function computeProScore(hasWeightedTrades) {
    if (!hasWeightedTrades) return NEUTRAL_CARD_SCORE;
    return NEUTRAL_CARD_SCORE;
}

// OVP (Overpay-Disziplin): Prozentrang unter den Liga-Kollegen (weniger
// Aufschlag als andere = besser) statt eines fixen Referenzwerts - wird erst
// NACH der Liga-weiten Vergleichsrunde (siehe run(), zweiter Durchlauf) final
// gesetzt, weil dafuer alle Liga-Mitglieder bekannt sein muessen.
// Kalibrierung (Owner-Vorgabe 29.08.2026, identisch fuer alle liga-relativen
// Kartenwerte): Liga-Durchschnitt (~Median, Prozentrang 50) ergibt 75, "schlecht"
// (weit unter Liga-Niveau) ~50 - 50 ist schon schlecht -, der beste Manager der
// Liga erreicht 99. Damit verlaesst kein Wert mehr den Rahmen 50-99.
function computeOvpScore(percentile) {
    if (percentile == null) return NEUTRAL_CARD_SCORE;
    return clampCardScore(51 + (percentile / 100) * 48);
}

// PKT (Punkte pro Million): ppm ab 0 - der Score wird NICHT mehr an einer fixen
// Schwelle (~3) gemessen, sondern dynamisch am Liga-Mittelwert des jeweiligen
// Managers ausgerichtet (Owner-Vorgabe 29.08.2026, bestätigt "Go"). Da der
// Liga-Mittelwert erst bekannt ist, wenn alle Liga-Mitglieder gerechnet wurden,
// bleibt PKT im ersten Durchlauf neutral (Platzhalter) und wird - wie OVP und
// AKT - im zweiten Durchlauf final gesetzt (siehe Ende von run()).
function computePktScore(ppm, hasPoints) {
    if (!hasPoints) return NEUTRAL_CARD_SCORE;
    return NEUTRAL_CARD_SCORE;
}

// PKT final: ppm im Verhaeltnis zum Liga-Mittelwert (statt fix ~3). Kalibrierung
// laut Owner-Vorgabe 29.08.2026: Liga-Durchschnitt (Verhaeltnis 1) ergibt 75,
// die Haelfte des Liga-Mittelwerts ergibt 50 ("50 ist schon schlecht"), das
// Doppelte ergibt 99 (Saettigung). So misst die Karte, wie stark man relativ zu
// den eigenen Liga-Kollegen spielt, statt an einem globalen Fixwert. Wie AKT ist
// der Score auf 50-99 gefloort: kein Wert verlaesst den Rahmen 50-99, schlechte
// PPM (Verhaeltnis < 0.5) landet am gewollten Boden 50 statt darunter.
function computePktScoreFromMean(ppm, leagueMeanPpm) {
    if (!(ppm > 0) || !(leagueMeanPpm > 0)) return NEUTRAL_CARD_SCORE;
    return clampCardScore(Math.max(50, 25 + 50 * (ppm / leagueMeanPpm)));
}

// AKT (Marktaktivitaet): Glockenkurve statt linearem Prozentrang (Owner-Vorgabe
// 29.08.2026). Basis ist die Transaktionszahl pro Manager (Kaeufe+Verkaufe),
// log-transformiert (log(x+1)) gegen die Rechtsschiefe vieler Einzel-Transaktionen.
// Pro Liga wird der z-Score gegen Mittelwert/Streuung der Liga gebildet und per
// tanh auf eine Glockenkurve mit Peak 75 (Liga-Durchschnitt, z=0) und den
// Saettigungsgrenzen 50 (sehr wenig gehandelt, z->-inf) bis 99 (sehr viel
// gehandelt, z->+inf) abgebildet - final gesetzt im zweiten Durchlauf.
function computeAktScore(zScore) {
    if (!Number.isFinite(zScore)) return NEUTRAL_CARD_SCORE;
    return Math.max(50, Math.min(99, Math.round(74.5 + 24.5 * Math.tanh(zScore))));
}

// Gemeinsame Glockenkurve fuer PRO/KAD/TIM (Owner-Vorgabe 29.08.2026, gleiches
// Muster wie AKT: Z-Score gegen Liga-Mittelwert/Streuung, tanh-Mapping auf
// 50-99, Peak 75 = Liga-Durchschnitt). Eigene Funktion statt drei identischer
// Kopien - bewusst getrennt von computeAktScore, um den dort bereits
// gereviewten Code nicht anzufassen (gleiche Formel, kein Verhaltensunterschied).
function computeLeagueRelativeScore(zScore) {
    if (!Number.isFinite(zScore)) return NEUTRAL_CARD_SCORE;
    return Math.max(50, Math.min(99, Math.round(74.5 + 24.5 * Math.tanh(zScore))));
}

// KAD (Kaderstaerke & Risiko): liga-relativ statt fixer 20-99-Streckung
// (Owner-Vorgabe 29.08.2026). Bleibt im ersten Durchlauf neutral, final im
// zweiten Durchlauf (siehe computeLeagueRelativeScore, Ende von run()).
function computeKadScore(squadReadiness, squadRiskPenalty) {
    if (squadReadiness === null) return NEUTRAL_CARD_SCORE;
    return NEUTRAL_CARD_SCORE;
}

// TIM (Verkaufsgespuer): liga-relativ statt fixer tanh-Streckung um einen
// globalen Fixwert (Owner-Vorgabe 29.08.2026). Bleibt im ersten Durchlauf
// neutral, final im zweiten Durchlauf (siehe computeLeagueRelativeScore,
// Ende von run()).
function computeTimScore(saleTimingProfit, saleTimingSampleSize) {
    if (saleTimingSampleSize <= 0) return NEUTRAL_CARD_SCORE;
    return NEUTRAL_CARD_SCORE;
}

// Kartenstufe (Bronze/Silber/Gold) aus der bestehenden 5-stufigen Bewertung
// (Amateur < Bronze < Silber < Gold < Elite) - Amateur faellt optisch mit
// Bronze zusammen, Elite mit Gold (Elite-Manager stechen weiterhin ueber den
// hoeheren Score/goldenen Glow hervor, brauchen aber keine 4. Kartenfarbe).
function computeCardTier(level) {
    if (level === 'Silber') return 'silver';
    if (level === 'Gold' || level === 'Elite') return 'gold';
    return 'bronze';
}

// Kurzform der Liga fuer den "Position"-Slot der FIFA-Karte (z.B. "LIGA 1" ->
// "L1"). Faellt auf die ersten beiden Buchstaben zurueck, falls der Liganame
// mal keine Nummer enthaelt.
function leagueCode(leagueName) {
    if (!leagueName) return '';
    const num = leagueName.match(/\d+/);
    if (num) return `L${num[0]}`;
    return leagueName.slice(0, 2).toUpperCase();
}

function loadExcludedManagerNames() {
    const excludedPath = path.join(__dirname, '../technical-accounts.json');
    try {
        if (fs.existsSync(excludedPath)) {
            return JSON.parse(fs.readFileSync(excludedPath, 'utf8')).excludedNames || [];
        }
    } catch (e) {
        console.warn('Konnte technical-accounts.json nicht lesen:', e.message);
    }
    return [];
}

// Der Trading Advisor (backend/advisor/run_advisor.py) speichert die taegliche
// 365-Tage-Marktwert-Historie aller Bundesliga-Spieler in
// frontend/public/player-history.json (Format: { playerId: [[date, mv, pts], ...] }).
// Frueher lag diese Historie direkt in advisor-data.json - wir laden primaer
// player-history.json und nutzen advisor-data.json nur noch als Fallback.
function loadMarketValueHistory() {
    const historyPath = path.join(__dirname, '../../frontend/public/player-history.json');
    const advisorPath = path.join(__dirname, '../../frontend/public/advisor-data.json');
    const map = new Map();
    try {
        if (fs.existsSync(historyPath)) {
            const ph = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            Object.entries(ph || {}).forEach(([pid, entries]) => {
                if (Array.isArray(entries) && entries.length > 0) {
                    map.set(String(pid), entries);
                }
            });
        }
    } catch (e) {
        console.warn('Konnte player-history.json nicht lesen (historische Marktwerte):', e.message);
    }
    try {
        if (fs.existsSync(advisorPath)) {
            const advisorData = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));
            (advisorData.players || []).forEach(p => {
                if (p.playerId != null && Array.isArray(p.history) && p.history.length > 0 && !map.has(String(p.playerId))) {
                    map.set(String(p.playerId), p.history);
                }
            });
        }
    } catch (e) {
        console.warn('Konnte advisor-data.json nicht lesen (historische Marktwerte):', e.message);
    }
    console.log(`Historische Marktwert-Kurven geladen: ${map.size} Spieler.`);
    return map;
}

// Marktwert aus einer (aufsteigend sortierten) Historie [[date, mv, points], ...] zu
// einem Datum: der letzte bekannte Wert AM ODER VOR diesem Datum. Liegt das
// Zieldatum vor dem gesamten Fenster, wird der älteste bekannte Wert genommen.
function lookupValueOnOrBefore(entries, dateStr) {
    let best = null;
    for (const [d, mv] of entries) {
        if (mv == null) continue;
        if (d <= dateStr) best = mv;
        else break;
    }
    if (best === null) {
        const first = entries.find(([, mv]) => mv != null);
        best = first ? first[1] : null;
    }
    return best;
}

// Marktwert eines Spielers an einem bestimmten Datum, falls innerhalb des
// 60-Tage-Fensters der Advisor-Historie vorhanden - sonst null (Aufrufer muss dann
// auf gespeicherten/aktuellen Marktwert zurückfallen).
function historicalMarketValue(mvHistory, playerId, date) {
    const entries = mvHistory.get(String(playerId));
    if (!entries || entries.length === 0) return null;
    return lookupValueOnOrBefore(entries, date.toISOString().slice(0, 10));
}

// --- PPM (Punkte pro Million) auf Basis des Kaderwerts ZUM JEWEILIGEN SPIELTAG ---
// Der Kaderwert schwankt durch Trades waehrend der Saison staendig - ein PPM auf
// Basis des HEUTIGEN Kaderwerts (oder der Investitionssumme) vergleicht Punkte,
// die ueber viele Spieltage verteilt erzielt wurden, mit einem einzigen Momentan-
// wert, der nachtraeglich durch ganz andere Trades verzerrt sein kann (Owner-
// Feedback: "Punkte pro Million muss sich immer auf den Kaderwert zum jeweiligen
// Spieltag [...] beziehen, [...] der Kaderwert steigt/sinkt ja durch Trades").
// Stattdessen: pro Spieltag das Verhaeltnis (Punkte diesen Spieltag) / (Kaderwert
// zum Freitags-/Kickoff-Cutoff DIESES Spieltags) bilden, danach den SAISON-PPM als
// Durchschnitt dieser Einzel-Verhaeltnisse (Owner-Vorgabe: "Durchschnitt der
// einzelnen Spieltags-Quotienten", nicht gepoolt).

// Liest `pointsMatchday` je Manager aus den pro Spieltag gespeicherten
// spieltag-N.json-Dateien (siehe backend/scripts/*, werden laufend aktualisiert).
// Rueckgabe: Map(spieltag -> Map(managerId -> punkteDiesenSpieltag)).
function loadMatchdayPoints(historyDir) {
    const result = new Map();
    let files = [];
    try {
        files = fs.readdirSync(historyDir).filter(f => /^spieltag-\d+\.json$/.test(f));
    } catch (e) {
        console.warn('Konnte history-Verzeichnis nicht lesen (Spieltagspunkte):', e.message);
        return result;
    }
    files.forEach(file => {
        const day = parseInt(file.match(/^spieltag-(\d+)\.json$/)[1], 10);
        try {
            const data = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
            const map = new Map();
            (data.leagues || []).forEach(l => {
                (l.users || []).forEach(u => {
                    const pts = parseInt(String(u.pointsMatchday || '0').replace(/\./g, ''), 10);
                    if (Number.isFinite(pts)) map.set(String(u.id), pts);
                });
            });
            result.set(day, map);
        } catch (e) {
            console.warn(`Konnte ${file} nicht lesen (Spieltagspunkte):`, e.message);
        }
    });
    return result;
}

// Frühester bekannter Anstoss je Spieltag, aus den Performance-Historien ALLER
// Spieler ermittelt (gleiches Prinzip wie backend/reconstructStartingEleven.js,
// "Global kickoff cutoff") - das ist der Zeitpunkt, zu dem der Kader fuer diesen
// Spieltag feststand (Transfersperre). Rueckgabe: Map(spieltag -> Zeitstempel in ms).
function computeMatchdayKickoffs(players) {
    const kickoffs = new Map();
    players.forEach(p => {
        const season = getCurrentSeasonPerformance(p);
        if (!season || !Array.isArray(season.ph)) return;
        season.ph.forEach(entry => {
            if (!entry.day || !entry.md) return;
            const t = new Date(entry.md).getTime();
            if (!Number.isFinite(t)) return;
            const cur = kickoffs.get(entry.day);
            if (cur === undefined || t < cur) kickoffs.set(entry.day, t);
        });
    });
    return kickoffs;
}

// Spult, ausgehend vom HEUTIGEN Kader (managerSquads), fuer jeden gewuenschten
// Spieltags-Cutoff-Zeitpunkt die seitdem passierten Transfers zurueck - exakt das
// gleiche Prinzip wie die Startelf-Rekonstruktion (reconstructStartingEleven.js):
// ein Kauf NACH dem Cutoff bedeutet, der Spieler war beim Kaeufer zum Cutoff noch
// NICHT im Kader (wird entfernt); ein Verkauf NACH dem Cutoff bedeutet, der
// Spieler war beim Verkaeufer zum Cutoff noch im Kader (wird wieder hinzugefuegt).
// cutoffsDesc muss nach Spieltag ABSTEIGEND sortiert sein, damit die Transfer-
// Liste nur EINMAL komplett durchlaufen werden muss (Performance).
// Rueckgabe: Map(spieltag -> Map(managerId -> Set(playerId))).
function computeHistoricalSquads(managerSquads, transfers, nameToId, cutoffsDesc) {
    const squads = new Map();
    managerSquads.forEach((info, uid) => {
        squads.set(String(uid), new Set((info.players || []).map(p => String(p.id))));
    });

    const descTransfers = [...transfers].sort((a, b) => new Date(b.date || b.d || 0) - new Date(a.date || a.d || 0));
    const result = new Map();
    let ti = 0;
    cutoffsDesc.forEach(({ day, cutoffTime }) => {
        while (ti < descTransfers.length) {
            const t = descTransfers[ti];
            const tTime = new Date(t.date || t.d || 0).getTime();
            if (!Number.isFinite(tTime) || tTime <= cutoffTime) break;

            const pId = String(t.playerId);
            let buyerId = t.buyerId || (t.buyerName && nameToId[t.buyerName.toLowerCase()]);
            let sellerId = t.sellerId || (t.sellerName && nameToId[t.sellerName.toLowerCase()]);
            if (buyerId && squads.has(String(buyerId))) squads.get(String(buyerId)).delete(pId);
            if (sellerId) {
                if (!squads.has(String(sellerId))) squads.set(String(sellerId), new Set());
                squads.get(String(sellerId)).add(pId);
            }
            ti++;
        }
        const snapshot = new Map();
        squads.forEach((set, uid) => snapshot.set(uid, new Set(set)));
        result.set(day, snapshot);
    });
    return result;
}

// Saison-PPM: Durchschnitt der Spieltags-Quotienten (Punkte diesen Spieltag /
// Kaderwert zum Cutoff dieses Spieltags, in Mio.) - nur Spieltage mit bekannten
// Punkten UND einem nicht-leeren, bewertbaren Kader fliessen ein. Liefert null,
// wenn kein einziger Spieltag ausgewertet werden konnte (z.B. brandneue Liga ohne
// Spieltagshistorie) - Aufrufer faellt dann auf die alte Methode zurueck.
function computePerMatchdayPpm(uid, matchdayDays, matchdayPoints, historicalSquads, mvHistory, currentMarketValue, kickoffs) {
    const ratios = [];
    const breakdown = [];
    matchdayDays.forEach(day => {
        const pts = matchdayPoints.get(day)?.get(String(uid));
        const squadSet = historicalSquads.get(day)?.get(String(uid));
        if (pts == null || !squadSet || squadSet.size === 0) return;

        const cutoffDate = new Date(kickoffs.get(day));
        let squadValue = 0;
        squadSet.forEach(pId => {
            const hv = historicalMarketValue(mvHistory, pId, cutoffDate);
            squadValue += (hv != null && hv > 0) ? hv : currentMarketValue(pId);
        });
        if (squadValue <= 0) return;

        const ratio = pts / (squadValue / 1_000_000);
        ratios.push(ratio);
        breakdown.push({ day, points: pts, squadValue, ratio });
    });

    if (ratios.length === 0) return null;
    const ppm = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    return { ppm, matchdaysUsed: ratios.length, breakdown };
}

function run() {
    console.log("Calculating Manager Ratings...");
    const historyDir = path.join(__dirname, '../../frontend/public/history');
    const transfersPath = path.join(historyDir, 'transfers.json');
    const allPlayersPath = path.join(historyDir, 'all_players.json');
    const dataPath = path.join(__dirname, '../../frontend/public/data.json');
    const outputPath = path.join(historyDir, 'manager-ratings.json');

    let transfers = [];
    let players = [];
    let data = {};

    try { if (fs.existsSync(transfersPath)) transfers = JSON.parse(fs.readFileSync(transfersPath, 'utf8')); } catch (e) { console.error("No transfers found"); }
    try { if (fs.existsSync(allPlayersPath)) players = JSON.parse(fs.readFileSync(allPlayersPath, 'utf8')); } catch (e) { console.error("No players found"); }
    try { if (fs.existsSync(dataPath)) data = JSON.parse(fs.readFileSync(dataPath, 'utf8')); } catch (e) { console.error("No data found"); }

    const playerMap = new Map();
    players.forEach(p => playerMap.set(p.i || p.id, p));

    const currentMarketValue = (playerId) => {
        const p = playerMap.get(playerId);
        return p ? (p.mv || p.marketValue || 0) : 0;
    };

    const playerName = (playerId) => {
        const p = playerMap.get(playerId);
        return p ? `${p.fn || ''} ${p.ln || p.n || ''}`.trim() : String(playerId);
    };

    const mvHistory = loadMarketValueHistory();
    const managerSquads = loadManagerSquads();
    const managerSquadValues = loadManagerSquadValues();
    const startelfByDay = loadHistoricalStartelfs(historyDir);
    const preKickoffByDay = loadPreKickoffPlayerSnapshots(historyDir);
    console.log(`Historische Startelfen geladen: ${startelfByDay.size} Spieltage (Pre-Kickoff-Prognosen: ${preKickoffByDay.size}).`);

    // Referenzwert für "Marktwert zum Zeitpunkt X": bevorzugt die ECHTE Historie aus dem
    // Trading Advisor, danach ein evtl. gespeicherter Snapshot am Transfer selbst,
    // zuletzt der aktuelle Marktwert als letzter Ausweg.
    const referenceMarketValue = (playerId, date, storedSnapshot) => {
        const historical = historicalMarketValue(mvHistory, playerId, date);
        if (historical != null && historical > 0) return historical;
        if (storedSnapshot > 0) return storedSnapshot;
        return currentMarketValue(playerId);
    };

    // Technische Accounts (z.B. "Admin" - der Kickbase-Login, der nur zum Datenabruf
    // dient) sind keine echten Manager und dürfen nirgends im Rating auftauchen.
    const excludedManagerNames = loadExcludedManagerNames();
    const isRealManager = (u) => !excludedManagerNames.includes(u.name);

    // Mapping: Name -> ID
    const nameToId = {};
    if (data.leagues) {
        data.leagues.forEach(l => {
            l.users.filter(isRealManager).forEach(u => {
                const uid = u.id || u.i;
                nameToId[u.name.toLowerCase()] = uid;
            });
        });
    }

    // Fuer den neuen spieltagsbasierten PPM (siehe computePerMatchdayPpm): Punkte
    // je Spieltag, frühester Anstoss je Spieltag (Cutoff), und daraus der Kader
    // JEDES Managers zu JEDEM dieser Cutoffs (rueckgerechnet aus dem heutigen
    // Kader + Transferhistorie - gleiches Prinzip wie die Startelf-Rekonstruktion).
    const matchdayPoints = loadMatchdayPoints(historyDir);
    const matchdayKickoffs = computeMatchdayKickoffs(players);
    const xpLeagueCtxByDay = buildPreMatchdayLeagueContexts(players, mvHistory, matchdayKickoffs, [...startelfByDay.keys()]);
    const matchdayDays = [...matchdayPoints.keys()].filter(d => matchdayKickoffs.has(d)).sort((a, b) => a - b);
    const matchdayCutoffsDesc = matchdayDays
        .map(day => ({ day, cutoffTime: matchdayKickoffs.get(day) }))
        .sort((a, b) => b.day - a.day);
    const historicalSquads = computeHistoricalSquads(managerSquads, transfers, nameToId, matchdayCutoffsDesc);

    // Map: userId -> { buys: [...], sells: [...] }
    const userTrades = {};

    // Transfers nach Datum aufsteigend sortieren (wichtig fürs FIFO-Matching)
    transfers.sort((a, b) => new Date(a.date || a.d || 0) - new Date(b.date || b.d || 0));

    transfers.forEach(t => {
        let buyerId = t.buyerId;
        let sellerId = t.sellerId;

        if (!buyerId && t.buyerName) buyerId = nameToId[t.buyerName.toLowerCase()];
        if (!sellerId && t.sellerName) sellerId = nameToId[t.sellerName.toLowerCase()];

        const playerId = t.playerId;
        const price = t.price || 0;
        const date = new Date(t.date || t.d || 0);
        const marketValue = t.marketValueAtTimeOfTransfer || 0;

        if (buyerId && playerId) {
            if (!userTrades[buyerId]) userTrades[buyerId] = { buys: [], sells: [] };
            userTrades[buyerId].buys.push({ playerId, price, date, marketValue });
        }
        if (sellerId && playerId) {
            if (!userTrades[sellerId]) userTrades[sellerId] = { buys: [], sells: [] };
            userTrades[sellerId].sells.push({ playerId, price, date, marketValue });
        }
    });

    const ratings = {};

    if (data.leagues) {
        data.leagues.forEach(l => {
            l.users.filter(isRealManager).forEach(u => {
                const uid = u.id || u.i;
                const trades = userTrades[uid] || { buys: [], sells: [] };

                let totalSpent = 0;
                let totalEarned = 0;

                // Für das Overpay-Tracking (Käufe liegen wegen Underpay-Verbot immer >= Marktwert)
                let totalOverpay = 0;
                const overpayRatios = [];

                // Realisierte Trades: Kauf + späterer Verkauf desselben Spielers (FIFO)
                let completedTrades = 0;
                let forcedCompletedTrades = 0;
                let realizedProfit = 0;
                let forcedRealizedProfit = 0;

                // Kaderverkäufe ohne bekannten Einstandspreis (zu Saisonbeginn zugelost)
                let orphanSales = 0;
                let orphanSaleProfit = 0;
                let forcedOrphanSales = 0;

                // Noch offene Positionen (gekauft, noch nicht verkauft) -> unrealisiert
                let openPositions = 0;
                let unrealizedProfit = 0;

                // Für das Scoring: gewichteter Gesamtgewinn / gewichtete Trade-Anzahl
                let weightedProfitSum = 0;
                let weightedTradeWeight = 0;

                // Verkaufs-Timing (7-Tage-Perspektive vor & nach Verkauf, ohne Zwangsverkaeufe)
                let saleTimingProfit = 0;
                let saleTimingPctSum = 0;
                let saleTimingSampleSize = 0;
                let goodExits = 0;
                let tooEarlyExits = 0;
                let tooLateExits = 0;
                let neutralExits = 0;

                const recordTiming = (timing) => {
                    if (!timing) return;
                    saleTimingProfit += timing.postWisdomEur;
                    saleTimingPctSum += timing.timingScorePct;
                    saleTimingSampleSize++;
                    if (timing.category === 'goodExit') goodExits++;
                    else if (timing.category === 'tooEarly') tooEarlyExits++;
                    else if (timing.category === 'tooLate') tooLateExits++;
                    else neutralExits++;
                };

                // Für Top und Flop (über alle Kategorien hinweg, mit Kennzeichnung)
                let bestTrade = { name: '-', profit: 0, type: null, forced: false };
                let worstTrade = { name: '-', profit: 0, type: null, forced: false };

                const considerForTopFlop = (name, profit, type, forced) => {
                    if (profit > bestTrade.profit) bestTrade = { name, profit, type, forced };
                    if (profit < worstTrade.profit || (worstTrade.profit === 0 && profit < 0)) {
                        worstTrade = { name, profit, type, forced };
                    }
                };

                // 1. Käufe in Bestands-Inventar einsortieren + Overpay tracken
                //
                // Referenz ist der ECHTE Marktwert am Kauftag aus der Trading-Advisor-
                // Historie (siehe referenceMarketValue). Nur wenn der Spieler außerhalb
                // des 60-Tage-Fensters liegt oder kein Marktspieler ist, greift der
                // Fallback auf einen gespeicherten Snapshot bzw. den aktuellen Marktwert.
                const inventory = {};
                trades.buys.forEach(b => {
                    if (!inventory[b.playerId]) inventory[b.playerId] = [];
                    inventory[b.playerId].push(b);
                    totalSpent += b.price;

                    // Fuer Overpay NUR echte historische Referenz am Kauftag nutzen
                    // (player-history.json oder gespeicherter Snapshot am Transfer) -
                    // NIEMALS gegen den heutigen Marktwert vergleichen, da sonst Monate
                    // alte Kaeufe massiv verzerrt werden.
                    const historical = historicalMarketValue(mvHistory, b.playerId, b.date);
                    const referenceValue = (historical != null && historical > 0)
                        ? historical
                        : (b.marketValue > 0 ? b.marketValue : 0);
                    if (referenceValue > 0) {
                        const overpay = b.price - referenceValue;
                        if (overpay > 0) totalOverpay += overpay;
                        overpayRatios.push(overpay / referenceValue);
                    }
                });

                // 2. Verkäufe verarbeiten: entweder abgeschlossener Trade (FIFO-Match)
                //    oder Kaderverkauf ohne bekannten Einstandspreis
                trades.sells.forEach(s => {
                    totalEarned += s.price;
                    const name = playerName(s.playerId);

                    if (inventory[s.playerId] && inventory[s.playerId].length > 0) {
                        const b = inventory[s.playerId].shift(); // FIFO
                        const profit = s.price - b.price;
                        const forcedTrigger = findForcedSaleTrigger(playerMap.get(s.playerId), s.date);
                        const forced = !!forcedTrigger;
                        const weight = forced ? SCORE_WEIGHTS.forcedRealized : SCORE_WEIGHTS.realized;

                        realizedProfit += profit;
                        if (forced) forcedRealizedProfit += profit;
                        completedTrades++;
                        if (forced) forcedCompletedTrades++;

                        weightedProfitSum += profit * weight;
                        weightedTradeWeight += weight;

                        // Nur freiwillige Verkaeufe (keine 250-Pkt-Zwangsverkaeufe) ins Timing-Rating
                        if (!forced) {
                            recordTiming(evaluateSaleTiming(mvHistory, s.playerId, s.date, profit));
                        }

                        considerForTopFlop(name, profit, 'realized', forced);
                    } else {
                        // Kein bekannter Kauf -> Spieler kam vermutlich aus der Saison-Auslosung.
                        const referenceValue = referenceMarketValue(s.playerId, s.date, s.marketValue);
                        const profit = referenceValue > 0 ? (s.price - referenceValue) : 0;
                        const forcedTrigger = findForcedSaleTrigger(playerMap.get(s.playerId), s.date);
                        const forced = !!forcedTrigger;
                        const weight = forced ? SCORE_WEIGHTS.forcedOrphanSale : SCORE_WEIGHTS.orphanSale;

                        orphanSales++;
                        if (forced) forcedOrphanSales++;
                        orphanSaleProfit += profit;
                        weightedProfitSum += profit * weight;
                        weightedTradeWeight += weight;

                        if (!forced) {
                            recordTiming(evaluateSaleTiming(mvHistory, s.playerId, s.date, profit));
                        }

                        considerForTopFlop(name, profit, 'orphan', forced);
                    }
                });

                // 3. Was übrig bleibt im Inventar, sind offene Positionen (noch nicht verkauft).
                // Je frischer der Kauf, desto weniger zählt der aktuelle Buchgewinn/-verlust
                // für den Score (siehe openPositionConfidence) - die Anzeige-Summe bleibt exakt.
                let openPositionAgeSum = 0;
                Object.values(inventory).forEach(queue => {
                    queue.forEach(b => {
                        const mv = currentMarketValue(b.playerId);
                        const profit = mv > 0 ? (mv - b.price) : 0;
                        const confidence = openPositionConfidence(b.date);
                        const daysHeld = (Date.now() - new Date(b.date).getTime()) / (1000 * 60 * 60 * 24);

                        openPositions++;
                        openPositionAgeSum += Math.max(0, daysHeld);
                        unrealizedProfit += profit;
                        weightedProfitSum += profit * SCORE_WEIGHTS.unrealized * confidence;
                        weightedTradeWeight += SCORE_WEIGHTS.unrealized * confidence;

                        considerForTopFlop(playerName(b.playerId), profit, 'open', false);
                    });
                });
                const openPositionsAvgAgeDays = openPositions > 0 ? openPositionAgeSum / openPositions : 0;

                const totalTransactions = trades.buys.length + trades.sells.length;
                // PRO-Basis: die gewichtete SUMME (nicht mehr der Durchschnitt) - "nur
                // Profit", aber weiterhin mit den zwei Kickbase-Mechanik-Korrekturen
                // (frische offene Positionen + Zwangsverkäufe zählen weniger, siehe
                // SCORE_WEIGHTS/openPositionConfidence), da sonst echte Spielmechanik-
                // Verzerrungen zurückkämen (Owner-Entscheidung 23.11.2026).
                const weightedTotalProfit = weightedProfitSum;
                const avgOverpayRatio = overpayRatios.length > 0
                    ? overpayRatios.reduce((a, b) => a + b, 0) / overpayRatios.length
                    : 0;

                // Gesamtbild für die Anzeige: realisiert + unrealisiert + Kaderverkäufe (ungewichtet)
                const totalProfit = realizedProfit + unrealizedProfit + orphanSaleProfit;

                let userPoints = parseInt(u.points.replace(/\./g, '')) || 0;

                // PPM-Basis: bevorzugt der Kaderwert ZUM JEWEILIGEN SPIELTAG (siehe
                // computePerMatchdayPpm) statt eines einzigen Momentan-Snapshots - Owner-
                // Korrektur, da der Kaderwert durch Trades waehrend der Saison staendig
                // schwankt und ein fixer Snapshot (heutiger Kaderwert ODER Investitions-
                // summe) Punkte aus ganz anderen Wochen mit einem dazu passenden Kaderwert
                // verwechseln kann (siehe Beispiel-Fall in der Analyse: kollabierter
                // Kaderwert durch schlechte Trades liess PPM faelschlich exzellent aussehen,
                // obwohl PRO fuer dieselben Trades den schlechtesten Wert der Liga zeigte).
                // Fallback-Kette, falls keine Spieltagshistorie auswertbar ist (z.B. ganz
                // neue Liga ohne Spieltage): aktueller Kaderwert, danach Investitionssumme.
                const managerSquadValue = managerSquadValues.get(String(uid)) || 0;
                const perMatchdayPpm = computePerMatchdayPpm(
                    uid, matchdayDays, matchdayPoints, historicalSquads, mvHistory, currentMarketValue, matchdayKickoffs
                );
                let ppmBasis;
                let ppm = 0;
                let ppmMatchdaysUsed = null;
                let ppmBreakdown = null;
                if (perMatchdayPpm) {
                    ppmBasis = 'perMatchdayAverage';
                    ppm = perMatchdayPpm.ppm;
                    ppmMatchdaysUsed = perMatchdayPpm.matchdaysUsed;
                    ppmBreakdown = perMatchdayPpm.breakdown;
                } else {
                    ppmBasis = managerSquadValue > 0 ? 'squadValue' : 'totalSpent';
                    const ppmDenominator = managerSquadValue > 0 ? managerSquadValue : totalSpent;
                    if (ppmDenominator > 0 && userPoints > 0) {
                        ppm = userPoints / (ppmDenominator / 1000000);
                    }
                }

                // Kaderstaerke (KAD): Rein historischer Erwartungswert (xP) ueber alle
                // bisher aufgestellten Startelfen (streng aus Daten VOR dem jeweiligen
                // Spieltag, 0 % Ergebnis-Glueck, 0 % Zwischenwochen-Budget-Verzerrung).
                const budget = parseSignedMoney(u.estimatedBudget);
                const squadInfo = managerSquads.get(String(uid)) || null;
                const squadHeadcountReadiness = squadInfo ? computeSquadReadiness(squadInfo.positionCounts, squadInfo.total) : null;
                const squadEval = evaluateHistoricalLineups(uid, startelfByDay, preKickoffByDay, playerMap, xpLeagueCtxByDay, mvHistory, matchdayKickoffs);
                const squadReadiness = squadEval ? squadEval.avgStartProbability : null;
                const squadRiskPenalty = 0;

                // Performance / PPM - fliesst NICHT mehr in die Gesamtwertung ein, wird aber
                // weiterhin fuer calculation.pkt.perfBonus (Anzeige) gebraucht.
                let perfBonus = 0;
                if (userPoints > 0) {
                    perfBonus = Math.min(10, (ppm / 3) * 10);
                }

                // Gesamtwertung (ratings[uid].score/level/cardTier): einfacher Durchschnitt
                // der 6 finalen Kartenwerte statt eines eigenen Bonus-Modells (Owner-Vorgabe
                // 29.08.2026, "mache einfach den Durchschnitt", Issue 7c948567). Da PRO/KAD/
                // TIM erst im ZWEITEN Durchlauf (liga-relativ, Ende von run()) final gesetzt
                // werden, MUSS diese Berechnung dort passieren, nicht hier im ersten
                // Durchlauf - sonst dieselbe Race-artige Inkonsistenz wie in Issue c94c39b3
                // (Score aus Zwischenstand statt Endstand). Hier nur Platzhalter, echte
                // Werte am Ende von run() (siehe "Gesamtwertung" im zweiten Durchlauf).
                const score = NEUTRAL_CARD_SCORE;
                const level = 'Bronze';

                ratings[uid] = {
                    name: u.name,
                    score,
                    level,
                    cardTier: computeCardTier(level),
                    league: leagueCode(l.name),

                    // FIFA-Karten-Attribute (0-99), sechs statt der frueheren drei
                    // Teilscores - siehe computeXxxScore-Funktionen weiter oben. Alle 6
                    // sind hier noch Platzhalter (neutral 50) - werden im zweiten Durchlauf
                    // nach der Liga-weiten Vergleichsrunde final gesetzt (siehe Ende von run()).
                    pro: computeProScore(weightedTradeWeight > 0),
                    ovp: NEUTRAL_CARD_SCORE,
                    pkt: computePktScore(ppm, userPoints > 0),
                    akt: NEUTRAL_CARD_SCORE,
                    kad: computeKadScore(squadReadiness, squadRiskPenalty),
                    tim: computeTimScore(saleTimingProfit, saleTimingSampleSize),

                    // Vollstaendige Rechenbasis fuer die "So wird deine Karte berechnet"-
                    // Sektion im Frontend (ManagerRatingPage) - damit die Anzeige exakt die
                    // gleichen Rohwerte/Formeln zeigt, die auch tatsaechlich verwendet wurden,
                    // statt einer im Frontend nachgebauten (und potenziell abweichenden) Kopie.
                    calculation: {
                        pro: {
                            score: computeProScore(weightedTradeWeight > 0),
                            weightedTotalProfit: weightedTradeWeight > 0 ? weightedTotalProfit : null,
                            completedTrades,
                            openPositions,
                            orphanSales,
                            saleTimingSampleSize,
                        },
                        // score/leaguePercentile/leagueRank/leagueSize werden im zweiten
                        // Durchlauf gesetzt (Liga-Vergleich, siehe Ende von run()).
                        ovp: {
                            score: NEUTRAL_CARD_SCORE,
                            purchaseCount: overpayRatios.length,
                            averageOverpayRatio: overpayRatios.length > 0 ? avgOverpayRatio : null,
                        },
                        pkt: {
                            score: computePktScore(ppm, userPoints > 0),
                            points: userPoints,
                            totalSpent,
                            managerSquadValue: managerSquadValue > 0 ? managerSquadValue : null,
                            ppmBasis,
                            ppm: userPoints > 0 ? ppm : null,
                            // Nur gesetzt, wenn ppmBasis === 'perMatchdayAverage': Anzahl
                            // Spieltage, die in den Durchschnitt eingeflossen sind, und die
                            // vollstaendige Aufschluesselung je Spieltag (Punkte, Kaderwert
                            // zum Cutoff, Verhaeltnis) fuer Transparenz/Debugging.
                            matchdaysUsed: ppmMatchdaysUsed,
                            matchdayBreakdown: ppmBreakdown,
                            averageMatchdaySquadValue: ppmBreakdown && ppmBreakdown.length > 0
                                ? ppmBreakdown.reduce((s, b) => s + b.squadValue, 0) / ppmBreakdown.length
                                : null,
                            perfBonus,
                        },
                        akt: {
                            score: NEUTRAL_CARD_SCORE,
                            buys: trades.buys.length,
                            sells: trades.sells.length,
                            totalTransactions,
                        },
                        kad: {
                            score: computeKadScore(squadReadiness, squadRiskPenalty),
                            basis: 'historicalLineupsXp',
                            matchdaysEvaluated: squadEval ? squadEval.matchdaysEvaluated : 0,
                            squadTotal: squadInfo ? squadInfo.total : null,
                            squadReadiness,
                            expectedLineupPoints: squadEval ? squadEval.expectedLineupPoints : null,
                            jokerExpectedPoints: squadEval ? squadEval.jokerExpectedPoints : null,
                            avgStartProbability: squadEval ? squadEval.avgStartProbability : null,
                            avgLikelyStarters: squadEval ? squadEval.avgLikelyStarters : null,
                            avgActualPoints: squadEval ? squadEval.avgActualPoints : null,
                            totalMissingSlots: squadEval ? squadEval.totalMissingSlots : 0,
                            negativeBudgetDays: squadEval ? squadEval.negativeBudgetDays : 0,
                            strengthScore: squadEval ? squadEval.strengthScore : null,
                            matchdayBreakdown: squadEval ? squadEval.breakdown : [],
                        },
                        tim: {
                            score: computeTimScore(saleTimingProfit, saleTimingSampleSize),
                            sampleSize: saleTimingSampleSize,
                            averageTimingProfit: saleTimingSampleSize > 0 ? (saleTimingProfit / saleTimingSampleSize) : null,
                            averageTimingPct: saleTimingSampleSize > 0 ? (saleTimingPctSum / saleTimingSampleSize) : null,
                            goodExits,
                            tooEarlyExits,
                            tooLateExits,
                            neutralExits,
                            goodExitRate: saleTimingSampleSize > 0 ? (goodExits / saleTimingSampleSize) : null,
                        },
                    },

                    // Gesamtbild (realisiert + unrealisiert + Kaderverkäufe)
                    totalProfit,

                    // Abgeschlossene Trades (Kauf + Verkauf)
                    tradesCount: completedTrades, // Rückwärtskompatibilität
                    completedTrades,
                    forcedCompletedTrades,
                    realizedProfit,
                    forcedRealizedProfit,

                    // Offene Positionen (noch nicht verkauft, unrealisiert)
                    openPositions,
                    unrealizedProfit,
                    openPositionsAvgAgeDays,

                    // Kaderverkäufe ohne bekannten Einstandspreis (Saison-Auslosung)
                    orphanSales,
                    orphanSaleProfit,
                    forcedOrphanSales,

                    totalTransactions,
                    totalOverpay,
                    avgOverpayRatio,
                    ppm,
                    bestTrade,
                    worstTrade,

                    // Verkaufs-Timing: wie hat sich der Marktwert NACH dem Verkauf entwickelt?
                    // (positiv = Wert fiel danach weiter -> Verkauf war klug; negativ = Wert
                    // stieg danach -> zu früh verkauft). saleTimingSampleSize zeigt, bei wie
                    // vielen der Verkäufe überhaupt genug Historie für ein Urteil vorlag.
                    saleTimingProfit,
                    saleTimingSampleSize,

                    // Kader-Vollständigkeit & Budget-Risiko
                    budget,
                    squadTotal: squadInfo ? squadInfo.total : null,
                    squadReadiness,
                    squadHeadcountReadiness,
                    squadRiskPenalty
                };
            });
        });
    }

    // --- Zweiter Durchlauf: Liga-relative Bewertung fuer alle 6 Kartenwerte
    // (PRO/OVP/PKT/AKT/KAD/TIM, Owner-Vorgabe 29.08.2026) ---
    // Muss NACH dem ersten Durchlauf laufen, weil dafuer alle Liga-Mitglieder
    // bereits berechnet sein muessen (Prozentrang braucht die komplette
    // Vergleichsgruppe). Pro Liga getrennt, damit sich Manager nur mit ihren
    // ECHTEN Liga-Kollegen vergleichen, nicht liga-uebergreifend.
    if (data.leagues) {
        data.leagues.forEach(l => {
            const memberUids = l.users.filter(isRealManager).map(u => u.id || u.i).filter(uid => ratings[uid]);

            // AKT: Glockenkurve auf Basis des Liga-Durchschnitts (Owner-Vorgabe
            // 29.08.2026) - log-transformierte Transaktionszahlen, z-Score gegen
            // Mittelwert/Streuung der Liga, tanh-Mapping auf 50-99 (Peak 75).
            // leaguePercentile bleibt als reine Anzeige-Info fuer die Liga-Vergleichs-
            // Leiste im Frontend erhalten, treibt aber nicht mehr den Score.
            const aktValues = memberUids.map(uid => ratings[uid].calculation.akt.totalTransactions);
            const aktLogValues = aktValues.map(x => Math.log((x || 0) + 1));
            const aktMean = aktLogValues.length > 0 ? aktLogValues.reduce((a, b) => a + b, 0) / aktLogValues.length : 0;
            const aktStd = aktLogValues.length > 1
                ? Math.sqrt(aktLogValues.reduce((s, v) => s + (v - aktMean) ** 2, 0) / (aktLogValues.length - 1))
                : 0;
            const aktRanked = [...aktValues].sort((a, b) => b - a);
            memberUids.forEach(uid => {
                const totalTransactions = ratings[uid].calculation.akt.totalTransactions;
                const logX = Math.log((totalTransactions || 0) + 1);
                const zScore = aktStd > 1e-9 ? (logX - aktMean) / aktStd : 0;
                const percentile = percentileRank(totalTransactions, aktValues, true);
                const score = computeAktScore(zScore);
                Object.assign(ratings[uid].calculation.akt, {
                    leaguePercentile: percentile,
                    leagueRank: aktRanked.indexOf(totalTransactions) + 1,
                    leagueSize: aktValues.length,
                    leagueMean: aktMean,
                    leagueStd: aktStd,
                    zScore,
                    score,
                });
                ratings[uid].akt = score;
            });

            // OVP: WENIGER Aufschlag als die Liga-Kollegen = besser - nur unter
            // Managern vergleichen, die ueberhaupt schon eingekauft haben.
            const ovpMembers = memberUids.filter(uid => ratings[uid].calculation.ovp.averageOverpayRatio != null);
            const ovpValues = ovpMembers.map(uid => ratings[uid].calculation.ovp.averageOverpayRatio);
            const ovpRanked = [...ovpValues].sort((a, b) => a - b);
            memberUids.forEach(uid => {
                const avgRatio = ratings[uid].calculation.ovp.averageOverpayRatio;
                if (avgRatio == null) return; // bleibt neutral (Platzhalter aus erstem Durchlauf)
                const percentile = percentileRank(avgRatio, ovpValues, false);
                const score = computeOvpScore(percentile);
                Object.assign(ratings[uid].calculation.ovp, {
                    leaguePercentile: percentile,
                    leagueRank: ovpRanked.indexOf(avgRatio) + 1,
                    leagueSize: ovpValues.length,
                    score,
                });
                ratings[uid].ovp = score;
            });

            // PKT (Punkte pro Million): Schwellenwert dynamisch am Liga-Mittelwert
            // statt fix ~3 (Owner-Vorgabe 29.08.2026). Nur unter Managern mit echt
            // vorliegenden Punkten/PPM vergleichen; ohne Punkte bleibt neutral.
            const pktMembers = memberUids.filter(uid => ratings[uid].calculation.pkt.ppm != null);
            const pktValues = pktMembers.map(uid => ratings[uid].calculation.pkt.ppm);
            const pktMean = pktValues.length > 0 ? pktValues.reduce((a, b) => a + b, 0) / pktValues.length : 0;
            const pktRanked = [...pktValues].sort((a, b) => b - a);
            memberUids.forEach(uid => {
                const ppm = ratings[uid].calculation.pkt.ppm;
                if (ppm == null) return; // bleibt neutral (Platzhalter aus erstem Durchlauf)
                const percentile = percentileRank(ppm, pktValues, true);
                const score = computePktScoreFromMean(ppm, pktMean);
                Object.assign(ratings[uid].calculation.pkt, {
                    leaguePercentile: percentile,
                    leagueRank: pktRanked.indexOf(ppm) + 1,
                    leagueSize: pktValues.length,
                    leagueMeanPpm: pktMean,
                    score,
                });
                ratings[uid].pkt = score;
            });

            // PRO (Profit): liga-relativ wie PKT/OVP/AKT (Owner-Vorgabe 29.08.2026).
            // Z-Score der gewichteten Gesamtsumme (nicht mehr Durchschnitt, siehe
            // weightedTotalProfit - Owner-Feedback 23.11.2026, "nur Profit" statt
            // gewichteter Durchschnitt inkl. Verkaufs-Timing) gegen Mittelwert/
            // Streuung der Liga - kein Log-Transform (anders als AKT), da Profit
            // negativ sein kann. Nur unter Managern mit echt vorliegenden gewichteten
            // Trades vergleichen; ohne Trades bleibt neutral.
            const proMembers = memberUids.filter(uid => ratings[uid].calculation.pro.weightedTotalProfit != null);
            const proValues = proMembers.map(uid => ratings[uid].calculation.pro.weightedTotalProfit);
            const proMean = proValues.length > 0 ? proValues.reduce((a, b) => a + b, 0) / proValues.length : 0;
            const proStd = proValues.length > 1
                ? Math.sqrt(proValues.reduce((s, v) => s + (v - proMean) ** 2, 0) / (proValues.length - 1))
                : 0;
            const proRanked = [...proValues].sort((a, b) => b - a);
            memberUids.forEach(uid => {
                const totalProfitWeighted = ratings[uid].calculation.pro.weightedTotalProfit;
                if (totalProfitWeighted == null) return; // bleibt neutral (Platzhalter aus erstem Durchlauf)
                const zScore = proStd > 1e-9 ? (totalProfitWeighted - proMean) / proStd : 0;
                const percentile = percentileRank(totalProfitWeighted, proValues, true);
                const score = computeLeagueRelativeScore(zScore);
                Object.assign(ratings[uid].calculation.pro, {
                    leaguePercentile: percentile,
                    leagueRank: proRanked.indexOf(totalProfitWeighted) + 1,
                    leagueSize: proValues.length,
                    leagueMean: proMean,
                    leagueStd: proStd,
                    zScore,
                    score,
                });
                ratings[uid].pro = score;
            });

            // KAD (Kaderstaerke): liga-relativ auf Basis der erwarteten Punkte
            // der besten gueltigen 11er-Startelf (strengthScore = expectedLineupPoints
            // minus moderatem Abzug nur bei fehlenden Slots im kritischen Bereich).
            const kadMembers = memberUids.filter(uid => ratings[uid].calculation.kad.strengthScore != null);
            const kadValues = kadMembers.map(uid => ratings[uid].calculation.kad.strengthScore);
            const kadMean = kadValues.length > 0 ? kadValues.reduce((a, b) => a + b, 0) / kadValues.length : 0;
            const kadStd = kadValues.length > 1
                ? Math.sqrt(kadValues.reduce((s, v) => s + (v - kadMean) ** 2, 0) / (kadValues.length - 1))
                : 0;
            const kadRanked = [...kadValues].sort((a, b) => b - a);
            memberUids.forEach(uid => {
                const strength = ratings[uid].calculation.kad.strengthScore;
                if (strength == null) return; // bleibt neutral
                const zScore = kadStd > 1e-9 ? (strength - kadMean) / kadStd : 0;
                const percentile = percentileRank(strength, kadValues, true);
                const score = computeLeagueRelativeScore(zScore);
                Object.assign(ratings[uid].calculation.kad, {
                    leaguePercentile: percentile,
                    leagueRank: kadRanked.indexOf(strength) + 1,
                    leagueSize: kadValues.length,
                    leagueMean: kadMean,
                    leagueStd: kadStd,
                    zScore,
                    score,
                });
                ratings[uid].kad = score;
            });

            // TIM (Verkaufstiming, 7-Tage-Perspektive): liga-relativ auf Basis
            // des durchschnittlichen prozentualen 7T-Timing-Effekts (averageTimingPct),
            // damit teure Einzelspieler nicht viele normale Trades ueberlagern.
            const timMembers = memberUids.filter(uid => ratings[uid].calculation.tim.averageTimingPct != null);
            const timValues = timMembers.map(uid => ratings[uid].calculation.tim.averageTimingPct);
            const timMean = timValues.length > 0 ? timValues.reduce((a, b) => a + b, 0) / timValues.length : 0;
            const timStd = timValues.length > 1
                ? Math.sqrt(timValues.reduce((s, v) => s + (v - timMean) ** 2, 0) / (timValues.length - 1))
                : 0;
            const timRanked = [...timValues].sort((a, b) => b - a);
            memberUids.forEach(uid => {
                const avgTimingPct = ratings[uid].calculation.tim.averageTimingPct;
                if (avgTimingPct == null) return; // bleibt neutral
                const zScore = timStd > 1e-9 ? (avgTimingPct - timMean) / timStd : 0;
                const percentile = percentileRank(avgTimingPct, timValues, true);
                const score = computeLeagueRelativeScore(zScore);
                Object.assign(ratings[uid].calculation.tim, {
                    leaguePercentile: percentile,
                    leagueRank: timRanked.indexOf(avgTimingPct) + 1,
                    leagueSize: timValues.length,
                    leagueMean: timMean,
                    leagueStd: timStd,
                    zScore,
                    score,
                });
                ratings[uid].tim = score;
            });

            // Gesamtwertung: einfacher Durchschnitt der 6 finalen Kartenwerte statt
            // eines eigenen Bonus-Modells (Owner-Vorgabe 29.08.2026, Issue 7c948567).
            // Muss HIER laufen, NACH den obigen PRO/OVP/PKT/AKT/KAD/TIM-Bloecken -
            // zu diesem Zeitpunkt sind fuer jeden Manager in memberUids alle 6 Werte
            // final (liga-relativ), nicht mehr die Platzhalter aus dem ersten
            // Durchlauf. Level-Schwellen unveraendert (90/75/60/45).
            memberUids.forEach(uid => {
                const r = ratings[uid];
                const avgScore = (r.pro + r.ovp + r.pkt + r.akt + r.kad + r.tim) / 6;
                const finalScore = Math.round(avgScore);

                let level = 'Bronze';
                if (finalScore >= 90) level = 'Elite';
                else if (finalScore >= 75) level = 'Gold';
                else if (finalScore >= 60) level = 'Silber';
                else if (finalScore < 45) level = 'Amateur';

                r.score = finalScore;
                r.level = level;
                r.cardTier = computeCardTier(level);
            });
        });
    }

    fs.writeFileSync(outputPath, JSON.stringify(ratings, null, 2));
    console.log("Manager Ratings saved to", outputPath);
}

run();
