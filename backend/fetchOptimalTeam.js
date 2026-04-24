require('dotenv').config();
const fs = require('fs');
const path = require('path');
const solver = require('javascript-lp-solver');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchOptimalTeam() {
    const email = process.env.KICKBASE_EMAIL;
    const password = process.env.KICKBASE_PASS;
    const targetLeagueName = process.env.KICKBASE_LEAGUE || "test"; 

    if (!email || !password) {
        console.error("KICKBASE_EMAIL oder KICKBASE_PASS fehlt.");
        return;
    }

    try {
        // 1. Login
        console.log("[LOG] Logge ein...");
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
        console.log(`[LOG] Nutze Liga: ${league.n || league.name} (ID: ${leagueId})`);

        // 3. Matchday
        const rankingRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/ranking`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const rankingData = await rankingRes.json();
        const currentMatchday = rankingData.day || 0;
        console.log(`[LOG] Spieltag: ${currentMatchday}`);

        let allPlayersMap = new Map();

        // 4. Markt-Abruf
        console.log("[LOG] Lade Spieler vom Markt...");
        try {
            const mRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/market`, { 
                headers: { Authorization: `Bearer ${token}` } 
            });
            if (mRes.ok) {
                const mData = await mRes.json();
                const mList = mData.players || mData.pl || mData.it || [];
                mList.forEach(p => {
                    const pId = p.i || p.id;
                    if (pId && !allPlayersMap.has(pId)) {
                        let pos = p.pos || p.p || 0;
                        if (pos > 10) pos = (p.p % 10) || 0;
                        allPlayersMap.set(pId, {
                            id: pId,
                            teamId: p.tid || p.t || 0,
                            name: `${p.fn ? p.fn + ' ' : ''}${p.n || p.ln || ''}`.trim(),
                            position: pos,
                            marketValue: p.mv || p.marketValue || 0
                        });
                    }
                });
            }
        } catch (e) { console.log(`[DEBUG] Markt-Fehler: ${e.message}`); }

        // 5. Team-Abrufe
        console.log("[LOG] Sammle Spieler über Teams...");
        const teamIds = [2,3,4,5,7,9,11,13,14,15,18,19,20,22,24,28,40,43];
        for (const teamId of teamIds) {
            try {
                const r = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/teams/${teamId}/players`, { 
                    headers: { Authorization: `Bearer ${token}` } 
                });
                if (r.ok) {
                    const d = await r.json();
                    const list = d.it || d.players || d.pl || d.p || [];
                    list.forEach(p => {
                        const pId = p.i || p.id;
                        if (pId && !allPlayersMap.has(pId)) {
                            let pos = p.pos || p.p || 0;
                            if (pos > 10) pos = (p.p % 10) || 0;
                            allPlayersMap.set(pId, {
                                id: pId,
                                teamId: teamId,
                                name: `${p.fn ? p.fn + ' ' : ''}${p.n || p.ln || ''}`.trim(),
                                position: pos,
                                marketValue: p.mv || p.marketValue || 0
                            });
                        }
                    });
                }
            } catch (e) {}
            await delay(50);
        }

        const allPlayersList = Array.from(allPlayersMap.values());
        console.log(`[LOG] Gesamtliste: ${allPlayersList.length} Spieler.`);
        if (allPlayersList.length === 0) throw new Error("Keine Spieler gefunden.");

        // 6. Detail-Abruf & Punkt-Logik
        console.log(`[LOG] Rufe Details für ${allPlayersList.length} Spieler ab...`);
        const rawPlayers = [];
        for (let i = 0; i < allPlayersList.length; i++) {
            const p = allPlayersList[i];
            try {
                const pRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/players/${p.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (pRes.ok) {
                    const pData = await pRes.json();
                    rawPlayers.push(pData);

                    // Performance-Zusatz (optional)
                    try {
                        const perfRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/players/${p.id}/performance?day=${currentMatchday}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        if (perfRes.ok) pData.performance = await perfRes.json();
                    } catch (pe) {}

                    // Update Basis-Daten
                    p.name = pData.n || pData.name || p.name;
                    p.position = pData.pos || pData.position || p.position;
                    p.marketValue = pData.mv || pData.marketValue || p.marketValue;
                    p.teamId = pData.tid || pData.teamId || p.teamId;

                    // Punkt-Ermittlung
                    const mds = pData.matchDays || pData.mds || [];
                    let dayStat = mds.find(m => (m.day || m.d) === currentMatchday);
                    let pts = dayStat ? (dayStat.points || dayStat.p || 0) : 0;

                    if (pts === 0 && pData.performance && pData.performance.p) {
                        pts = pData.performance.p;
                    }

                    if (pts === 0) {
                        const lastWithPoints = [...mds].sort((a, b) => (b.day || b.d) - (a.day || a.d)).find(m => (m.points || m.p) > 0);
                        if (lastWithPoints) pts = lastWithPoints.points || lastWithPoints.p;
                    }

                    if (pts === 0 && pData.ph && pData.ph.length > 0) {
                        const lastPh = [...pData.ph].reverse().find(h => h.p > 0);
                        if (lastPh) pts = lastPh.p;
                    }

                    p.avgPoints = pData.ap || pData.averagePoints || pData.avp || 0;
                    p.points = pts > 0 ? pts : p.avgPoints;
                    p.points = isNaN(p.points) ? 0 : p.points;
                }
            } catch (e) {}

            if (i % 100 === 0 && i > 0) console.log(`[LOG] Fortschritt: ${i}/${allPlayersList.length}`);
            await delay(30);
        }

        // Speichere Rohdaten
        const dumpPath = path.join(__dirname, '../frontend/public/history/all_players.json');
        fs.writeFileSync(dumpPath, JSON.stringify(rawPlayers, null, 2));

        // 7. Solver
        console.log("[LOG] Starte ILP Solver...");
        const pool = allPlayersList.filter(p => p.position >= 1 && p.position <= 4);
        const posCounts = { 1:0, 2:0, 3:0, 4:0 };
        pool.forEach(p => posCounts[p.position]++);
        console.log(`[LOG] Pool: ${pool.length} Spieler (Gk:${posCounts[1]}, Def:${posCounts[2]}, Mid:${posCounts[3]}, Att:${posCounts[4]})`);

        const model = {
            optimize: "points",
            opType: "max",
            constraints: {
                budget: { max: 500000000 },
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
            model.variables[v] = {
                points: p.points || 0,
                budget: p.marketValue || 0,
                total_players: 1,
                [`pos_${p.position}`]: 1,
                [`t_${p.teamId}`]: 1,
                [v]: 1 // Binary constraint per player
            };
            model.constraints[v] = { max: 1 };
            model.ints[v] = 1;
        });

        let res = solver.Solve(model);
        if (!res.feasible) {
            console.log("[LOG] Keine exakte 11er Aufstellung möglich, versuche Fallback (max 11)...");
            model.constraints.total_players = { max: 11 };
            res = solver.Solve(model);
        }

        if (res.feasible) {
            handleResult(res, allPlayersList, currentMatchday);
        } else {
            console.error("[ERROR] Keine Aufstellung gefunden (auch nach Fallback).");
        }

    } catch (error) {
        console.error(`[FATAL ERROR] ${error.message}`);
    }
}

function handleResult(res, allPlayers, currentMatchday) {
    const lineup = allPlayers.filter(p => res[`p_${p.id}`] > 0.5);
    lineup.sort((a, b) => a.position - b.position);
    
    const totalPoints = lineup.reduce((s, p) => s + p.points, 0);
    const totalBudget = lineup.reduce((s, p) => s + p.marketValue, 0);

    const output = {
        matchday: currentMatchday,
        totalPoints: Math.round(totalPoints),
        totalBudget: totalBudget,
        timestamp: new Date().toISOString(),
        lineup: lineup
    };

    const outPath = path.join(__dirname, `../frontend/public/history/optimal-md-${currentMatchday}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`[SUCCESS] Optimale Elf gespeichert! (Spieler: ${lineup.length}, Punkte: ${output.totalPoints})`);
}

fetchOptimalTeam();
