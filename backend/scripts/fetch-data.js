const fs = require('fs');
const path = require('path');
const { fetchRawIndependentLeagues, transformIndependentLeagues } = require('../kickbase');

async function run() {
    console.log("Starting Kickbase data fetch (unabhängiges Ligasystem)...");
    
    const dataPath = path.join(__dirname, '../../frontend/public/data.json');
    const historyDir = path.join(__dirname, '../../frontend/public/history');
    const indexPropsPath = path.join(historyDir, 'index.json');
    
    // 1. Rohdaten abrufen (3 unabhängige Ligen, EIN Account)
    const rawResults = await fetchRawIndependentLeagues();

    // 2. Matchday bestimmen (aus den Rohdaten extrahieren)
    let currentMatchday = 1;
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
        // Kein gefrorener Snapshot des vorherigen Spieltags (z.B. Spieltag 1, es gibt
        // kein "Spieltag 0"). previousData bleibt null - transformIndependentLeagues
        // behandelt das als Basis 0 fuer alle Manager (siehe prevMap.get(u.i) || 0).
        // FRUEHER fiel dieser Zweig auf data.json zurueck - die wird aber bei JEDEM
        // Fetch ueberschrieben, ist also keine gefrorene Basis, sondern wanderte bei
        // jedem weiteren Fetch am selben Spieltag mit (Bug: "Spieltagspunkte" zeigten
        // nur noch die Differenz zum letzten Fetch statt zur echten Spieltag-Summe).
        console.log(`No snapshot for MD ${currentMatchday - 1} found. Using baseline 0 (previousData stays null).`);
    }

    // 4. Daten transformieren
    const data = transformIndependentLeagues(rawResults, previousData);
    
    if (data.error) {
        console.error("Error transforming data:", data.error);
        process.exit(1);
    }

    if (data.errors) {
        console.warn("Warnungen beim Abruf einzelner Ligen:", JSON.stringify(data.errors, null, 2));
    }

    // Sicherheitsnetz: Wenn ALLE Ligen fehlgeschlagen sind (z.B. weil noch die alten
    // Kickbase-Zugangsdaten hinterlegt sind), NICHT die bestehenden Daten mit einem
    // leeren Fehlerzustand überschreiben. Bestehende data.json/Snapshots bleiben erhalten.
    if (data.errors && data.errors.length === data.leagues.length) {
        console.error("Alle Ligen konnten nicht geladen werden - bestehende data.json wird NICHT überschrieben.");
        process.exit(0);
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
