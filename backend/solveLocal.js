const fs = require('fs');
const path = require('path');
const solver = require('javascript-lp-solver');

async function solveLocal() {
    const dataPath = path.join(__dirname, '../frontend/public/history/all_players.json');
    if (!fs.existsSync(dataPath)) {
        console.error("all_players.json nicht gefunden.");
        return;
    }

    const allPlayers = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const targetMatchday = 30; // Based on the data we saw

    console.log(`[LOG] Verarbeite ${allPlayers.length} Spieler für Spieltag ${targetMatchday}...`);

    const processedPlayers = allPlayers.map(p => {
        let pos = p.pos || p.p || 0;
        if (pos > 10) pos = (pos % 10) || 0;

        // Point Fallback Logic
        let pts = 0;
        
        // 1. Check mdsum or performance for specific matchday
        const mds = p.mds || p.matchDays || [];
        const dayStat = mds.find(m => (m.day || m.d) === targetMatchday);
        if (dayStat) pts = dayStat.points || dayStat.p || 0;

        // 2. Check performance object (v4 style)
        if (pts === 0 && p.performance && p.performance.p) {
            pts = p.performance.p;
        }

        // 3. Last matchday points from history
        if (pts === 0 && p.ph && p.ph.length > 0) {
            // ph usually contains the last few matches. We take the most recent non-zero.
            const lastPh = [...p.ph].reverse().find(h => h.p > 0);
            if (lastPh) pts = lastPh.p;
        }

        // 4. Fallback to Average Points
        const avg = p.ap || p.averagePoints || 0;
        if (pts === 0) pts = avg;

        return {
            id: p.i || p.id,
            name: `${p.fn ? p.fn + ' ' : ''}${p.ln || p.n || ''}`.trim(),
            teamId: p.tid || p.teamId,
            teamName: p.tn || p.teamName,
            position: pos,
            marketValue: p.mv || p.marketValue || 0,
            points: pts || 0,
            avgPoints: avg
        };
    }).filter(p => p.position >= 1 && p.position <= 4);

    console.log(`[LOG] Pool Größe: ${processedPlayers.length}`);

    const model = {
        optimize: "points",
        opType: "max",
        constraints: {
            budget: { max: 500000000 }, // 500M budget
            total_players: { equal: 11 },
            pos_1: { equal: 1 },
            pos_2: { min: 3, max: 5 },
            pos_3: { min: 3, max: 5 },
            pos_4: { min: 1, max: 3 }
        },
        variables: {},
        ints: {}
    };

    // Max 3 players per team
    const teamIds = [...new Set(processedPlayers.map(p => p.teamId))];
    teamIds.forEach(tid => {
        if (tid) model.constraints[`t_${tid}`] = { max: 3 };
    });

    processedPlayers.forEach(p => {
        const v = `p_${p.id}`;
        model.variables[v] = {
            points: p.points,
            budget: p.marketValue,
            total_players: 1,
            [`pos_${p.position}`]: 1,
            [`t_${p.teamId}`]: 1,
            [v]: 1
        };
        model.constraints[v] = { max: 1 };
        model.ints[v] = 1;
    });

    console.log("[LOG] Löse ILP...");
    let res = solver.Solve(model);
    
    if (!res.feasible) {
        console.log("[LOG] Nicht machbar mit 11 Spielern, versuche max 11...");
        model.constraints.total_players = { max: 11 };
        res = solver.Solve(model);
    }

    if (res.feasible) {
        const lineup = processedPlayers.filter(p => res[`p_${p.id}`] > 0.5);
        lineup.sort((a, b) => a.position - b.position);

        const result = {
            matchday: targetMatchday,
            totalPoints: Math.round(lineup.reduce((s, p) => s + p.points, 0)),
            totalBudget: lineup.reduce((s, p) => s + p.marketValue, 0),
            lineup: lineup
        };

        console.log("\n=== TOP ELF (MD 30, 2026) ===");
        console.log(`Gesamtpunkte: ${result.totalPoints}`);
        console.log(`Budget: ${(result.totalBudget / 1000000).toFixed(2)}M €`);
        console.log("-------------------------------");
        lineup.forEach(p => {
            const posNames = ["", "TW", "AW", "MF", "ST"];
            console.log(`${posNames[p.position]} | ${p.name.padEnd(20)} | ${p.teamName.padEnd(15)} | ${p.points} Pkt | ${(p.marketValue/1000000).toFixed(2)}M €`);
        });

        const outPath = path.join(__dirname, `../frontend/public/history/optimal-md-${targetMatchday}-v2.json`);
        fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
        console.log(`\n[SUCCESS] Gespeichert in: ${outPath}`);
    } else {
        console.error("[ERROR] Keine Lösung gefunden.");
    }
}

solveLocal();
