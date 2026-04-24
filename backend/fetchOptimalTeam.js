require('dotenv').config();
const fs = require('fs');
const path = require('path');
const solver = require('javascript-lp-solver');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchOptimalTeam() {
    const email = process.env.KICKBASE_EMAIL;
    const password = process.env.KICKBASE_PASS;
    const targetLeagueName = process.env.KICKBASE_LEAGUE || "Qualigruppe 1"; 

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

        // 4. Global Fetch (High Efficiency)
        const globalUrls = [
            `https://api.kickbase.com/v4/leagues/${leagueId}/market/all`,
            `https://api.kickbase.com/v4/leagues/${leagueId}/lineup/selection`,
            `https://api.kickbase.com/v4/leagues/${leagueId}/lineup/teams`
        ];

        for (const url of globalUrls) {
            try {
                const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Cookie: `kkstrauth=${token}` } });
                if (r.ok) {
                    const d = await r.json();
                    const list = d.players || d.pl || d.p || d.selection || [];
                    const playersArray = Array.isArray(list) ? list : Object.values(list);
                    if (playersArray.length > 0) {
                        for (const p of playersArray) {
                            const pId = p.i || p.id;
                            if (pId && !allPlayersMap.has(pId)) {
                                allPlayersMap.set(pId, {
                                    id: pId,
                                    teamId: p.tid || p.t || 0,
                                    name: `${p.fn ? p.fn + ' ' : ''}${p.n || p.ln || ''}`.trim(),
                                    position: p.p || p.pos || 0,
                                    marketValue: p.mv || p.marketValue || 0,
                                    imagePath: p.pi || p.profileBig || p.profile
                                });
                            }
                        }
                        console.log(`[LOG] ${allPlayersMap.size} Spieler über ${url.split('v4/')[1]} geladen.`);
                    }
                }
            } catch (e) {}
        }

        // 5. Team Fallback (If global failed or incomplete)
        if (allPlayersMap.size < 400) {
            console.log("[LOG] Sammle Spieler über Team-Einzelabfragen...");
            const teamsRes = await fetch('https://api.kickbase.com/v4/base/predictions/teams/1', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const teamsData = await teamsRes.json();
            const teams = teamsData.tms || [];
            
            for (const team of teams) {
                const teamId = team.tid || team.i;
                const teamUrls = [
                    `https://api.kickbase.com/competition/teams/${teamId}/players`,
                    `https://api.kickbase.com/v4/leagues/${leagueId}/teams/${teamId}/players`,
                    `https://api.kickbase.com/v4/leagues/${leagueId}/teams/${teamId}/teamprofile`
                ];
                
                for (const url of teamUrls) {
                    try {
                        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Cookie: `kkstrauth=${token}` } });
                        if (r.ok) {
                            const d = await r.json();
                            const list = d.p || d.players || d.pl || (Array.isArray(d) ? d : []);
                            const playersArray = Array.isArray(list) ? list : Object.values(list);
                            if (playersArray.length > 0) {
                                for (const p of playersArray) {
                                    const pId = p.i || p.id;
                                    if (pId && !allPlayersMap.has(pId)) {
                                        allPlayersMap.set(pId, {
                                            id: pId,
                                            teamId: teamId,
                                            name: `${p.fn ? p.fn + ' ' : ''}${p.n || p.ln || ''}`.trim(),
                                            position: p.p || p.pos || 0,
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
                await delay(150);
            }
            console.log(`[LOG] Gesamtliste nach Team-Abfrage: ${allPlayersMap.size} Spieler.`);
        }

        const allPlayers = Array.from(allPlayersMap.values());
        if (allPlayers.length === 0) throw new Error("Keine Spieler gefunden.");

        // 6. Points
        console.log(`[LOG] Rufe Punkte für ${allPlayers.length} Spieler ab...`);
        for (let i = 0; i < allPlayers.length; i++) {
            const p = allPlayers[i];
            try {
                const sRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/players/${p.id}/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (sRes.ok) {
                    const sData = await sRes.json();
                    const mds = sData.matchDays || sData.mds || [];
                    const stat = mds.find(m => (m.day || m.d) === currentMatchday);
                    p.points = stat ? (stat.points || stat.p || 0) : 0;
                } else p.points = 0;
            } catch (e) { p.points = 0; }
            if (i % 50 === 0 && i > 0) console.log(`[LOG] Fortschritt: ${i}/${allPlayers.length}`);
            await delay(100);
        }

        // 7. Solver
        console.log("[LOG] Starte Solver...");
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

        const tIds = [...new Set(allPlayers.map(p => p.teamId))];
        tIds.forEach(id => model.constraints[`t_${id}`] = { max: 3 });

        allPlayers.forEach(p => {
            const v = `p_${p.id}`;
            model.variables[v] = {
                points: p.points,
                budget: p.marketValue,
                total_players: 1,
                [`t_${p.teamId}`]: 1,
                [`pos_${p.position}`]: 1
            };
            model.ints[v] = 1;
        });

        const res = solver.Solve(model);
        if (!res.feasible) throw new Error("Keine Lösung gefunden.");

        const lineup = allPlayers.filter(p => res[`p_${p.id}`] === 1);
        lineup.sort((a, b) => a.position - b.position);

        const output = {
            matchday: currentMatchday,
            totalPoints: lineup.reduce((s, p) => s + p.points, 0),
            totalBudget: lineup.reduce((s, p) => s + p.marketValue, 0),
            timestamp: new Date().toISOString(),
            lineup: lineup
        };

        const outPath = path.join(__dirname, `../frontend/public/history/optimal-md-${currentMatchday}.json`);
        fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
        console.log(`[SUCCESS] Optimale Elf gespeichert!`);

    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
    }
}

fetchOptimalTeam();
