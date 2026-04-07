const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { startCron } = require('./cron');

const app = express();
app.use(cors());

const DATA_FILE = path.join(__dirname, 'data.json');

app.get('/api/league', (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        res.json(JSON.parse(data));
    } else {
        res.status(404).json({ error: 'Data not available yet.' });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    // Start the cron scheduler
    startCron();
});
