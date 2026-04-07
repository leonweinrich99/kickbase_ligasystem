const fs = require('fs');
const path = require('path');
const { fetchKickbaseData } = require('../kickbase');

async function run() {
    console.log("Starting Kickbase data fetch...");
    const data = await fetchKickbaseData();
    
    if (data.error) {
        console.error("Error fetching data:", data.error, data.msg);
        process.exit(1);
    }

    const outputPath = path.join(__dirname, '../../frontend/public/data.json');
    const outputDir = path.dirname(outputPath);
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log("Data successfully written to:", outputPath);
}

run();
