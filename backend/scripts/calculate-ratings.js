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

    // TODO: Komplexe Score-Berechnung implementieren
    // Da wir erst ab jetzt sammeln, bauen wir vorerst ein Dummy/Fallback Ranking, 
    // das sich aufbaut, sobald Daten reinkommen.

    const ratings = {};
    const defaultRating = {
        score: 50,
        financialScore: 50,
        performanceScore: 50,
        rebuildScore: 50,
        totalProfit: 0,
        totalOverpay: 0,
        ppm: 0,
        bestTrade: null,
        worstTrade: null,
        level: 'Bronze'
    };

    if (data.leagues) {
        data.leagues.forEach(l => {
            l.users.forEach(u => {
                ratings[u.id] = { ...defaultRating, name: u.name };
            });
        });
    }

    fs.writeFileSync(outputPath, JSON.stringify(ratings, null, 2));
    console.log("Manager Ratings saved to", outputPath);
}

run();
