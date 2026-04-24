const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchKickbaseData } = require('./kickbase');
const { fetchOptimalTeam } = require('./fetchOptimalTeam');

const DATA_FILE = path.join(__dirname, 'data.json');

async function triggerFetch() {
    console.log("Triggering scheduled Kickbase refresh...");
    const data = await fetchKickbaseData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log("League data successfully saved.");

    console.log("Triggering Optimal Team fetch...");
    await fetchOptimalTeam();
    
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
