const fs = require('fs');
const path = require('path');

const ALL_PLAYERS_PATH = path.join(__dirname, '../frontend/public/history/all_players.json');

function extractPoints(md) {
    const targetMatchday = parseInt(md);
    const outputPath = path.join(__dirname, `../frontend/public/history/md${targetMatchday}_players_with_points.json`);

    console.log(`[LOG] Reading all_players.json for MD ${targetMatchday}...`);
    const rawData = fs.readFileSync(ALL_PLAYERS_PATH, 'utf8');
    const players = JSON.parse(rawData);

    console.log(`[LOG] Processing ${players.length} players...`);
    const result = [];

    players.forEach(p => {
        const pId = p.i || p.id;
        const name = `${p.fn ? p.fn + ' ' : ''}${p.ln || p.n || ''}`.trim();
        const teamId = p.tid || p.teamId;
        const teamName = p.tn || p.teamName || "Unknown";
        let pos = p.pos || p.p || 0;
        if (pos > 10) pos = (pos % 10) || 0;
        const marketValue = p.mv || p.marketValue || 0;

        let points = null;

        if (p.performance && p.performance.it && p.performance.it.length > 0) {
            // Usually the last item in 'it' is the most recent season
            const currentSeason = p.performance.it[p.performance.it.length - 1];
            if (currentSeason.ph) {
                const mdEntry = currentSeason.ph.find(entry => entry.day === targetMatchday);
                if (mdEntry && mdEntry.p !== undefined) {
                    points = mdEntry.p;
                }
            }
        }

        if (points !== null) {
            result.push({
                id: pId,
                name: name,
                lastName: p.ln || p.n || name,
                teamId: teamId,
                teamName: teamName,
                position: pos,
                marketValue: marketValue,
                points: points,
                imagePath: pId
            });
        }
    });

    console.log(`[LOG] Found ${result.length} players with data for MD ${targetMatchday}.`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`[SUCCESS] Data saved to ${outputPath}`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Please provide matchday as argument.");
} else {
    extractPoints(args[0]);
}
