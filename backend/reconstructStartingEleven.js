require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getConfiguredKickbaseAccounts, LEAGUE_DEFS } = require('./kickbase');


const DATA_PATH = path.join(__dirname, '../frontend/public/data.json');
const ALL_PLAYERS_PATH = path.join(__dirname, '../frontend/public/history/all_players.json');
const ADVISOR_DATA_PATH = path.join(__dirname, '../frontend/public/advisor-data.json');
const TRANSFERS_PATH = path.join(__dirname, '../frontend/public/history/transfers.json');

// Find subset summing to target
function findSubset(players, target) {
    let best = null;
    function backtrack(index, currentSum, currentSubset) {
        if (currentSubset.length > 11) return;
        const penalty = (11 - currentSubset.length) * 100;
        if (currentSum - penalty === target) {
            if (!best || currentSubset.length > best.length) {
                best = [...currentSubset];
            }
        }
        if (index >= players.length) return;
        
        currentSubset.push(players[index]);
        backtrack(index + 1, currentSum + players[index].points, currentSubset);
        currentSubset.pop();
        
        backtrack(index + 1, currentSum, currentSubset);
    }
    backtrack(0, 0, []);
    return best;
}

async function loginAllLeagues() {
    const accounts = getConfiguredKickbaseAccounts();
    const leagueSessions = [];

    for (const leagueDef of LEAGUE_DEFS) {
        const leagueNameContains = leagueDef.name;
        const needleTokens = leagueNameContains.toLowerCase().match(/[a-z0-9]+/g) || [];
        let found = null;

        for (const account of accounts) {
            try {
                const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ em: account.email, loy: false, pass: account.pass, rep: {} })
                });
                const loginData = await loginRes.json();
                if (loginData.err || !loginData.tkn) continue;

                const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', {
                    headers: { Authorization: `Bearer ${loginData.tkn}` }
                });
                const leaguesData = await leaguesRes.json();
                const leaguesList = leaguesData?.it || leaguesData?.lins || leaguesData?.leagues || (Array.isArray(leaguesData) ? leaguesData : []);

                let foundId = null;
                for (const l of leaguesList) {
                    const lName = (l.n || l.name || '').toLowerCase();
                    const leagueTokens = lName.match(/[a-z0-9]+/g) || [];
                    const isMatch = needleTokens.length > 0 && needleTokens.every(t => leagueTokens.includes(t));
                    if (isMatch || lName.includes(leagueNameContains.toLowerCase())) {
                        foundId = l.i || l.id;
                        break;
                    }
                }

                if (foundId) {
                    const rankingRes = await fetch(`https://api.kickbase.com/v4/leagues/${foundId}/ranking`, {
                        headers: { Authorization: `Bearer ${loginData.tkn}` }
                    });
                    const rankingData = await rankingRes.json();
                    if (rankingData.us && rankingData.us.length > 0) {
                        found = {
                            leagueName: leagueDef.name,
                            leagueId: foundId,
                            token: loginData.tkn,
                            userId: rankingData.us[0].i || rankingData.us[0].id
                        };
                        break;
                    }
                }
            } catch (e) {}
        }

        if (found) leagueSessions.push(found);
        else console.warn(`[WARN] Konnte Liga '${leagueDef.name}' in keinem Account finden.`);
    }

    return leagueSessions;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function reconstructForMatchday(targetMatchdayStr, sharedSessions = null) {
    const targetMatchday = parseInt(targetMatchdayStr, 10);
    console.log(`[LOG] Starting official Startelf fetch/reconstruction for Matchday ${targetMatchday}...`);
    const outputPath = path.join(__dirname, `../frontend/public/history/startelf-md${targetMatchday}.json`);

    const dataJson = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const allPlayers = JSON.parse(fs.readFileSync(ALL_PLAYERS_PATH, 'utf8'));
    const advisorData = JSON.parse(fs.readFileSync(ADVISOR_DATA_PATH, 'utf8'));
    const transfers = JSON.parse(fs.readFileSync(TRANSFERS_PATH, 'utf8'));

    // 1. Find global kickoff for this matchday
    let minKo = Infinity;
    const allPlayersMap = new Map();
    const playerPoints = new Map();
    for (const p of allPlayers) {
        const pId = String(p.i || p.id);
        allPlayersMap.set(pId, p);
        if (p.performance?.it?.length > 0) {
            const currentSeason = p.performance.it[p.performance.it.length - 1];
            if (currentSeason.ph) {
                const mdEntry = currentSeason.ph.find(e => e.day === targetMatchday);
                if (mdEntry) {
                    if (mdEntry.md) {
                        const ts = new Date(mdEntry.md).getTime();
                        if (ts < minKo) minKo = ts;
                    }
                    if (mdEntry.p !== undefined) playerPoints.set(pId, mdEntry.p);
                }
            }
        }
    }
    if (minKo === Infinity) {
        console.error("Could not determine global kickoff cutoff.");
        return;
    }
    console.log(`Global kickoff cutoff for Matchday ${targetMatchday}: ${new Date(minKo).toISOString()}`);

    const nameToId = new Map();
    for (const l of dataJson.leagues) {
        for (const u of l.users) nameToId.set(u.name.toLowerCase(), String(u.id));
    }

    // 2. Build current squads (use snapshot if available, else current advisorData)
    const snapshotPath = path.join(__dirname, `../frontend/public/history/kickoff-squads/md${targetMatchday}.json`);
    let currentSquads = new Map();
    let baseTime = null;

    if (fs.existsSync(snapshotPath)) {
        console.log(`[LOG] Found kickoff snapshot for Matchday ${targetMatchday}, using it as base.`);
        const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        baseTime = new Date(snapshotData.timestamp).getTime();
        for (const mId in snapshotData.squads) {
            currentSquads.set(String(mId), new Set(snapshotData.squads[mId]));
        }
    } else {
        console.log(`[LOG] No kickoff snapshot found. Winding back from current LIVE squads.`);
        baseTime = Date.now();
        for (const lName in advisorData.leagues) {
            for (const mId in advisorData.leagues[lName].managerSquads) {
                const players = advisorData.leagues[lName].managerSquads[mId];
                const ids = new Set(players.map(p => String(p.playerId || p.id)));
                currentSquads.set(String(mId), ids);
            }
        }
    }

    // 3. Wind back/forward transfers between baseTime and Kickoff
    const sortedTransfers = [...transfers].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    for (const t of sortedTransfers) {
        const tTime = new Date(t.date).getTime();

        if (baseTime > minKo) {
            if (tTime <= minKo || tTime > baseTime) continue;
            const pId = String(t.playerId);
            if (t.buyerName) {
                const bId = nameToId.get(t.buyerName.toLowerCase());
                if (bId && currentSquads.has(bId)) currentSquads.get(bId).delete(pId);
            }
            if (t.sellerName) {
                const sId = nameToId.get(t.sellerName.toLowerCase());
                if (sId && currentSquads.has(sId)) currentSquads.get(sId).add(pId);
            }
        } else {
            if (tTime <= baseTime || tTime > minKo) continue;
            const pId = String(t.playerId);
            if (t.buyerName) {
                const bId = nameToId.get(t.buyerName.toLowerCase());
                if (bId) {
                    if (!currentSquads.has(bId)) currentSquads.set(bId, new Set());
                    currentSquads.get(bId).add(pId);
                }
            }
            if (t.sellerName) {
                const sId = nameToId.get(t.sellerName.toLowerCase());
                if (sId && currentSquads.has(sId)) currentSquads.get(sId).delete(pId);
            }
        }
    }

    // 4. Fetch official lineups (u.lp) and matchday points from teamcenter
    const leagueSessions = sharedSessions || await loginAllLeagues();
    const resultManagers = {};
    let passedCount = 0;
    const sourceCounts = { official_lp: 0, subset_sum: 0, fallback_squad: 0, estimated: 0 };

    // Gemeinsamer playercenter-Cache ueber alle 3 Ligen pro Spieltag (spart API-Calls)
    const livePlayerPointsCache = new Map();

    for (const session of leagueSessions) {
        const { leagueName, leagueId, token, userId } = session;

        try {
            const tcRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/users/${userId}/teamcenter?dayNumber=${targetMatchday}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const tcData = await tcRes.json();
            const users = tcData.us || [];

            const fetchExactPlayerPoints = async (pId) => {
                if (livePlayerPointsCache.has(pId)) return livePlayerPointsCache.get(pId);
                try {
                    await sleep(45);
                    const pcRes = await fetch(
                        `https://api.kickbase.com/v4/competitions/1/players/${pId}/playercenter?dayNumber=${targetMatchday}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    if (pcRes.ok) {
                        const pc = await pcRes.json();
                        if (typeof pc?.p === 'number') {
                            livePlayerPointsCache.set(pId, pc.p);
                            return pc.p;
                        }
                    }
                } catch (e) {}
                const fallback = playerPoints.get(pId) || 0;
                livePlayerPointsCache.set(pId, fallback);
                return fallback;
            };

            const buildPlayerEntry = (pId, ptsOverride = null) => {
                const playerFull = allPlayersMap.get(pId);
                const transferFallback = !playerFull ? transfers.find(t => String(t.playerId) === pId) : null;
                if (!playerFull && !transferFallback) {
                    return {
                        id: String(pId),
                        teamId: "0",
                        name: `Spieler ${pId}`,
                        lastName: `Spieler ${pId}`,
                        position: 0,
                        marketValue: 0,
                        points: ptsOverride !== null ? ptsOverride : (playerPoints.get(pId) || 0),
                        imagePath: "",
                        teamName: "Unknown"
                    };
                }

                let pos = playerFull ? (playerFull.pos || playerFull.p || 0) : 0;
                if (pos > 10) pos = (pos % 10) || 0;

                let name = pId;
                let lastName = pId;
                let teamId = "0";
                let marketValue = 0;
                let imagePath = "";
                let teamName = "Unknown";

                if (playerFull) {
                    name = `${playerFull.fn ? playerFull.fn + ' ' : ''}${playerFull.ln || playerFull.n || ''}`.trim();
                    lastName = playerFull.ln || playerFull.n || name;
                    teamId = playerFull.tid || playerFull.teamId;
                    marketValue = playerFull.mv || playerFull.marketValue || 0;
                    imagePath = playerFull.profileBig || playerFull.profile || playerFull.pim;
                    teamName = playerFull.tn || playerFull.teamName || "Unknown";
                } else if (transferFallback) {
                    name = transferFallback.playerName;
                    lastName = transferFallback.playerName;
                    marketValue = transferFallback.marketValueAtTimeOfTransfer || transferFallback.price || 0;
                }

                return {
                    id: String(pId),
                    teamId: teamId,
                    name: name,
                    lastName: lastName,
                    position: pos,
                    marketValue: marketValue,
                    points: ptsOverride !== null ? ptsOverride : (playerPoints.get(pId) || 0),
                    imagePath: imagePath,
                    teamName: teamName
                };
            };

            for (const u of users) {
                const mId = String(u.i);
                const mPoints = u.mdp || 0;

                // 1. Primaer: offizielle Kickbase-Startelf (u.lp) direkt aus teamcenter
                // -> enthaelt garantiert NUR aufgestellte Startelf-Spieler (keine Bank!).
                const hasOfficialLp = Array.isArray(u.lp);
                const officialLp = hasOfficialLp
                    ? u.lp.map(String).filter(id => id && id !== '0' && id !== 'null' && id !== 'undefined')
                    : [];
                let lineup = null;
                let source = 'official_lp';

                if (officialLp.length > 0) {
                    lineup = officialLp.map(pId => buildPlayerEntry(pId));
                    const initialSum = lineup.reduce((s, p) => s + (p.points || 0), 0);
                    const emptyPenalty = Math.max(0, 11 - lineup.length) * 100;
                    if (initialSum - emptyPenalty !== mPoints) {
                        const exactEntries = [];
                        for (const pId of officialLp) {
                            const exactPts = await fetchExactPlayerPoints(pId);
                            exactEntries.push(buildPlayerEntry(pId, exactPts));
                        }
                        lineup = exactEntries;
                    }
                } else if (hasOfficialLp && mPoints === 0) {
                    // Offiziell leere Aufstellung (z.B. im Minus zum Anstoss) -> keine Fake-Spieler erfinden
                    lineup = [];
                    source = 'official_lp';
                } else {
                    // 2. Fallback: Subset-Sum-Rekonstruktion falls Kickbase fuer sehr alte Spieltage kein u.lp liefert
                    source = 'subset_sum';
                    const squadIds = Array.from(currentSquads.get(mId) || []);
                    const squadWithPoints = squadIds
                        .map(pId => (allPlayersMap.has(pId) || transfers.some(t => String(t.playerId) === pId)) ? buildPlayerEntry(pId) : null)
                        .filter(Boolean);

                    squadWithPoints.sort((a, b) => b.marketValue - a.marketValue);
                    lineup = findSubset(squadWithPoints, mPoints);

                    if (!lineup && squadWithPoints.length <= 11) {
                        lineup = squadWithPoints;
                        source = 'fallback_squad';
                    } else if (!lineup) {
                        function findSubsetNoPenalty(players, target) {
                            let best = null;
                            function backtrack(index, currentSum, currentSubset) {
                                if (currentSubset.length > 11) return;
                                if (currentSum === target && (!best || currentSubset.length > best.length)) best = [...currentSubset];
                                if (index >= players.length) return;
                                currentSubset.push(players[index]);
                                backtrack(index + 1, currentSum + players[index].points, currentSubset);
                                currentSubset.pop();
                                backtrack(index + 1, currentSum, currentSubset);
                            }
                            backtrack(0, 0, []);
                            return best;
                        }
                        const noPen = findSubsetNoPenalty(squadWithPoints, mPoints);
                        if (noPen) {
                            lineup = noPen;
                        } else {
                            lineup = squadWithPoints.slice(0, 11);
                            source = 'estimated';
                        }
                    }
                }

                lineup.sort((a, b) => a.position - b.position);

                resultManagers[mId] = { pointsMatchday: mPoints, source, lineup: lineup };
                sourceCounts[source] = (sourceCounts[source] || 0) + 1;
                passedCount++;
                console.log(`[PASS:${source}] Manager: ${u.unm} (ID: ${mId}), Matchday points: ${mPoints} -> Lineup size: ${lineup.length}`);
            }
        } catch (e) {
            console.error(`Error fetching teamcenter for league ${leagueName}: ${e.message}`);
        }
    }

    fs.writeFileSync(outputPath, JSON.stringify({ matchday: targetMatchday, timestamp: new Date().toISOString(), managers: resultManagers }, null, 2));
    console.log(`[SUCCESS MD ${targetMatchday}] Saved ${passedCount} managers -> ${JSON.stringify(sourceCounts)}`);
}

async function runCli() {
    const args = process.argv.slice(2);
    const dataJson = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const currentMatchday = dataJson.matchday || 1;
    const arg = (args[0] || '').trim().toLowerCase();

    if (arg === 'all') {
        const sessions = await loginAllLeagues();
        for (let d = 1; d <= currentMatchday; d++) {
            await reconstructForMatchday(String(d), sessions);
        }
    } else if (arg && /^\d+$/.test(arg)) {
        await reconstructForMatchday(arg);
    } else {
        await reconstructForMatchday(String(currentMatchday));
    }
}

runCli().catch(err => {
    console.error('Fehler bei Startelf-Ermittlung:', err);
    process.exit(1);
});
