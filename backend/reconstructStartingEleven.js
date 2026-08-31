require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getConfiguredKickbaseAccounts, LEAGUE_DEFS } = require('./kickbase');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DATA_PATH = path.join(__dirname, '../frontend/public/data.json');
const ALL_PLAYERS_PATH = path.join(__dirname, '../frontend/public/history/all_players.json');

async function reconstructForMatchday(targetMatchdayStr) {
    const targetMatchday = parseInt(targetMatchdayStr, 10);
    console.log(`[LOG] Starting true Startelf fetching for Matchday ${targetMatchday} via teamcenter...`);
    const outputPath = path.join(__dirname, `../frontend/public/history/startelf-md${targetMatchday}.json`);

    const dataJson = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const allPlayers = JSON.parse(fs.readFileSync(ALL_PLAYERS_PATH, 'utf8'));

    const allPlayersMap = new Map();
    for (const p of allPlayers) allPlayersMap.set(String(p.i || p.id), p);

    const accounts = getConfiguredKickbaseAccounts();
    if (accounts.length === 0) {
        console.error("No Kickbase accounts configured.");
        return;
    }

    const resultManagers = {};
    let passedCount = 0;

    for (const leagueDef of LEAGUE_DEFS) {
        let loggedIn = false;
        let token = null;
        let userId = null;
        let leagueId = null;

        const leagueNameContains = leagueDef.name;
        const needleTokens = leagueNameContains.toLowerCase().match(/[a-z0-9]+/g) || [];

        // Try to login with accounts until we find one that has the league
        for (const account of accounts) {
            try {
                const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ em: account.email, loy: false, pass: account.pass, rep: {} })
                });
                const loginData = await loginRes.json();
                if (loginData.err) {
                    console.error(`Login failed for ${account.email}: ${loginData.errMsg}`);
                    continue;
                }
                
                const curToken = loginData.tkn;
                const curUserId = loginData.us.i || loginData.us.id;

                const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', {
                    headers: { Authorization: `Bearer ${curToken}` }
                });
                const leaguesData = await leaguesRes.json();
                
                // MATCHING LOGIC IDENTICAL TO kickbase.js
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
                    token = curToken;
                    userId = curUserId;
                    loggedIn = true;
                    console.log(`Found league ${leagueDef.name} with account ${account.email}`);
                    break;
                } else {
                    console.log(`League ${leagueDef.name} not found with account ${account.email}`);
                }
            } catch (e) {
                console.error(`Error testing account ${account.email}:`, e);
            }
        }

        if (!loggedIn) {
            console.error(`Could not find league ${leagueDef.name} with any configured account.`);
            continue;
        }

        console.log(`[LOG] Fetching teamcenter for League: ${leagueDef.name} (LeagueID: ${leagueId}, UserID: ${userId}) for Matchday ${targetMatchday}`);
        
        try {
            const tcRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/users/${userId}/teamcenter?dayNumber=${targetMatchday}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const tcData = await tcRes.json();
            const users = tcData.us || [];

            for (const u of users) {
                const mId = String(u.i);
                const mName = u.unm;
                const mPoints = u.mdp || 0;
                const lineupIds = u.lp || [];

                if (lineupIds.length === 0) continue; // Not set or not loaded

                const finalLineup = [];
                for (const pId of lineupIds) {
                    const playerFull = allPlayersMap.get(String(pId));
                    if (!playerFull) continue;

                    let mdPoints = 0;
                    if (playerFull.performance && playerFull.performance.it && playerFull.performance.it.length > 0) {
                        const currentSeason = playerFull.performance.it[playerFull.performance.it.length - 1];
                        if (currentSeason.ph) {
                            const mdEntry = currentSeason.ph.find(e => e.day === targetMatchday);
                            if (mdEntry && mdEntry.p !== undefined) {
                                mdPoints = mdEntry.p;
                            }
                        }
                    }

                    let pos = playerFull.pos || playerFull.p || 0;
                    if (pos > 10) pos = (pos % 10) || 0;

                    const name = `${playerFull.fn ? playerFull.fn + ' ' : ''}${playerFull.ln || playerFull.n || ''}`.trim();
                    const imagePath = playerFull.profileBig || playerFull.profile || playerFull.pim;

                    finalLineup.push({
                        id: String(pId),
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

                // Sort by position (1 = Torwart, 2 = Abwehr, 3 = Mittelfeld, 4 = Sturm)
                finalLineup.sort((a, b) => a.position - b.position);

                resultManagers[mId] = { pointsMatchday: mPoints, lineup: finalLineup };
                passedCount++;
                console.log(`[PASS] Manager: ${mName} (ID: ${mId}), Lineup-Size: ${finalLineup.length}, Points: ${mPoints}`);
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
