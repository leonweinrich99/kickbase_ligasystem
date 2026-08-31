const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../frontend/public/data.json');
const ADVISOR_DATA_PATH = path.join(__dirname, '../frontend/public/advisor-data.json');
const ALL_PLAYERS_PATH = path.join(__dirname, '../frontend/public/history/all_players.json');
const TRANSFERS_PATH = path.join(__dirname, '../frontend/public/history/transfers.json');

const posMap = { "TW": 1, "ABW": 2, "MF": 3, "ST": 4 };
const WEEKDAY_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Kickbase sperrt den Transfermarkt fuer den kompletten Spieltag ab Freitag
// 20:30 Uhr (deutsche Ortszeit) - NICHT erst zum individuellen Match-Kickoff
// (Owner-Bestaetigung 31.08.2026: "freitag ist der cutoff"). Wandelt einen
// beliebigen Referenz-Zeitpunkt des Spieltags (z.B. den Kickoff des ersten
// bekannten Matches) in den Freitag-20:30-Sperrzeitpunkt DERSELBEN Woche um -
// per Intl.DateTimeFormat mit "Europe/Berlin", damit die Sommer-/Winterzeit-
// Umstellung automatisch korrekt beruecksichtigt wird (keine manuelle
// UTC+1/+2-Fallunterscheidung noetig).
function getBerlinDateParts(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    }).formatToParts(date);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    return { year: +map.year, month: +map.month, day: +map.day, weekday: map.weekday };
}

function berlinWallTimeToUTC(year, month, day, hour, minute) {
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Berlin', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(guess);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const berlinGuess = new Date(Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute));
    const diff = berlinGuess.getTime() - guess.getTime();
    return new Date(guess.getTime() - diff);
}

function fridayCutoffBerlin(refDateIso) {
    const refDate = new Date(refDateIso);
    const bp = getBerlinDateParts(refDate);
    const dow = WEEKDAY_NUM[bp.weekday];
    const daysBack = (dow - 5 + 7) % 7; // Abstand zum letzten Freitag (0, falls refDate selbst Freitag ist)
    const fridayNoonUTC = new Date(Date.UTC(bp.year, bp.month - 1, bp.day, 12, 0));
    fridayNoonUTC.setUTCDate(fridayNoonUTC.getUTCDate() - daysBack);
    const fp = getBerlinDateParts(fridayNoonUTC);
    return berlinWallTimeToUTC(fp.year, fp.month, fp.day, 20, 30);
}

function getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    if (k === arr.length) return [arr];
    const [first, ...rest] = arr;
    const combsWithoutFirst = getCombinations(rest, k);
    const combsWithFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
    return [...combsWithFirst, ...combsWithoutFirst];
}

function reconstructForMatchday(mdStr) {
    const targetMatchday = parseInt(mdStr);
    const outputPath = path.join(__dirname, `../frontend/public/history/startelf-md${targetMatchday}.json`);
    console.log(`[LOG] Starting reconstruction for Matchday ${targetMatchday}...`);
    
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const advisorData = JSON.parse(fs.readFileSync(ADVISOR_DATA_PATH, 'utf8'));
    const allPlayers = JSON.parse(fs.readFileSync(ALL_PLAYERS_PATH, 'utf8'));
    const transfers = JSON.parse(fs.readFileSync(TRANSFERS_PATH, 'utf8'));
    
    let referenceTimestamp = null;
    for (const p of allPlayers) {
        if (p.performance && p.performance.it && p.performance.it.length > 0) {
            const currentSeason = p.performance.it[p.performance.it.length - 1];
            if (currentSeason.ph) {
                const mdEntry = currentSeason.ph.find(entry => entry.day === targetMatchday);
                if (mdEntry && mdEntry.md) {
                    referenceTimestamp = mdEntry.md;
                    break;
                }
            }
        }
    }
    if (!referenceTimestamp) return;
    // Transfersperre ist Freitag 20:30 (deutsche Ortszeit) DERSELBEN Woche wie
    // der Spieltag, nicht der individuelle Match-Kickoff (siehe Kommentar oben).
    const kickoffMs = fridayCutoffBerlin(referenceTimestamp).getTime();
    
    const allPlayersMap = new Map();
    for (const p of allPlayers) allPlayersMap.set(String(p.i || p.id), p);
    
    const nameToId = new Map();
    for (const league of data.leagues || []) {
        for (const user of league.users || []) {
            if (user.name) nameToId.set(user.name.toLowerCase(), String(user.id));
        }
    }
    
    let pointsFile = null;
    const pastPointsPath = path.join(__dirname, `../frontend/public/history/spieltag-${targetMatchday}.json`);
    if (fs.existsSync(pastPointsPath)) pointsFile = JSON.parse(fs.readFileSync(pastPointsPath, 'utf8'));
    
    const targetPointsMap = new Map();
    function extractPointsFromData(srcData) {
        for (const league of srcData.leagues || []) {
            for (const user of league.users || []) {
                if (user.pointsMatchday !== undefined) {
                    let pts = user.pointsMatchday;
                    if (typeof pts === 'string') pts = parseInt(pts.replace(/\./g, ''), 10);
                    targetPointsMap.set(String(user.id), pts);
                }
            }
        }
    }
    if (pointsFile) extractPointsFromData(pointsFile);
    else if (parseInt(data.matchday || 0) === targetMatchday) extractPointsFromData(data);
    
    const resultManagers = {};
    let passedCount = 0;
    
    for (const leagueId of Object.keys(advisorData.leagues || {})) {
        const managerSquads = advisorData.leagues[leagueId].managerSquads || {};
        for (const managerId of Object.keys(managerSquads)) {
            const currentSquad = managerSquads[managerId] || [];
            if (currentSquad.length === 0) continue;
            
            let kickoffSet = new Set(currentSquad.map(p => String(p.id || p.playerId)));
            for (const t of transfers) {
                const tDate = new Date(t.date).getTime();
                if (tDate > kickoffMs) {
                    const pId = String(t.playerId);
                    if (t.buyerName && nameToId.get(t.buyerName.toLowerCase()) === managerId) kickoffSet.delete(pId);
                    if (t.sellerName && nameToId.get(t.sellerName.toLowerCase()) === managerId) kickoffSet.add(pId);
                }
            }
            
            const kickoffPlayers = [];
            for (const pId of kickoffSet) {
                const playerFull = allPlayersMap.get(pId);
                if (!playerFull) continue;
                
                let mdPoints = undefined;
                if (playerFull.performance && playerFull.performance.it && playerFull.performance.it.length > 0) {
                    const currentSeason = playerFull.performance.it[playerFull.performance.it.length - 1];
                    if (currentSeason.ph) {
                        const mdEntry = currentSeason.ph.find(e => e.day === targetMatchday);
                        if (mdEntry) {
                            // HERE: undefined means 0 points!
                            mdPoints = mdEntry.p === undefined ? 0 : mdEntry.p;
                        }
                    }
                }
                
                // If it's literally undefined (e.g. no mdEntry), it means we don't have data for this player.
                // But if mdEntry exists and p is undefined, we assigned 0.
                if (mdPoints !== undefined) {
                    let pos = playerFull.pos || playerFull.p || 0;
                    if (pos > 10) pos = (pos % 10) || 0;
                    if (pos === 0) {
                         const squadEntry = currentSquad.find(s => String(s.playerId || s.id) === pId);
                         if (squadEntry && squadEntry.position) pos = posMap[squadEntry.position] || pos;
                    }
                    const name = `${playerFull.fn ? playerFull.fn + ' ' : ''}${playerFull.ln || playerFull.n || ''}`.trim();
                    const imagePath = playerFull.profileBig || playerFull.profile || playerFull.pim;
                    kickoffPlayers.push({
                        id: pId,
                        teamId: playerFull.tid || playerFull.teamId,
                        name: name,
                        lastName: playerFull.ln || playerFull.n || name,
                        position: pos,
                        marketValue: playerFull.mv || playerFull.marketValue || 0,
                        points: mdPoints,
                        imagePath: imagePath,
                        teamName: playerFull.tn || playerFull.teamName || "Unknown"
                    });
                }
            }
            
            const targetSum = targetPointsMap.get(managerId);
            if (targetSum === undefined) continue;
            
            const N = kickoffPlayers.length;
            if (N < 11) continue;
            
            let matchingSubsets = [];
            if (N === 11) {
                const sum = kickoffPlayers.reduce((acc, p) => acc + p.points, 0);
                if (sum === targetSum) matchingSubsets.push(kickoffPlayers);
            } else {
                const kExclude = N - 11;
                const totalSum = kickoffPlayers.reduce((acc, p) => acc + p.points, 0);
                const excludeCombinations = getCombinations(kickoffPlayers, kExclude);
                
                for (const excludeGroup of excludeCombinations) {
                    const excludeSum = excludeGroup.reduce((acc, p) => acc + p.points, 0);
                    if (totalSum - excludeSum === targetSum) {
                        const excludeSet = new Set(excludeGroup.map(p => p.id));
                        matchingSubsets.push(kickoffPlayers.filter(p => !excludeSet.has(p.id)));
                    }
                }
            }
            
            let mName = "Unknown";
            for (const [name, id] of nameToId.entries()) if (id === managerId) mName = name;
            
            if (matchingSubsets.length === 1) {
                const finalLineup = matchingSubsets[0];
                finalLineup.sort((a, b) => a.position - b.position);
                resultManagers[managerId] = { pointsMatchday: targetSum, lineup: finalLineup };
                console.log(`[PASS] Manager: ${mName} (ID: ${managerId}), Squad-at-kickoff size: ${N}, Reconstructed sum: ${targetSum}, Target sum: ${targetSum}, Match: YES`);
                passedCount++;
            } else if (matchingSubsets.length > 1) {
                console.log(`[FAIL/AMBIGUOUS] Manager: ${mName} (ID: ${managerId}), Squad-at-kickoff size: ${N}, matches: ${matchingSubsets.length}. Omitting.`);
            } else {
                console.log(`[FAIL/NO_MATCH] Manager: ${mName} (ID: ${managerId}), Squad-at-kickoff size: ${N}, matches: 0. Omitting.`);
            }
        }
    }
    
    fs.writeFileSync(outputPath, JSON.stringify({ matchday: targetMatchday, timestamp: new Date().toISOString(), managers: resultManagers }, null, 2));
    console.log(`[SUCCESS] Data saved to ${outputPath} with ${passedCount} reconstructed managers.`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
    const dataJson = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    if (dataJson.matchday) reconstructForMatchday(String(dataJson.matchday));
} else reconstructForMatchday(args[0]);
