const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchRawIndependentLeagues, transformIndependentLeagues } = require('./kickbase');
const { fetchOptimalTeam } = require('./fetchOptimalTeam');

const DATA_FILE = path.join(__dirname, 'data.json');
const HISTORY_DIR = path.join(__dirname, '../frontend/public/history');

async function triggerFetch() {
    console.log("Triggering scheduled Kickbase refresh...");
    
    // 1. Rohdaten abrufen (3 unabhängige Ligen, EIN Account)
    const rawResults = await fetchRawIndependentLeagues();
    
    // 2. Matchday bestimmen
    let currentMatchday = 1;
    for (const res of rawResults) {
        if (res && res.matchday > currentMatchday) currentMatchday = res.matchday;
    }

    // 3. Vorherigen Snapshot suchen
    let previousData = null;
    const prevMDPath = path.join(HISTORY_DIR, `spieltag-${currentMatchday - 1}.json`);
    
    if (fs.existsSync(prevMDPath)) {
        try {
            previousData = JSON.parse(fs.readFileSync(prevMDPath, 'utf8'));
        } catch (e) {}
    } else if (fs.existsSync(DATA_FILE)) {
        try {
            previousData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } catch (e) {}
    }

    // 4. Daten transformieren
    const data = transformIndependentLeagues(rawResults, previousData);

    // Sicherheitsnetz: nicht überschreiben, wenn ALLE Ligen fehlgeschlagen sind
    if (data.errors && data.errors.length === data.leagues.length) {
        console.error("Alle Ligen konnten nicht geladen werden - bestehende Daten bleiben unangetastet.");
        return;
    }

    // 5. Speichern
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log("League data successfully saved to data.json");

    if (!fs.existsSync(HISTORY_DIR)) {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
    const snapshotPath = path.join(HISTORY_DIR, `spieltag-${data.matchday}.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2));
    console.log(`Snapshot for MD ${data.matchday} updated.`);

    console.log("Triggering Optimal Team fetch (with force)...");
    await fetchOptimalTeam(true);

    
    console.log("All updates completed at", new Date().toISOString());
}


function startCron() {
    // Initial fetch to make sure the file exists immediately upon startup
    triggerFetch();

    // Cron syntax: Every Monday at 21:00
    // minute hour dayOfMonth month dayOfWeek
    cron.schedule('0 21 * * 1', () => {
        triggerFetch();
    });
    console.log("Cron job started: Scheduled to run every Monday at 21:00.");
}
//sd
module.exports = { startCron };
