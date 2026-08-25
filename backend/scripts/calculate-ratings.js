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

// Gewichtung der verschiedenen Trade-Arten im Score (nicht in den rohen Anzeige-Summen):
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
    saleTiming: 0.4, // zusätzliches, moderates Gewicht für "war der Verkaufszeitpunkt im Nachhinein klug?"
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
const SQUAD_MIN_POSITIONS = { TW: 1, ABW: 3, MF: 2, ST: 1 };
const SQUAD_MIN_TOTAL = 11;
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

// 0 (kein brauchbarer Kader) bis 1 (startelf-fähig): Flaschenhals-Prinzip - sowohl
// die Mindestbesetzung JEDER Position als auch die Gesamtzahl müssen stimmen, ein
// Kader mit 3 Torhütern aber nur 2 Abwehrspielern ist trotz 9 Spielern nicht bereit.
function computeSquadReadiness(positionCounts, totalCount) {
    let required = 0;
    let satisfied = 0;
    for (const [pos, need] of Object.entries(SQUAD_MIN_POSITIONS)) {
        required += need;
        satisfied += Math.min(positionCounts[pos] || 0, need);
    }
    const positionalReadiness = required > 0 ? satisfied / required : 1;
    const totalReadiness = Math.min(1, totalCount / SQUAD_MIN_TOTAL);
    return Math.min(positionalReadiness, totalReadiness);
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
// (managerSquads). Wir brauchen daraus nur Positionsverteilung + Gesamtgröße,
// zusammengeführt über ALLE Ligen zu einer einzigen Map (Manager-IDs sind
// liga-übergreifend eindeutig).
function loadManagerSquads() {
    const advisorPath = path.join(__dirname, '../../frontend/public/advisor-data.json');
    const map = new Map();
    try {
        if (fs.existsSync(advisorPath)) {
            const advisorData = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));
            Object.values(advisorData.leagues || {}).forEach(league => {
                Object.entries(league.managerSquads || {}).forEach(([managerId, squad]) => {
                    const positionCounts = {};
                    (squad || []).forEach(p => {
                        if (p.position) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
                    });
                    map.set(String(managerId), { total: (squad || []).length, positionCounts });
                });
            });
        }
    } catch (e) {
        console.warn('Konnte advisor-data.json nicht lesen (Kaderdaten):', e.message);
    }
    return map;
}

// --- Verkaufs-Timing: war der Verkauf im Nachhinein betrachtet klug? ---
// Ein Verkauf sieht im Moment des Abschlusses vielleicht profitabel aus - die
// eigentliche Frage ist aber, wie sich der Marktwert DANACH entwickelt hat. Fällt
// der Wert nach dem Verkauf weiter, war der Ausstieg klug (Verlust vermieden).
// Steigt er, wurde zu früh verkauft (Gewinn liegengelassen) - unabhängig davon, ob
// der Verkauf selbst gegenüber dem damaligen Marktwert schon "im Plus" war.
const SALE_TIMING_LOOKAHEAD_DAYS = 7;

function saleTimingWisdom(mvHistory, playerId, saleDate) {
    const entries = mvHistory.get(String(playerId));
    if (!entries || entries.length === 0) return null;

    const saleDateStr = new Date(saleDate).toISOString().slice(0, 10);
    const valueAtSale = lookupValueOnOrBefore(entries, saleDateStr);
    if (valueAtSale == null || valueAtSale <= 0) return null;

    const targetDateStr = new Date(new Date(saleDate).getTime() + SALE_TIMING_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);

    // Bevorzugt ein Wert nahe dem Ziel-Datum (Verkauf + Lookahead); ist seither
    // weniger Zeit vergangen, nimm ersatzweise den neuesten verfügbaren Wert NACH
    // dem Verkauf (kann auch nur 1 Tag Vorsprung sein - besser als gar kein Signal).
    let valueInWindow = null;
    let valueAfterSale = null;
    for (const [d, mv] of entries) {
        if (mv == null || d <= saleDateStr) continue;
        valueAfterSale = mv;
        if (d <= targetDateStr) valueInWindow = mv;
    }
    const laterValue = valueInWindow != null ? valueInWindow : valueAfterSale;
    if (laterValue == null) return null; // noch keine Daten nach dem Verkauf vorhanden

    const postSaleDelta = laterValue - valueAtSale;
    return -postSaleDelta; // positiv = Marktwert ist seither gefallen -> Verkauf war klug
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

// Der Trading Advisor (backend/advisor/run_advisor.py) speichert für jeden Marktspieler
// bereits eine rollierende 60-Tage-Marktwert-Historie in advisor-data.json
// (siehe build_history_by_player, HISTORY_DAYS). Diese echten historischen Werte sind
// eine deutlich bessere Referenz für "Marktwert zum Kauf-/Verkaufszeitpunkt" als der
// aktuelle Marktwert - wir nutzen sie hier wieder, statt Daten doppelt zu erheben.
// Format je Spieler: [[ "YYYY-MM-DD", marktwert, punkte ], ...] aufsteigend sortiert.
function loadMarketValueHistory() {
    const advisorPath = path.join(__dirname, '../../frontend/public/advisor-data.json');
    const map = new Map();
    try {
        if (fs.existsSync(advisorPath)) {
            const advisorData = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));
            (advisorData.players || []).forEach(p => {
                if (p.playerId != null && Array.isArray(p.history)) {
                    map.set(String(p.playerId), p.history);
                }
            });
        }
    } catch (e) {
        console.warn('Konnte advisor-data.json nicht lesen (historische Marktwerte):', e.message);
    }
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

                // Verkaufs-Timing: war es im Nachhinein klug, GENAU DANN zu verkaufen?
                // (siehe saleTimingWisdom) - unabhängig von Kaufpreis/Referenzwert.
                let saleTimingProfit = 0;
                let saleTimingSampleSize = 0;

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

                    const referenceValue = referenceMarketValue(b.playerId, b.date, b.marketValue);
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

                        const wisdom = saleTimingWisdom(mvHistory, s.playerId, s.date);
                        if (wisdom != null) {
                            saleTimingProfit += wisdom;
                            saleTimingSampleSize++;
                            weightedProfitSum += wisdom * SCORE_WEIGHTS.saleTiming;
                            weightedTradeWeight += SCORE_WEIGHTS.saleTiming;
                        }

                        considerForTopFlop(name, profit, 'realized', forced);
                    } else {
                        // Kein bekannter Kauf -> Spieler kam vermutlich aus der Saison-Auslosung.
                        // Referenz ist der ECHTE Marktwert am Verkaufstag aus der
                        // Trading-Advisor-Historie (siehe referenceMarketValue).
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

                        const wisdom = saleTimingWisdom(mvHistory, s.playerId, s.date);
                        if (wisdom != null) {
                            saleTimingProfit += wisdom;
                            saleTimingSampleSize++;
                            weightedProfitSum += wisdom * SCORE_WEIGHTS.saleTiming;
                            weightedTradeWeight += SCORE_WEIGHTS.saleTiming;
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
                const avgWeightedProfit = weightedTradeWeight > 0 ? weightedProfitSum / weightedTradeWeight : 0;
                const avgOverpayRatio = overpayRatios.length > 0
                    ? overpayRatios.reduce((a, b) => a + b, 0) / overpayRatios.length
                    : 0;

                // Gesamtbild für die Anzeige: realisiert + unrealisiert + Kaderverkäufe (ungewichtet)
                const totalProfit = realizedProfit + unrealizedProfit + orphanSaleProfit;

                let userPoints = parseInt(u.points.replace(/\./g, '')) || 0;
                let ppm = 0;
                if (totalSpent > 0 && userPoints > 0) {
                    ppm = userPoints / (totalSpent / 1000000);
                }

                // Kader-Vollständigkeit & Budget: unabhängig vom bisherigen Trading-Erfolg -
                // ein Manager ohne startelf-fähigen Kader und/oder mit knappem/negativem
                // Budget trägt ein echtes Risiko für die kommenden Spieltage.
                const budget = parseSignedMoney(u.estimatedBudget);
                const squadInfo = managerSquads.get(String(uid)) || null;
                const squadReadiness = squadInfo ? computeSquadReadiness(squadInfo.positionCounts, squadInfo.total) : null;
                const squadRiskPenalty = computeSquadRiskPenalty(squadReadiness, budget);

                // --- SCORING MODELL (Basis 50) ---
                let baseScore = 50;

                // 1. Aktivität (bis zu +15 Punkte)
                // Zählt jetzt ALLE Transaktionen (Käufe + Verkäufe, auch Kaderverkäufe),
                // nicht nur Käufe - wer viel am Markt agiert, sammelt Pluspunkte.
                let actBonus = Math.min(15, (totalTransactions / 20) * 15);

                // 2. Profit Score (-20 bis +25 Punkte)
                // Basiert auf dem GEWICHTETEN Durchschnittsgewinn (siehe SCORE_WEIGHTS):
                // abgeschlossene Trades zählen voll, Zwangsverkäufe (250-Punkte-Regel) und
                // offene Positionen gedämpft, damit ein einzelner Glücks-/Pflichtverkauf
                // das Rating nicht dominiert.
                let profitBonus = 0;
                if (weightedTradeWeight > 0) {
                    profitBonus = (avgWeightedProfit / 500000) * 25;
                    profitBonus = Math.max(-20, Math.min(25, profitBonus));
                }

                // 3. Overpay-Bonus/-Malus (-10 bis +10 Punkte)
                // Da Underpay verboten ist, liegt JEDER Kauf bei/über Marktwert - "Overpay"
                // ist also der Normalfall und keine Regelverletzung. Bewertet wird relativ zu
                // einer fairen Referenzprämie (REFERENCE_OVERPAY_RATIO): nah am Marktwert
                // eingekauft = Bonus, exzessive Bieterkriege = Malus.
                let overpayBonus = 0;
                if (overpayRatios.length > 0) {
                    overpayBonus = ((REFERENCE_OVERPAY_RATIO - avgOverpayRatio) / REFERENCE_OVERPAY_RATIO) * 10;
                    overpayBonus = Math.max(-10, Math.min(10, overpayBonus));
                }

                // 4. Performance / PPM (bis zu +10 Punkte)
                let perfBonus = 0;
                if (userPoints > 0) {
                    perfBonus = Math.min(10, (ppm / 3) * 10);
                }

                // 5. Kaderrisiko (-20 bis 0 Punkte)
                // Unvollständiger Kader (keine startelf-fähige Aufstellung) und/oder
                // negatives/knappes Budget - siehe computeSquadRiskPenalty. Wird NICHT
                // bewertet, wenn keine Kaderdaten vorliegen (squadReadiness === null).
                let totalScore = Math.round(baseScore + actBonus + profitBonus + overpayBonus + perfBonus + squadRiskPenalty);
                totalScore = Math.max(0, Math.min(100, totalScore));

                // Kleine kosmetische Anpassung: Wer noch keine abgeschlossenen Trades hat,
                // aber aktiv Positionen aufgebaut hat, wird fürs Scouting honoriert.
                if (completedTrades === 0 && openPositions > 5) {
                    totalScore += 5;
                }
                totalScore = Math.max(0, Math.min(100, totalScore));

                let level = 'Bronze';
                if (totalScore >= 90) level = 'Elite';
                else if (totalScore >= 75) level = 'Silber';
                else if (totalScore >= 60) level = 'Gold';
                else if (totalScore < 45) level = 'Amateur';

                ratings[uid] = {
                    name: u.name,
                    score: totalScore,
                    level,
                    financialScore: Math.round(50 + profitBonus * 1.6 + overpayBonus * 1.6),
                    performanceScore: Math.round(50 + perfBonus * 5),
                    rebuildScore: Math.round(50 + actBonus * 3.3),

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
                    squadRiskPenalty
                };
            });
        });
    }

    fs.writeFileSync(outputPath, JSON.stringify(ratings, null, 2));
    console.log("Manager Ratings saved to", outputPath);
}

run();
