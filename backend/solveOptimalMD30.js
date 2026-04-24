const fs = require('fs');
const path = require('path');
const solver = require('javascript-lp-solver');

function solve(md) {
    const targetMatchday = parseInt(md);
    const inputPath = path.join(__dirname, `../frontend/public/history/md${targetMatchday}_players_with_points.json`);
    const outputPath = path.join(__dirname, `../frontend/public/history/optimal-md-${targetMatchday}-final.json`);

    if (!fs.existsSync(inputPath)) {
        console.error(`File ${inputPath} not found.`);
        return;
    }

    console.log(`[LOG] Reading ${inputPath}...`);
    const allPlayers = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const pool = allPlayers.filter(p => p.points !== undefined && p.points !== null);

    console.log(`[LOG] Pool size: ${pool.length}`);

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

    const teamIds = [...new Set(pool.map(p => p.teamId))];
    teamIds.forEach(tid => {
        if (tid) model.constraints[`t_${tid}`] = { max: 3 };
    });

    pool.forEach(p => {
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

    console.log(`[LOG] Solving ILP for MD ${targetMatchday}...`);
    const res = solver.Solve(model);

    if (res.feasible) {
        const lineup = pool.filter(p => res[`p_${p.id}`] > 0.5);
        lineup.sort((a, b) => a.position - b.position);

        const result = {
            matchday: targetMatchday,
            totalPoints: Math.round(lineup.reduce((s, p) => s + p.points, 0)),
            totalBudget: lineup.reduce((s, p) => s + p.marketValue, 0),
            timestamp: new Date().toISOString(),
            lineup: lineup
        };

        console.log(`\n=== TOP ELF (MD ${targetMatchday}, 2026) ===`);
        console.log(`Total Points: ${result.totalPoints}`);
        console.log(`Budget: ${(result.totalBudget / 1000000).toFixed(2)}M €`);

        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`[SUCCESS] Saved to ${outputPath}`);
    } else {
        console.error(`[ERROR] No feasible lineup found for MD ${targetMatchday}.`);
    }
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Please provide matchday as argument.");
} else {
    solve(args[0]);
}
