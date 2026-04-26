const fs = require('fs');
const path = require('path');
const { fetchRawKickbaseData, transformKickbaseData } = require('../kickbase');

async function run() {
    console.log("Starting Kickbase data fetch...");
    
    const dataPath = path.join(__dirname, '../../frontend/public/data.json');
    const historyDir = path.join(__dirname, '../../frontend/public/history');
    const indexPropsPath = path.join(historyDir, 'index.json');
    
    // 1. Rohdaten abrufen
    const rawResults = await fetchRawKickbaseData();
    
    // 2. Matchday bestimmen (aus den Rohdaten extrahieren)
    let currentMatchday = 28;
    for (const res of rawResults) {
        if (res && res.matchday > currentMatchday) currentMatchday = res.matchday;
    }
    console.log(`Current Matchday identified: ${currentMatchday}`);

    // 3. Vorherigen Spieltag-Snapshot suchen für Differenz-Berechnung
    let previousData = null;
    const prevMDPath = path.join(historyDir, `spieltag-${currentMatchday - 1}.json`);
    
    if (fs.existsSync(prevMDPath)) {
        try {
            previousData = JSON.parse(fs.readFileSync(prevMDPath, 'utf8'));
            console.log(`Using snapshot from MD ${currentMatchday - 1} for points calculation.`);
        } catch (e) {
            console.error(`Could not parse spieltag-${currentMatchday - 1}.json`);
        }
    } else {
        // Fallback zu data.json falls kein Snapshot des vorherigen Spieltags da ist
        console.log(`No snapshot for MD ${currentMatchday - 1} found. Falling back to data.json.`);
        if (fs.existsSync(dataPath)) {
            try {
                previousData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            } catch (e) {}
        }
    }

    // 4. Daten transformieren
    const data = transformKickbaseData(rawResults, previousData);
    
    if (data.error) {
        console.error("Error transforming data:", data.error);
        process.exit(1);
    }

    // 5. Neueste Daten in data.json speichern
    if (!fs.existsSync(path.dirname(dataPath))) {
        fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    }
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log("Latest data updated in data.json");

    // 6. Spieltags-Snapshot IMMER erstellen/überschreiben
    if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
    }

    const snapshotPath = path.join(historyDir, `spieltag-${data.matchday}.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2));
    console.log(`Snapshot updated: spieltag-${data.matchday}.json`);

    // 7. History-Index aktualisieren
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


run();
