const fs = require('fs');
const path = require('path');
const { LEAGUE_DEFS } = require('../kickbase');

// Diagnose ergab (siehe Chat-Verlauf): das echte Kickbase-Datumsfeld pro Feed-Item
// heißt "dt" (z.B. "2026-08-25T13:44:05Z"), NICHT "d"/"date". Dadurch griff bei
// praktisch jedem Transfer der new Date()-Fallback und stempelte ihn fälschlich
// mit dem Zeitpunkt ab, an dem das Skript lief - nicht mit dem echten
// Transferzeitpunkt. "d"/"date" bleiben als Fallback stehen, falls Kickbase das
// Feld irgendwann umbenennt oder ein anderer Item-Typ es anders nennt.
function extractDate(item) {
    return item.dt || item.d || item.date || new Date().toISOString();
}

// Schreibt eine kleine Zusammenfassung (kein Rohdump mehr) darüber, wie weit die
// Kickbase activitiesFeed-Historie pro Liga tatsächlich zurückreicht - wichtig, um
// zu wissen, ob ältere (z.B. mehrere Wochen zurückliegende) Transfers überhaupt noch
// per API abrufbar sind, oder ob Kickbase selbst nur ein rollierendes Fenster liefert.
function loadFeedDepthSummary() {
    const summaryPath = path.join(__dirname, '../../frontend/public/history/_feed_depth_summary.json');
    try {
        if (fs.existsSync(summaryPath)) return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    } catch (e) {}
    return {};
}
function saveFeedDepthSummary(summary) {
    const summaryPath = path.join(__dirname, '../../frontend/public/history/_feed_depth_summary.json');
    try {
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    } catch (e) {
        console.warn('Konnte Feed-Tiefen-Zusammenfassung nicht schreiben:', e.message);
    }
}

const getConfiguredKickbaseAccounts = () => {
    const accounts = [];
    for (const suffix of ['', '_2', '_3', '_4']) {
        const email = process.env[`KICKBASE_EMAIL${suffix}`];
        const pass = process.env[`KICKBASE_PASS${suffix}`];
        if (email && pass) accounts.push({ email, pass });
    }
    return accounts;
};

async function fetchFeedForLeague(email, password, leagueNameContains) {
    const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ em: email, loy: false, pass: password, rep: {} })
    });
    const loginData = await loginRes.json();
    if (loginData.err) return { error: loginData.errMsg };

    const token = loginData.tkn;
    const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', { headers: { Authorization: `Bearer ${token}` } });
    const leaguesData = await leaguesRes.json();
    
    let targetId = null;
    const leaguesList = leaguesData?.lins || leaguesData?.leagues || (Array.isArray(leaguesData) ? leaguesData : []);
    
    const needleTokens = leagueNameContains.toLowerCase().match(/[a-z0-9]+/g) || [];
    for (const l of leaguesList) {
        const leagueName = (l.n || l.name).toLowerCase();
        const leagueTokens = leagueName.match(/[a-z0-9]+/g) || [];
        const isMatch = needleTokens.every(token => leagueTokens.includes(token));
        if (isMatch || leagueName.includes(leagueNameContains.toLowerCase())) {
            targetId = l.i || l.id;
            break;
        }
    }

    if (!targetId) return { error: `League not found` };

    console.log(`Found league ID ${targetId} for ${leagueNameContains}, fetching feed...`);
    let allTransfers = [];
    let start = 0;
    let oldestSeen = null;
    let newestSeen = null;
    let pagesFetched = 0;
    let itemsScanned = 0;

    // Wir holen bis zu 200 Seiten ab (5000 Einträge), um die gesamte Saison-Historie zu bekommen!
    for (let page = 0; page < 200; page++) {
        const feedUrl = `https://api.kickbase.com/v4/leagues/${targetId}/activitiesFeed?start=${start}`;
        const feedRes = await fetch(feedUrl, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`Feed page ${page} status:`, feedRes.status);
        if (feedRes.status !== 200) {
            console.log(`Feed failed with status ${feedRes.status}`);
            break;
        }
        const feedData = await feedRes.json();
        let items = [];
        if (Array.isArray(feedData)) {
            items = feedData;
        } else if (feedData.af && Array.isArray(feedData.af)) {
            items = feedData.af;
        } else if (feedData.items && Array.isArray(feedData.items)) {
            items = feedData.items;
        } else if (feedData.activities && Array.isArray(feedData.activities)) {
            items = feedData.activities;
        } else if (feedData.i && Array.isArray(feedData.i)) {
            items = feedData.i;
        } else {
            console.log("Could not find array in feedData. Keys:", Object.keys(feedData));
            console.log("feedData excerpt:", JSON.stringify(feedData).substring(0, 200));
            break; // Stop paginating if we can't parse
        }
        
        if (!items || items.length === 0) {
            console.log("No more items in feed.");
            break;
        }
        
        if (page === 0 && items.length > 0) {
            console.log("Sample feed item type:", items[0].t || items[0].type);
        }

        pagesFetched++;
        itemsScanned += items.length;
        items.forEach(i => {
            const d = extractDate(i);
            if (!oldestSeen || d < oldestSeen) oldestSeen = d;
            if (!newestSeen || d > newestSeen) newestSeen = d;
        });

        // Extrahieren und normalisieren wir die Transfers direkt hier!
        items.forEach(i => {
            const type = i.t || i.type;
            
            // Neues v4 Format (t=15, data.trp = transfer price)
            if (type === 15 && i.data && i.data.trp) {
                allTransfers.push({
                    id: i.i || i.id,
                    date: extractDate(i),
                    buyerName: i.data.byr,
                    sellerName: i.data.slr,
                    playerId: i.data.pi,
                    playerName: i.data.pn,
                    price: i.data.trp,
                    _rawType: 'v4_type15'
                });
            } 
            // Altes Format (type 12 oder 2)
            else if (type === 12 || type === 2) {
                const meta = i.meta || {};
                if (meta.p) {
                    allTransfers.push({
                        id: i.i || i.id,
                        date: extractDate(i),
                        buyerId: meta.b ? meta.b.i : null,
                        buyerName: meta.b ? meta.b.n : null,
                        sellerId: meta.s ? meta.s.i : null,
                        sellerName: meta.s ? meta.s.n : null,
                        playerId: meta.p.i,
                        playerName: meta.p.n || meta.p.fn,
                        price: meta.a || meta.pr || meta.price || 0,
                        _rawType: 'legacy'
                    });
                }
            }
        });
        start += 25;
    }

    return { transfers: allTransfers, feedDepth: { oldestSeen, newestSeen, pagesFetched, itemsScanned } };
}

async function run() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.log("Fetching transfer feeds...");
    const accounts = getConfiguredKickbaseAccounts();
    if (accounts.length === 0) {
        console.error("No accounts configured.");
        return;
    }

    const transfersFile = path.join(__dirname, '../../frontend/public/history/transfers.json');
    let existingTransfers = [];
    if (fs.existsSync(transfersFile)) {
        try {
            existingTransfers = JSON.parse(fs.readFileSync(transfersFile, 'utf8'));
        } catch (e) {}
    }

    const seenIds = new Set(existingTransfers.map(t => t.id || t.i));
    const transfersById = new Map(existingTransfers.map(t => [t.id || t.i, t]));
    let newTransfersCount = 0;
    let backfilledDatesCount = 0;

    const allPlayersPath = path.join(__dirname, '../../frontend/public/history/all_players.json');
    let players = [];
    if (fs.existsSync(allPlayersPath)) {
        try {
            players = JSON.parse(fs.readFileSync(allPlayersPath, 'utf8'));
        } catch (e) {}
    }
    
    // Erstelle ein Map für schnelles Nachschlagen: playerId -> marketValue
    const playerMvMap = {};
    players.forEach(p => {
        const pid = p.i || p.id;
        if (pid) {
            playerMvMap[pid] = p.mv || p.marketValue || 0;
        }
    });

    for (const def of LEAGUE_DEFS) {
        for (const account of accounts) {
            console.log(`Checking ${def.displayName} with ${account.email}...`);
            const res = await fetchFeedForLeague(account.email, account.pass, def.name);
            if (!res.error && res.transfers) {
                console.log(`Found ${res.transfers.length} transfers for ${def.displayName}`);
                if (res.feedDepth) {
                    console.log(`Feed-Tiefe ${def.displayName}: ${res.feedDepth.itemsScanned} Items über ${res.feedDepth.pagesFetched} Seiten, ältester Zeitstempel: ${res.feedDepth.oldestSeen}`);
                    const summary = loadFeedDepthSummary();
                    summary[def.displayName] = { ...res.feedDepth, checkedAt: new Date().toISOString() };
                    saveFeedDepthSummary(summary);
                }
                res.transfers.forEach(t => {
                    const tid = t.id || t.i;
                    if (!seenIds.has(tid)) {
                        seenIds.add(tid);
                        
                        // Hänge den HEUTIGEN Marktwert an, wenn wir den Transfer zum ERSTEN MAL sehen.
                        // Für alte Transfers in der Vergangenheit ist das der heutige Marktwert (Fallback).
                        // Für neue Transfers ab heute ist es der exakt tagesaktuelle Marktwert!
                        const marketValue = playerMvMap[t.playerId] || 0;
                        
                        const newEntry = { 
                            ...t, 
                            _league: def.displayName,
                            marketValueAtTimeOfTransfer: marketValue
                        };
                        existingTransfers.push(newEntry);
                        transfersById.set(tid, newEntry);
                        newTransfersCount++;
                    } else {
                        // Backfill: korrigiert das Datum bereits gespeicherter Transfers, falls
                        // wir sie erneut im Feed sehen (z.B. weil "dt" früher falsch ausgelesen
                        // wurde, siehe extractDate). Kickbase liefert für dieselbe ID immer
                        // dasselbe echte "dt" - ein Update ist also niemals falsch, nur präziser.
                        const existing = transfersById.get(tid);
                        if (existing && t.date && existing.date !== t.date) {
                            existing.date = t.date;
                            backfilledDatesCount++;
                        }
                    }
                });
                break;
            } else if (res.error) {
                console.log(`Error: ${res.error}`);
            }
        }
    }

    existingTransfers.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA;
    });

    fs.writeFileSync(transfersFile, JSON.stringify(existingTransfers, null, 2));
    console.log(`Added ${newTransfersCount} new transfers, backfilled ${backfilledDatesCount} dates. Total transfers saved: ${existingTransfers.length}`);
}

run();
