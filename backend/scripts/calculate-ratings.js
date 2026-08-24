const fs = require('fs');
const path = require('path');

function run() {
    console.log("Calculating Manager Ratings...");
    const historyDir = path.join(__dirname, '../../frontend/public/history');
    const transfersPath = path.join(historyDir, 'transfers.json');
    const allPlayersPath = path.join(historyDir, 'all_players.json');
    const dataPath = path.join(__dirname, '../../frontend/public/data.json');
    const outputPath = path.join(historyDir, 'manager-ratings.json');

    let transfers = [];
    let players = [];
    let data = {};

    try { if (fs.existsSync(transfersPath)) transfers = JSON.parse(fs.readFileSync(transfersPath, 'utf8')); } catch (e) { console.error("No transfers found"); }
    try { if (fs.existsSync(allPlayersPath)) players = JSON.parse(fs.readFileSync(allPlayersPath, 'utf8')); } catch (e) { console.error("No players found"); }
    try { if (fs.existsSync(dataPath)) data = JSON.parse(fs.readFileSync(dataPath, 'utf8')); } catch (e) { console.error("No data found"); }

    const playerMap = new Map();
    players.forEach(p => playerMap.set(p.i || p.id, p));

    // Map: userId -> { buyEvents: [...], sellEvents: [...] }
    const userTrades = {};

    // Transfers nach Datum aufsteigend sortieren
    transfers.sort((a, b) => new Date(a.d || a.date || 0) - new Date(b.d || b.date || 0));

    transfers.forEach(t => {
        const meta = t.meta || {};
        const buyerId = meta.b ? meta.b.i : null;
        const sellerId = meta.s ? meta.s.i : null;
        const playerId = meta.p ? meta.p.i : null;
        const price = meta.a || meta.pr || meta.price || 0; // price assumption
        const date = new Date(t.d || t.date || 0);

        if (buyerId && playerId) {
            if (!userTrades[buyerId]) userTrades[buyerId] = { buys: [], sells: [] };
            userTrades[buyerId].buys.push({ playerId, price, date });
        }
        if (sellerId && playerId) {
            if (!userTrades[sellerId]) userTrades[sellerId] = { buys: [], sells: [] };
            userTrades[sellerId].sells.push({ playerId, price, date });
        }
    });

    const ratings = {};

    if (data.leagues) {
        data.leagues.forEach(l => {
            l.users.forEach(u => {
                const uid = u.id || u.i;
                const trades = userTrades[uid] || { buys: [], sells: [] };
                
                let totalProfit = 0;
                let totalOverpay = 0; // We need player's market value at time of buy to calculate exact overpay. 
                // As a fallback, we just accumulate total spending vs total earning.
                let totalSpent = 0;
                let totalEarned = 0;

                let completedTrades = 0;

                // Match buys and sells (FIFO)
                const inventory = {};
                trades.buys.forEach(b => {
                    if (!inventory[b.playerId]) inventory[b.playerId] = [];
                    inventory[b.playerId].push(b);
                    totalSpent += b.price;
                });

                trades.sells.forEach(s => {
                    totalEarned += s.price;
                    if (inventory[s.playerId] && inventory[s.playerId].length > 0) {
                        const b = inventory[s.playerId].shift(); // FIFO
                        const profit = s.price - b.price;
                        totalProfit += profit;
                        completedTrades++;
                    }
                });

                // Punkte pro Million (PPM)
                // Da wir aktuell nicht exakt matchen können, wie viele Punkte der Spieler
                // WÄHREND des Besitzes gemacht hat (außer wir gleichen das Datum mit Spieltagen ab),
                // verwenden wir als Platzhalter eine Schätzung oder belassen es bei 0 bis wir die Daten haben.
                let ppm = 0;
                if (totalSpent > 0) {
                    // Einfach die Gesamtpunkte des Managers / (TotalSpent / 1.000.000)
                    const userPoints = parseInt(u.points.replace(/\./g, '')) || 0;
                    ppm = userPoints / (totalSpent / 1000000);
                }
                
                if (ppm === Infinity || isNaN(ppm)) ppm = 0;

                // Score Logic (0-100)
                // 1. Profit Score (0-40) - z.B. 10 Mio Gewinn = 40 Punkte
                let profitScore = Math.max(0, Math.min(40, (totalProfit / 10000000) * 40));
                
                // 2. Performance Score (PPM) (0-40) - z.B. 5 Punkte pro Mio = 40 Punkte
                let perfScore = Math.max(0, Math.min(40, (ppm / 5) * 40));

                // 3. Activity/Rebuild (0-20) - z.B. 10 Trades = 20 Punkte
                let actScore = Math.max(0, Math.min(20, (trades.buys.length / 10) * 20));

                let totalScore = Math.round(profitScore + perfScore + actScore);
                
                // Fallback, wenn keine Transfers da sind
                if (trades.buys.length === 0 && trades.sells.length === 0) {
                    totalScore = 50; 
                }

                let level = 'Bronze';
                if (totalScore >= 90) level = 'Elite';
                else if (totalScore >= 75) level = 'Silber';
                else if (totalScore < 50) level = 'Scout';

                ratings[uid] = {
                    name: u.name,
                    score: totalScore,
                    financialScore: Math.round((profitScore / 40) * 100),
                    performanceScore: Math.round((perfScore / 40) * 100),
                    rebuildScore: Math.round((actScore / 20) * 100),
                    totalProfit,
                    totalOverpay, // currently dummy
                    ppm,
                    level,
                    tradesCount: completedTrades
                };
            });
        });
    }

    fs.writeFileSync(outputPath, JSON.stringify(ratings, null, 2));
    console.log("Manager Ratings saved to", outputPath);
}

run();
