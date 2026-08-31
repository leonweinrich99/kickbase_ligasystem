require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getConfiguredKickbaseAccounts, LEAGUE_DEFS } = require('./kickbase');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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

async function reconstructForMatchday(targetMatchdayStr) {
    const targetMatchday = parseInt(targetMatchdayStr, 10);
    console.log(`[LOG] Starting true Startelf reconstruction for Matchday ${targetMatchday}...`);
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
    const sortedTransfers = transfers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    for (const t of sortedTransfers) {
        const tTime = new Date(t.date).getTime();
        
        // If snapshot is older than kickoff, we might need to wind FORWARD
        // But our snapshot logic always stops snapshotting AT kickoff.
        // So the snapshot is either strictly <= minKo, or it's LIVE (Date.now()).
        
        if (baseTime > minKo) {
            // Winding BACK from a future time to kickoff
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
            // Snapshot was taken before kickoff, we need to wind FORWARD to kickoff
            if (tTime <= baseTime || tTime > minKo) continue;
            const pId = String(t.playerId);
            if (t.buyerName) {
                const bId = nameToId.get(t.buyerName.toLowerCase());
                if (bId) {
                    if (!currentSquads.has(bId)) currentSquads.set(bId, new Set());
                    currentSquads.get(bId).add(pId); // Winding FORWARD: buyer gets the player
                }
            }
            if (t.sellerName) {
                const sId = nameToId.get(t.sellerName.toLowerCase());
                if (sId && currentSquads.has(sId)) currentSquads.get(sId).delete(pId); // Winding FORWARD: seller loses the player
            }
        }
    }

    // 4. Fetch manager points from teamcenter using kickbase API
    const accounts = getConfiguredKickbaseAccounts();
    const resultManagers = {};
    let passedCount = 0;

    for (const leagueDef of LEAGUE_DEFS) {
        let loggedIn = false, token = null, userId = null, leagueId = null;
        const leagueNameContains = leagueDef.name;
        const needleTokens = leagueNameContains.toLowerCase().match(/[a-z0-9]+/g) || [];

        for (const account of accounts) {
            try {
                const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ em: account.email, loy: false, pass: account.pass, rep: {} })
                });
                const loginData = await loginRes.json();
                if (loginData.err) continue;
                
                const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', {
                    headers: { Authorization: `Bearer ${loginData.tkn}` }
                });
                const leaguesData = await leaguesRes.json();
                const leaguesList = leaguesData?.it || leaguesData?.lins || leaguesData?.leagues || (Array.isArray(leaguesData) ? leaguesData : []);
                
                let foundId = null;
                for (const l of leaguesList) {
                    const lName = (l.n || l.name).toLowerCase();
                    const leagueTokens = lName.match(/[a-z0-9]+/g) || [];
                    const isMatch = needleTokens.length > 0 && needleTokens.every(t => leagueTokens.includes(t));
                    if (isMatch || lName.includes(leagueNameContains.toLowerCase())) {
                        foundId = l.i || l.id;
                        break;
                    }
                }
                
                if (foundId) {
                    leagueId = foundId;
                    token = loginData.tkn;
                    const rankingRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/ranking`, { headers: { Authorization: `Bearer ${token}` } });
                    const rankingData = await rankingRes.json();
                    if (rankingData.us && rankingData.us.length > 0) {
                        userId = rankingData.us[0].i || rankingData.us[0].id;
                        loggedIn = true;
                        break;
                    }
                }
            } catch (e) {}
        }

        if (!loggedIn) continue;

        try {
            const tcRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/users/${userId}/teamcenter?dayNumber=${targetMatchday}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const tcData = await tcRes.json();
            const users = tcData.us || [];

            for (const u of users) {
                const mId = String(u.i);
                const mPoints = u.mdp || 0;
                
                const squadIds = Array.from(currentSquads.get(mId) || []);
                const squadWithPoints = squadIds.map(pId => {
                    const playerFull = allPlayersMap.get(pId);
                    
                    // Fallback to transfer history if player was removed from Kickbase database
                    const transferFallback = !playerFull ? transfers.find(t => String(t.playerId) === pId) : null;
                    if (!playerFull && !transferFallback) return null;
                    
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
                        points: playerPoints.get(pId) || 0,
                        imagePath: imagePath,
                        teamName: teamName
                    };
                }).filter(Boolean);

                // Sort by market value so subset sum prefers expensive players if tied
                squadWithPoints.sort((a, b) => b.marketValue - a.marketValue);
                
                let lineup = findSubset(squadWithPoints, mPoints);
                
                if (!lineup && squadWithPoints.length <= 11) {
                    // Fallback to all if somehow points dont perfectly match (e.g. offline transfer changes?)
                    lineup = squadWithPoints;
                } else if (!lineup) {
                    // Try without empty spot penalty (in case league disabled it)
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
                    lineup = findSubsetNoPenalty(squadWithPoints, mPoints) || squadWithPoints.slice(0, 11);
                }

                lineup.sort((a, b) => a.position - b.position);

                resultManagers[mId] = { pointsMatchday: mPoints, lineup: lineup };
                passedCount++;
                console.log(`[PASS] Manager: ${u.unm} (ID: ${mId}), Matchday points: ${mPoints} -> Reconstructed lineup size: ${lineup.length}`);
            }
        } catch (e) {
            console.error(`Error fetching teamcenter for league ${leagueDef.name}: ${e.message}`);
        }
    }

    fs.writeFileSync(outputPath, JSON.stringify({ matchday: targetMatchday, timestamp: new Date().toISOString(), managers: resultManagers }, null, 2));
    console.log(`[SUCCESS] Data saved to ${outputPath} with ${passedCount} managers.`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
    const dataJson = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    if (dataJson.matchday) reconstructForMatchday(String(dataJson.matchday));
    else console.error("No matchday found in data.json");
} else {
    reconstructForMatchday(args[0]);
}
