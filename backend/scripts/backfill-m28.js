const fs = require('fs');
const path = require('path');

const data29Path = '/Users/leonweinrich/antigravity/kickbase_ligasystem/kickbase_ligasystem/frontend/public/data.json';
const historyDir = '/Users/leonweinrich/antigravity/kickbase_ligasystem/kickbase_ligasystem/frontend/public/history';
const m28Input = [
  { "name": "Stomping Tantrum", "points": "1.881" },
  { "name": "JulianD47", "points": "1.703" },
  { "name": "Curl3z", "points": "1.598" },
  { "name": "kushler", "points": "1.548" },
  { "name": "Leon Weinrich", "points": "1.537" },
  { "name": "Esel", "points": "1.471" },
  { "name": "Vinnie JR", "points": "1.463" },
  { "name": "Wat Mamba", "points": "1.454" },
  { "name": "Ansgar Trinkmann", "points": "1.381" },
  { "name": "Mo6", "points": "1.354" },
  { "name": "MK13", "points": "1.330" },
  { "name": "J0tt", "points": "1.306" },
  { "name": "Justin", "points": "1.280" },
  { "name": "Blake", "points": "1.269" },
  { "name": "DeinHomieEnobi", "points": "1.250" },
  { "name": "Fynn", "points": "1.201" },
  { "name": "thep", "points": "1.185" },
  { "name": "Geißbock", "points": "1.183" },
  { "name": "magarac", "points": "1.157" },
  { "name": "leongarcon", "points": "1.146" },
  { "name": "Flocke", "points": "1.035" },
  { "name": "Puliester", "points": "1.030" },
  { "name": "CarlCarlsenCarlsen", "points": "1.026" },
  { "name": "AchtSieben", "points": "1.010" },
  { "name": "Marci", "points": "961" },
  { "name": "KönigMichi", "points": "933" },
  { "name": "Baumi", "points": "922" },
  { "name": "franzi__j", "points": "710" }
];

const data29 = JSON.parse(fs.readFileSync(data29Path, 'utf8'));

const formatPoints = (num) => num.toLocaleString('de-DE');
const parsePoints = (str) => parseInt(str.replace(/\./g, '')) || 0;

const m28PointsMap = {};
m28Input.forEach(u => {
    m28PointsMap[u.name] = parsePoints(u.points);
});

// Update data.json (Matchday 29)
data29.leagues.forEach(league => {
    league.users.forEach(user => {
        const curPoints = parsePoints(user.points);
        const prevPoints = m28PointsMap[user.name] || 0;
        const diff = curPoints - prevPoints;
        user.pointsMatchday = formatPoints(diff);
    });
});

// Create spieltag-28.json (History)
const data28 = JSON.parse(JSON.stringify(data29));
data28.matchday = 28;
data28.timestamp = "2026-04-06T20:00:00.000Z"; // Approximation
data28.leagues.forEach(league => {
    league.users.forEach(user => {
        const p = m28PointsMap[user.name] || 0;
        user.points = formatPoints(p);
        user.pointsMatchday = "0"; // Da wir für 27 keine Daten haben
    });
});

// Save files
if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

fs.writeFileSync(data29Path, JSON.stringify(data29, null, 2));
fs.writeFileSync(path.join(historyDir, 'spieltag-28.json'), JSON.stringify(data28, null, 2));
fs.writeFileSync(path.join(historyDir, 'index.json'), JSON.stringify({ matchdays: [28] }, null, 2));

console.log("Migration complete!");
