const fs = require('fs');
const players = JSON.parse(fs.readFileSync('frontend/public/history/all_players.json', 'utf8'));

const md31 = players.map(p => {
    let points = null;
    if (p.performance && p.performance.it && p.performance.it.length > 0) {
        const currentSeason = p.performance.it[p.performance.it.length - 1];
        if (currentSeason.ph) {
            const entry = currentSeason.ph.find(e => e.day === 31);
            if (entry) points = entry.p;
        }
    }
    return { name: p.ln || p.n, points };
}).filter(p => p.points !== null && p.points > 0);

console.log(`Found ${md31.length} players with points for MD 31.`);
console.log('Top 10 players for MD 31 in all_players.json:');
console.log(md31.sort((a, b) => b.points - a.points).slice(0, 10));
