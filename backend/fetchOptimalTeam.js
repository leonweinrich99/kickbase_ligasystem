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
        const currentMatchday = rankingData.day;
        console.log(`[LOG] Spieltag: ${currentMatchday}`);

        let allPlayersMap = new Map();

        // 4. Markt-Abruf (Quelle für Spieler)
        console.log("[LOG] Versuche Spieler über Markt-Endpoint zu laden...");
        try {
            const mRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/market`, { 
                headers: { Authorization: `Bearer ${token}`, Cookie: `kkstrauth=${token}` } 
            });
            if (mRes.ok) {
                const mData = await mRes.json();
                const mList = mData.players || mData.pl || mData.it || [];
                for (const p of mList) {
                    const pId = p.i || p.id;
                    if (pId && !allPlayersMap.has(pId)) {
                        // Positionen fixen
                        let pos = p.pos || p.p || 0;
                        if (pos > 10) pos = p.pos || (p.p % 10) || 0;

                        allPlayersMap.set(pId, {
                            id: pId,
                            teamId: p.tid || p.t || 0,
                            name: `${p.fn ? p.fn + ' ' : ''}${p.n || p.ln || ''}`.trim(),
                            position: pos,
                            marketValue: p.mv || p.marketValue || 0,
                            imagePath: p.pi || p.profileBig || p.profile
                        });
                    }
                }
            }
        } catch (e) {}

        // 5. Team-Einzelabfragen mit verifizierten IDs
        console.log("[LOG] Sammle Spieler über verifizierte Team-IDs...");
        const teamIds = [2,3,4,5,7,9,11,13,14,15,18,19,20,22,24,28,40,43];
        
        for (const teamId of teamIds) {
            const teamUrls = [
                `https://api.kickbase.com/v4/leagues/${leagueId}/teams/${teamId}/teamprofile`,
                `https://api.kickbase.com/v4/teams/${teamId}/players`,
                `https://api.kickbase.com/v4/competition/teams/${teamId}/players`
            ];
            
            for (const url of teamUrls) {
                try {
                    const r = await fetch(url, { 
                        headers: { 
                            'Accept': 'application/json',
                            'Authorization': `Bearer ${token}`, 
                            'Cookie': `kkstrauth=${token}` 
                        } 
                    });
                    if (r.ok) {
                        const d = await r.json();
                        const list = d.it || d.players || d.pl || d.p || (Array.isArray(d) ? d : []);
                        const playersArray = Array.isArray(list) ? list : Object.values(list);
                        if (playersArray.length > 0) {
                            for (const p of playersArray) {
                                const pId = p.i || p.id;
                                if (pId && !allPlayersMap.has(pId)) {
                                    let pos = p.pos || p.p || 0;
                                    if (pos > 10) pos = p.pos || (p.p % 10) || 0;

                                    allPlayersMap.set(pId, {
                                        id: pId,
                                        teamId: teamId,
                                        name: `${p.fn ? p.fn + ' ' : ''}${p.n || p.ln || ''}`.trim(),
                                        position: pos,
                                        marketValue: p.mv || p.marketValue || 0,
                                        imagePath: p.pi || p.profileBig || p.profile
                                    });
                                }
                            }
                            break; 
                        }
                    }
                } catch (e) {}
            }
            await delay(100);
        }

        const allPlayers = Array.from(allPlayersMap.values());
        const rawPlayers = []; // Für den unveränderten Dump
        
        console.log(`[LOG] Gesamtliste: ${allPlayers.length} Spieler.`);
        if (allPlayers.length === 0) throw new Error("Keine Spieler gefunden.");

        // 6. Detaillierte Spieler-Daten abrufen (Profil + Punkte)
        console.log(`[LOG] Rufe Details für ${allPlayers.length} Spieler ab...`);
        for (let i = 0; i < allPlayers.length; i++) {
            const p = allPlayers[i];
            try {
                const pRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/players/${p.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (pRes.ok) {
                    const pData = await pRes.json();
                    rawPlayers.push(pData); // Original-Daten speichern
                    
                    // Bereinigte Daten für den Solver aktualisieren
                    p.name = pData.n || pData.name || p.name;
                    p.position = pData.pos || pData.position || p.position;
                    p.teamId = pData.tid || pData.teamId || p.teamId;
                    p.marketValue = pData.mv || pData.marketValue || p.marketValue;

                    const mds = pData.matchDays || pData.mds || [];
                    let stat = mds.find(m => (m.day || m.d) === currentMatchday);
                    let pts = stat ? (stat.points || stat.p || 0) : 0;

                    if (pts === 0) {
                        const lastWithPoints = [...mds].sort((a, b) => (b.day || b.d) - (a.day || a.d)).find(m => (m.points || m.p) > 0);
                        if (lastWithPoints) pts = lastWithPoints.points || lastWithPoints.p;
                    }

                    p.avgPoints = pData.averagePoints || pData.avp || 0;
                    p.points = pts > 0 ? pts : p.avgPoints;

                    // NEU: Performance-Daten für den Spieltag abrufen
                    try {
                        const perfRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/players/${p.id}/performance?day=${currentMatchday}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        if (perfRes.ok) {
                            pData.performance = await perfRes.json();
                            // Falls wir über das Profil keine Punkte hatten, schauen wir in die Performance
                            if (p.points === 0 && pData.performance && (pData.performance.p || pData.performance.points)) {
                                p.points = pData.performance.p || pData.performance.points;
                            }
                        }
                    } catch (e) {}

                    rawPlayers.push(pData); // Original-Daten inkl. Performance speichern
                }
            } catch (e) {}

        // 7. Solver
        console.log("[LOG] Vorbereitung Solver...");
        const pool = allPlayers.filter(p => p.position >= 1 && p.position <= 4);
        const posCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
        pool.forEach(p => posCount[p.position]++);
        
        console.log(`[LOG] Solver-Pool: ${pool.length} Spieler`);
        console.log(`[LOG] Verteilung: Tor: ${posCount[1]}, Abw: ${posCount[2]}, Mit: ${posCount[3]}, Ang: ${posCount[4]}`);

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
        tIds.forEach(id => { if (id > 0) model.constraints[`t_${id}`] = { max: 3 }; });

        pool.forEach(p => {
            const v = `p_${p.id}`;
            model.variables[v] = {
                points: p.points || 0,
                budget: p.marketValue || 0,
                total_players: 1,
                [`t_${p.teamId}`]: 1,
                [`pos_${p.position}`]: 1
            };
            model.ints[v] = 1;
        });

        const res = solver.Solve(model);
        if (!res.feasible) {
             model.constraints.total_players = { max: 11 };
             const fallbackRes = solver.Solve(model);
             if (!fallbackRes.feasible) throw new Error("Keine Aufstellung gefunden.");
             return handleResult(fallbackRes, allPlayers, currentMatchday);
        }
        handleResult(res, allPlayers, currentMatchday);

    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
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
    console.log(`[SUCCESS] Optimale Elf berechnet! (Spieler: ${lineup.length}, Punkte: ${Math.round(totalPoints)})`);
}

fetchOptimalTeam();
