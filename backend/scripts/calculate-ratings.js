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

// --- Realistische Startelf-Wahrscheinlichkeit (statt reiner Kopfzahl) ---
// computeSquadReadiness (squadRules.js) zaehlt jeden Spieler in der richtigen
// Position einfach als "1" - ob der Spieler bei seinem echten Verein
// UEBERHAUPT eine reelle Chance auf einen Startelf-Einsatz hat, blieb bisher
// unberuecksichtigt. Kickbase liefert dafuer pro Spieler selbst eine
// Wahrscheinlichkeits-Einstufung (Quelle: Ligainsider) - das Feld `prob`
// (1 = sehr unwahrscheinlich bis 5 = sehr wahrscheinlich) in all_players.json
// (siehe playerMap in run()). Das ersetzt hier die reine Kopfzahl je Position
// durch die Summe der TATSAECHLICHEN Wahrscheinlichkeiten der jeweils besten
// Spieler je Position - ein Kader voller Ersatzbank-Spieler sieht dadurch
// nicht mehr wie ein "voll einsatzfaehiger" Kader aus.
const PROB_SCALE_MAX = 5; // Kickbase/Ligainsider-Skala: 1 (unwahrscheinlich) bis 5 (sehr wahrscheinlich)
const PROB_FALLBACK_UNKNOWN = 3; // neutraler Mittelwert, falls fuer einen Spieler keine prob-Daten vorliegen (z.B. Datenluecke) - lieber neutral als der Manager fuer eine Datenluecke bestraft wird

function playerStartProbability(playerId, playerMap) {
    const player = playerMap.get(playerId) || playerMap.get(String(playerId));
    const prob = player && typeof player.prob === 'number' ? player.prob : null;
    return prob != null ? prob : PROB_FALLBACK_UNKNOWN;
}

function computeRealisticSquadReadiness(squadPlayers, playerMap, totalCount) {
    let required = 0;
    let satisfied = 0;
    const positionGroups = {};
    (squadPlayers || []).forEach(sp => {
        if (!sp.position) return;
        const prob = playerStartProbability(sp.id, playerMap);
        (positionGroups[sp.position] = positionGroups[sp.position] || []).push(prob);
    });

    for (const [pos, need] of Object.entries(SQUAD_MIN_POSITIONS)) {
        required += need;
        // Nur die N besten (wahrscheinlichsten) Spieler je Position zaehlen fuer
        // die geforderte Anzahl - fehlende Slots (weniger Spieler als noetig,
        // oder ueberzaehlige Bankspieler) zaehlen als 0.
        const taken = (positionGroups[pos] || []).sort((a, b) => b - a).slice(0, need);
        satisfied += taken.reduce((sum, prob) => sum + prob / PROB_SCALE_MAX, 0);
    }

    const positionalReadiness = required > 0 ? satisfied / required : 1;
    const totalReadiness = Math.min(1, totalCount / SQUAD_MIN_TOTAL);
    return Math.min(positionalReadiness, totalReadiness);
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

// PRO (Profit): profitBonus reicht von -20 bis +25 -> auf 1-99 gestreckt.
function computeProScore(profitBonus, hasWeightedTrades) {
    if (!hasWeightedTrades) return NEUTRAL_CARD_SCORE;
    return clampCardScore(50 + profitBonus * 1.96);
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

// KAD (Kaderstaerke & Risiko): squadRiskPenalty reicht von -20 (schlecht) bis 0 (top) ->
// invertiert auf 20-99 gestreckt, damit ein voll startelf-faehiger, solventer Kader
// nahe 99 liegt und ein leerer/verschuldeter Kader nahe 20 (nie 0, das waere zu hart).
function computeKadScore(squadReadiness, squadRiskPenalty) {
    if (squadReadiness === null) return NEUTRAL_CARD_SCORE;
    return clampCardScore(99 - (Math.abs(squadRiskPenalty) / MAX_SQUAD_RISK_PENALTY) * 79);
}

// TIM (Verkaufsgespuer): durchschnittlicher saleTimingProfit pro Verkauf.
// Anders als PRO/OVP/KAD/AKT hat dieser Wert keine vorgegebene Referenzskala
// aus dem urspruenglichen Scoring-Modell (dort nur ein kleines Zusatzgewicht,
// kein eigener Bonus mit fester Spannbreite) - per tanh() statt linearer
// Streckung gemappt, damit auch sehr hohe Betraege (teure/volatile Spieler)
// nicht sofort alle bei 99 landen und die Karte noch differenziert.
function computeTimScore(saleTimingProfit, saleTimingSampleSize) {
    if (saleTimingSampleSize <= 0) return NEUTRAL_CARD_SCORE;
    const avgTiming = saleTimingProfit / saleTimingSampleSize;
    return clampCardScore(50 + Math.tanh(avgTiming / 900000) * 45);
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
    const managerSquadValues = loadManagerSquadValues();

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

                // PPM-Basis: bevorzugt der aktuelle Kaderwert (summe(marketValue) der
                // Spieler im Kader, aus advisor-data.json) statt der historischen
                // Investitionssumme (totalSpent) - Owner-Vorgabe 29.08.2026. So misst PPM
                // "Punkte pro Million AKTUELLEM Marktwert" statt "... eingesetztem Kapital".
                // Fallback auf totalSpent, wenn kein Kaderwert vorliegt (z.B. Advisor-Daten
                // fehlen); ppmBasis macht die tatsaechlich genutzte Basis transparent.
                const managerSquadValue = managerSquadValues.get(String(uid)) || 0;
                const ppmBasis = managerSquadValue > 0 ? 'squadValue' : 'totalSpent';
                const ppmDenominator = managerSquadValue > 0 ? managerSquadValue : totalSpent;
                let ppm = 0;
                if (ppmDenominator > 0 && userPoints > 0) {
                    ppm = userPoints / (ppmDenominator / 1000000);
                }

                // Kader-Vollständigkeit & Budget: unabhängig vom bisherigen Trading-Erfolg -
                // ein Manager ohne startelf-fähigen Kader und/oder mit knappem/negativem
                // Budget trägt ein echtes Risiko für die kommenden Spieltage.
                const budget = parseSignedMoney(u.estimatedBudget);
                const squadInfo = managerSquads.get(String(uid)) || null;
                // "Startelf-Fähigkeit" nutzt jetzt die REALISTISCHE Wahrscheinlichkeit
                // (Kickbase/Ligainsider-Feld `prob` je Spieler) statt reiner Kopfzahl je
                // Position - siehe computeRealisticSquadReadiness weiter oben. Die alte,
                // rein kopfzahlbasierte Variante bleibt zusaetzlich erhalten (nur fuer die
                // Berechnungs-Transparenz im Frontend), beeinflusst aber nicht mehr den Score.
                const squadHeadcountReadiness = squadInfo ? computeSquadReadiness(squadInfo.positionCounts, squadInfo.total) : null;
                const squadReadiness = squadInfo ? computeRealisticSquadReadiness(squadInfo.players, playerMap, squadInfo.total) : null;
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
                // Unvollständiger Kader UND/ODER Kader voller Spieler mit realistisch
                // niedriger Startelf-Chance (siehe computeRealisticSquadReadiness, nutzt
                // Kickbases eigene Startelf-Wahrscheinlichkeit je Spieler) sowie
                // negatives/knappes Budget - siehe computeSquadRiskPenalty. Wird NICHT
                // bewertet, wenn keine Kaderdaten vorliegen (squadReadiness === null).
                let totalScore = Math.round(baseScore + actBonus + profitBonus + overpayBonus + perfBonus + squadRiskPenalty);
                totalScore = Math.max(0, Math.min(100, totalScore));

                // Kleine kosmetische Anpassung: Wer noch keine abgeschlossenen Trades hat,
                // aber aktiv Positionen aufgebaut hat, wird fürs Scouting honoriert.
                const scoutingBonus = (completedTrades === 0 && openPositions > 5) ? 5 : 0;
                totalScore += scoutingBonus;
                totalScore = Math.max(0, Math.min(100, totalScore));

                // Stufen in normaler Medaillen-Reihenfolge (Amateur < Bronze < Silber < Gold < Elite) -
                // vorher lag "Gold" fälschlich UNTER "Silber", was bei jedem Vergleich verwirrte.
                let level = 'Bronze';
                if (totalScore >= 90) level = 'Elite';
                else if (totalScore >= 75) level = 'Gold';
                else if (totalScore >= 60) level = 'Silber';
                else if (totalScore < 45) level = 'Amateur';

                ratings[uid] = {
                    name: u.name,
                    score: totalScore,
                    level,
                    cardTier: computeCardTier(level),
                    league: leagueCode(l.name),

                    // FIFA-Karten-Attribute (0-99), sechs statt der frueheren drei
                    // Teilscores - siehe computeXxxScore-Funktionen weiter oben. OVP/AKT
                    // sind hier noch Platzhalter (neutral 50) - werden im zweiten Durchlauf
                    // nach der Liga-weiten Vergleichsrunde final gesetzt (siehe Ende von run()).
                    pro: computeProScore(profitBonus, weightedTradeWeight > 0),
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
                            score: computeProScore(profitBonus, weightedTradeWeight > 0),
                            weightedAverageProfit: weightedTradeWeight > 0 ? avgWeightedProfit : null,
                            completedTrades,
                            openPositions,
                            orphanSales,
                            saleTimingSampleSize,
                            profitBonus,
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
                            squadTotal: squadInfo ? squadInfo.total : null,
                            squadReadiness,
                            squadHeadcountReadiness,
                            squadRiskPenalty,
                            budget,
                        },
                        tim: {
                            score: computeTimScore(saleTimingProfit, saleTimingSampleSize),
                            sampleSize: saleTimingSampleSize,
                            averageTimingProfit: saleTimingSampleSize > 0 ? (saleTimingProfit / saleTimingSampleSize) : null,
                        },
                        overall: {
                            baseScore,
                            activityBonus: actBonus,
                            profitBonus,
                            overpayBonus,
                            performanceBonus: perfBonus,
                            squadRiskPenalty,
                            scoutingBonus,
                            finalScore: totalScore,
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

    // --- Zweiter Durchlauf: Liga-relative Bewertung fuer OVP und AKT ---
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
        });
    }

    fs.writeFileSync(outputPath, JSON.stringify(ratings, null, 2));
    console.log("Manager Ratings saved to", outputPath);
}

run();
