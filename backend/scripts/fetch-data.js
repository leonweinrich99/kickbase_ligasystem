const fs = require('fs');
const path = require('path');
const { fetchKickbaseData } = require('../kickbase');

async function run() {
    console.log("Starting Kickbase data fetch...");
    
    const dataPath = path.join(__dirname, '../../frontend/public/data.json');
    const historyDir = path.join(__dirname, '../../frontend/public/history');
    const indexPropsPath = path.join(historyDir, 'index.json');
    
    // 1. Lade vorherige Daten für die Differenz-Berechnung
    let previousData = null;
    if (fs.existsSync(dataPath)) {
        try {
            previousData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        } catch (e) {
            console.error("Could not parse previous data.json");
        }
    }

    // 2. Daten abrufen (mit Diff-Berechnung falls previousData vorhanden)
    const data = await fetchKickbaseData(previousData);
    
    if (data.error) {
        console.error("Error fetching data:", data.error);
        process.exit(1);
    }

    // 3. Neueste Daten immer in data.json speichern
    if (!fs.existsSync(path.dirname(dataPath))) {
        fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    }
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log("Latest data updated in data.json");

    // 4. Snapshot-Logik (wird über Umgebungsvariable SNAPSHOT=true gesteuert)
    const shouldSnapshot = process.env.SNAPSHOT === 'true';
    if (shouldSnapshot) {
        if (!fs.existsSync(historyDir)) {
            fs.mkdirSync(historyDir, { recursive: true });
        }

        const snapshotPath = path.join(historyDir, `spieltag-${data.matchday}.json`);
        fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2));
        console.log(`Snapshot saved: spieltag-${data.matchday}.json`);

        // Index aktualisieren
        let indexData = { matchdays: [] };
        if (fs.existsSync(indexPropsPath)) {
            try {
                indexData = JSON.parse(fs.readFileSync(indexPropsPath, 'utf8'));
            } catch (e) {}
        }
        
        if (!indexData.matchdays.includes(data.matchday)) {
            indexData.matchdays.push(data.matchday);
            indexData.matchdays.sort((a, b) => b - a);
            fs.writeFileSync(indexPropsPath, JSON.stringify(indexData, null, 2));
            console.log("History index updated");
        }
    }
}

run();
