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

    // Mapping: Name -> ID
    const nameToId = {};
    if (data.leagues) {
        data.leagues.forEach(l => {
            l.users.forEach(u => {
                const uid = u.id || u.i;
                nameToId[u.name.toLowerCase()] = uid;
            });
        });
    }

    // Map: userId -> { buyEvents: [...], sellEvents: [...] }
    const userTrades = {};

    // Transfers nach Datum aufsteigend sortieren
    transfers.sort((a, b) => new Date(a.date || a.d || 0) - new Date(b.date || b.d || 0));

    transfers.forEach(t => {
        let buyerId = t.buyerId;
        let sellerId = t.sellerId;

        // Wenn wir keine ID haben, suchen wir sie über den Namen
        if (!buyerId && t.buyerName) {
            buyerId = nameToId[t.buyerName.toLowerCase()];
        }
        if (!sellerId && t.sellerName) {
            sellerId = nameToId[t.sellerName.toLowerCase()];
        }

        const playerId = t.playerId;
        const price = t.price || 0;
        const date = new Date(t.date || t.d || 0);
        const marketValue = t.marketValueAtTimeOfTransfer || 0;

        if (buyerId && playerId) {
            if (!userTrades[buyerId]) userTrades[buyerId] = { buys: [], sells: [] };
            userTrades[buyerId].buys.push({ playerId, price, date, marketValue });
        }
        if (sellerId && playerId) {
            if (!userTrades[sellerId]) userTrades[sellerId] = { buys: [], sells: [] };
            userTrades[sellerId].sells.push({ playerId, price, date, marketValue });
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
                
                // Für Top und Flop
                let bestTrade = { name: '-', profit: 0 };
                let worstTrade = { name: '-', profit: 0 };

                // Match buys and sells (FIFO)
                const inventory = {};
                trades.buys.forEach(b => {
                    if (!inventory[b.playerId]) inventory[b.playerId] = [];
                    inventory[b.playerId].push(b);
                    totalSpent += b.price;
                    
                    if (b.marketValue && b.price > b.marketValue) {
                        totalOverpay += (b.price - b.marketValue);
                    }
                });

                trades.sells.forEach(s => {
                    totalEarned += s.price;
                    if (inventory[s.playerId] && inventory[s.playerId].length > 0) {
                        const b = inventory[s.playerId].shift(); // FIFO
                        const profit = s.price - b.price;
                        totalProfit += profit;
                        completedTrades++;
                        
                        // Finde Top und Flop (Spielername aus der all_players Datenbank ziehen)
                        const pName = playerMap.has(s.playerId) ? playerMap.get(s.playerId).fn + " " + playerMap.get(s.playerId).ln : s.playerId;
                        
                        if (profit > bestTrade.profit) {
                            bestTrade = { name: pName, profit: profit };
                        }
                        if (profit < worstTrade.profit || worstTrade.profit === 0 && profit < 0) {
                            worstTrade = { name: pName, profit: profit };
                        }
                    }
                });

                // Durchschnittlicher Profit pro abgeschlossenen Trade
                let avgProfit = completedTrades > 0 ? totalProfit / completedTrades : 0;
                
                let userPoints = parseInt(u.points.replace(/\./g, '')) || 0;
                let ppm = 0;
                if (totalSpent > 0 && userPoints > 0) {
                    ppm = userPoints / (totalSpent / 1000000);
                }

                // --- NEUES SCORING MODELL (Basis 50) ---
                // Startwert ist 50. Wir addieren/subtrahieren basierend auf Leistung.
                let baseScore = 50;
                
                // 1. Activity (bis zu +15 Punkte)
                // Wer aktiv ist, sammelt Pluspunkte. (Maximal bei ca. 15 Trades)
                let actBonus = Math.min(15, (trades.buys.length / 15) * 15);
                
                // 2. Profit Score (-20 bis +25 Punkte)
                // 500k Durchschnittsgewinn pro Trade = +25 Punkte
                // 500k Durchschnittsverlust = -20 Punkte
                let profitBonus = 0;
                if (completedTrades > 0) {
                    profitBonus = (avgProfit / 500000) * 25;
                    profitBonus = Math.max(-20, Math.min(25, profitBonus));
                }

                // 3. Performance / PPM (bis zu +10 Punkte)
                // Wenn die Saison noch nicht gestartet ist (0 Punkte), fällt dieser Bonus weg.
                let perfBonus = 0;
                if (userPoints > 0) {
                    perfBonus = Math.min(10, (ppm / 3) * 10);
                }
                
                let totalScore = Math.round(baseScore + actBonus + profitBonus + perfBonus);
                totalScore = Math.max(0, Math.min(100, totalScore)); // Clamping 0-100

                // Kleine kosmetische Anpassung für das erste Ranking:
                // Wenn jemand noch keine Verkäufe hat, aber sehr viel eingekauft hat, honorieren wir das Scouting.
                if (completedTrades === 0 && trades.buys.length > 5) {
                    totalScore += 5;
                }

                let level = 'Bronze';
                if (totalScore >= 90) level = 'Elite';
                else if (totalScore >= 75) level = 'Silber';
                else if (totalScore >= 60) level = 'Gold';
                else if (totalScore < 45) level = 'Amateur';

                ratings[uid] = {
                    name: u.name,
                    score: totalScore,
                    financialScore: Math.round(50 + profitBonus * 2), // 0-100 Skala für UI
                    performanceScore: Math.round(50 + perfBonus * 5),
                    rebuildScore: Math.round(50 + actBonus * 3.3),
                    totalProfit,
                    totalOverpay,
                    ppm,
                    level,
                    tradesCount: completedTrades,
                    bestTrade,
                    worstTrade
                };
            });
        });
    }

    fs.writeFileSync(outputPath, JSON.stringify(ratings, null, 2));
    console.log("Manager Ratings saved to", outputPath);
}

run();
