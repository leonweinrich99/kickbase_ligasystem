require('dotenv').config();
const fs = require('fs');
const path = require('path');
const solver = require('javascript-lp-solver');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchOptimalTeam(force = false) {
    const email = process.env.KICKBASE_EMAIL;
    const password = process.env.KICKBASE_PASS;
    const targetLeagueName = process.env.KICKBASE_LEAGUE || "test"; 

    if (!email || !password) {
        console.error("KICKBASE_EMAIL oder KICKBASE_PASS fehlt.");
        return;
    }

    try {
        console.log("[LOG] Start fetchOptimalTeam...");
        
        // 1. Login
        const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ em: email, loy: false, pass: password, rep: {} })
        });
        const loginData = await loginRes.json();
        if (loginData.err) throw new Error(`Login failed: ${loginData.errMsg}`);
        const token = loginData.tkn;
        
        // 2. League ID
        const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const leaguesData = await leaguesRes.json();
        const leagues = leaguesData.lins || leaguesData.leagues || [];
        let league = leagues.find(l => (l.n || l.name || "").toLowerCase().includes(targetLeagueName.toLowerCase())) || leagues[0];
        if (!league) throw new Error("Keine Liga gefunden.");
        const leagueId = league.i || league.id;

        // 3. Current Matchday
        const rankingRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/ranking`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const rankingData = await rankingRes.json();
        const currentMatchday = rankingData.day || 0;
        
        const finalPath = path.join(__dirname, `../frontend/public/history/optimal-md-${currentMatchday}-final.json`);
        const dumpPath = path.join(__dirname, '../frontend/public/history/all_players.json');
        
        // 1. Check if all_players.json exists and how many players it has
        let existingPlayerCount = 0;
        let allPlayersMtime = 0;
        if (fs.existsSync(dumpPath)) {
            try {
                const stats = fs.statSync(dumpPath);
                allPlayersMtime = stats.mtimeMs;
                const existingData = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
                existingPlayerCount = Array.isArray(existingData) ? existingData.length : 0;
            } catch (e) {}
        }

        // 2. Check if optimal team exists
        let optimalMtime = 0;
        if (fs.existsSync(finalPath)) {
            optimalMtime = fs.statSync(finalPath).mtimeMs;
        }

        // 3. Determine if we need to fetch all players
        // We fetch if: force is true OR all_players.json is missing OR all_players.json has suspiciously few players (< 100)
        const needsPlayerFetch = force || existingPlayerCount < 100;

        // 4. Determine if we need to solve (if we already fetched, we definitely solve)
        // If we didn't fetch, we still solve if: optimal team missing OR all_players.json is newer than optimal team
        const needsSolving = needsPlayerFetch || !fs.existsSync(finalPath) || allPlayersMtime > optimalMtime;

        if (!needsSolving && !force) {
            console.log(`[LOG] Optimale Elf für MD ${currentMatchday} ist aktuell. Überspringe.`);
            return;
        }

        if (force) {
            console.log(`[LOG] Force-Modus aktiv: MD ${currentMatchday} wird komplett neu geladen und berechnet.`);
        } else if (needsPlayerFetch) {
            console.log(`[LOG] Daten unvollständig (${existingPlayerCount} Spieler). Starte vollständigen Abruf...`);
        } else if (needsSolving) {
            console.log(`[LOG] Neue Spielerdaten gefunden. Berechne Optimale Elf für MD ${currentMatchday} neu...`);
        }

        let allPlayersMap = new Map();

        if (needsPlayerFetch) {
            console.log(`[LOG] Berechne Optimale Elf für Spieltag ${currentMatchday}...`);

            // 4. Markt-Abruf
            try {
                const mRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/market`, { headers: { Authorization: `Bearer ${token}` } });
                if (mRes.ok) {
                    const mData = await mRes.json();
                    const mList = mData.players || mData.pl || mData.it || [];
                    mList.forEach(p => {
                        const pId = p.i || p.id;
                        if (pId) {
                            let pos = p.pos || p.p || 0;
                            if (pos > 10) pos = (p.p % 10) || 0;
                            allPlayersMap.set(pId, { id: pId, teamId: p.tid || p.t || 0, name: `${p.fn ? p.fn + ' ' : ''}${p.n || p.ln || ''}`.trim(), lastName: p.ln || p.n || '', position: pos, marketValue: p.mv || p.marketValue || 0 });
                        }
                    });
                }
            } catch (e) {}

            // 5. Team-Abrufe (Um alle Spieler zu bekommen)
            const teamIds = [2,3,4,5,7,8,9,10,11,13,14,15,18,19,20,22,24,28,40,43]; 
            for (const teamId of teamIds) {
                try {
                    let url = `https://api.kickbase.com/v4/leagues/${leagueId}/teams/${teamId}/teamprofile`;
                    let r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                    
                    if (r.ok) {
                        const d = await r.json();
                        const list = d.it || d.players || d.pl || d.p || [];
                        console.log(`[DEBUG] Team ID ${teamId} (${url}): ${list.length} Spieler gefunden.`);
                        list.forEach(p => {
                            const pId = p.i || p.id;
                            if (pId && !allPlayersMap.has(pId)) {
                                let pos = p.pos || p.p || 0;
                                if (pos > 10) pos = (p.p % 10) || 0;
                                allPlayersMap.set(pId, { id: pId, teamId: teamId, name: `${p.fn ? p.fn + ' ' : ''}${p.n || p.ln || ''}`.trim(), lastName: p.ln || p.n || '', position: pos, marketValue: p.mv || p.marketValue || 0 });
                            }
                        });
                    } else {
                        console.log(`[ERROR] Endpunkt fehlgeschlagen für Team ID ${teamId} (Status: ${r.status}).`);
                    }
                } catch (e) {
                    console.log(`[ERROR] Exception bei Team ID ${teamId}: ${e.message}`);
                }
                await delay(30);
            }
        } else {
            // Load existing players from disk
            const existingData = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
            existingData.forEach(pData => {
                // We need to map back to the structure used by the solver
                let pos = pData.pos || pData.p || 0;
                if (pos > 10) pos = (pos % 10) || 0;
                
                // Extrahiere Punkte für den Solver
                let points = null;
                if (pData.performance && pData.performance.it && pData.performance.it.length > 0) {
                    const currentSeason = pData.performance.it[pData.performance.it.length - 1];
                    if (currentSeason.ph) {
                        const mdEntry = currentSeason.ph.find(entry => entry.day === currentMatchday);
                        if (mdEntry && mdEntry.p !== undefined) {
                            points = mdEntry.p;
                        }
                    }
                }

                allPlayersMap.set(pData.i, { 
                    id: pData.i, 
                    teamId: pData.tid, 
                    name: `${pData.fn ? pData.fn + ' ' : ''}${pData.ln || pData.n || ''}`.trim(), 
                    lastName: pData.ln || pData.n || '', 
                    position: pos, 
                    marketValue: pData.mv || 0,
                    points: points,
                    teamName: pData.tn || "Unknown"
                });
            });
        }

        const allPlayersList = Array.from(allPlayersMap.values());
        
        if (needsPlayerFetch) {
            console.log(`[LOG] Hole Performance-Daten für ${allPlayersList.length} Spieler...`);
            
            const rawPlayers = [];
            for (let i = 0; i < allPlayersList.length; i++) {
                const p = allPlayersList[i];
                try {
                    const pRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/players/${p.id}`, { headers: { Authorization: `Bearer ${token}` } });
                    if (pRes.ok) {
                        const pData = await pRes.json();
                        
                        // PERFORMANCE FETCH
                        try {
                            const perfRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/players/${p.id}/performance`, { headers: { Authorization: `Bearer ${token}` } });
                            if (perfRes.ok) pData.performance = await perfRes.json();
                        } catch (pe) {}

                        rawPlayers.push(pData);

                        // Strict Point Extraction from Performance History
                        let points = null;
                        if (pData.performance && pData.performance.it && pData.performance.it.length > 0) {
                            const currentSeason = pData.performance.it[pData.performance.it.length - 1];
                            if (currentSeason.ph) {
                                const mdEntry = currentSeason.ph.find(entry => entry.day === currentMatchday);
                                if (mdEntry && mdEntry.p !== undefined) {
                                    points = mdEntry.p;
                                }
                            }
                        }
                        
                        p.points = points;
                        p.imagePath = p.id;
                        p.teamName = pData.tn || "Unknown";
                    }
                } catch (e) {}
                if (i % 100 === 0) console.log(`[LOG] Progress: ${i}/${allPlayersList.length}`);
                await delay(20);
            }

            // Save all_players.json
            fs.writeFileSync(dumpPath, JSON.stringify(rawPlayers, null, 2));
        }

        // 7. Solver
        const pool = allPlayersList.filter(p => p.points !== null && p.position >= 1 && p.position <= 4);
        console.log(`[LOG] Solver Pool: ${pool.length} players with points.`);

        const model = {
            optimize: "points",
            opType: "max",
            constraints: {
                budget: { max: 250000000 },
                total_players: { equal: 11 },
                pos_1: { equal: 1 },
                pos_2: { min: 3, max: 5 },
                pos_3: { min: 3, max: 5 },
                pos_4: { min: 1, max: 3 }
            },
            variables: {},
            ints: {}
        };

        const tIds = [...new Set(pool.map(p => p.teamId))];
        tIds.forEach(tid => { if (tid > 0) model.constraints[`t_${tid}`] = { max: 3 }; });

        pool.forEach(p => {
            const v = `p_${p.id}`;
            model.variables[v] = { points: p.points, budget: p.marketValue, total_players: 1, [`pos_${p.position}`]: 1, [`t_${p.teamId}`]: 1, [v]: 1 };
            model.constraints[v] = { max: 1 };
            model.ints[v] = 1;
        });

        const res = solver.Solve(model);
        if (res.feasible) {
            const lineup = pool.filter(p => res[`p_${p.id}`] > 0.5);
            lineup.sort((a, b) => a.position - b.position);

            const result = {
                matchday: currentMatchday,
                totalPoints: Math.round(lineup.reduce((s, p) => s + p.points, 0)),
                totalBudget: lineup.reduce((s, p) => s + p.marketValue, 0),
                timestamp: new Date().toISOString(),
                lineup: lineup
            };

            fs.writeFileSync(finalPath, JSON.stringify(result, null, 2));
            console.log(`[SUCCESS] MD ${currentMatchday} Final gespeichert! (${result.totalPoints} Pkt)`);
            
            // Update history index if needed
            updateHistoryIndex(currentMatchday);
        } else {
            console.error("[ERROR] No feasible lineup.");
        }

    } catch (error) {
        console.error(`[FATAL] ${error.message}`);
    }
}

function updateHistoryIndex(md) {
    const indexPath = path.join(__dirname, '../frontend/public/history/index.json');
    try {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        if (!index.matchdays.includes(md)) {
            index.matchdays.push(md);
            index.matchdays.sort((a, b) => b - a);
            fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
        }
    } catch (e) {}
}

module.exports = { fetchOptimalTeam };

if (require.main === module) {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    fetchOptimalTeam(force);
}

