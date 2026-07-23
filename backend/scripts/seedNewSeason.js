/**
 * Erstellt die Start-Daten für das neue, unabhängige Ligasystem (Saison 26/27).
 *
 * Die Besetzung von Liga 1/2/3 entspricht dem Endstand der Qualifikationsrunde
 * 25/26 (archivierte Gesamtwertung), abzüglich der Personen, die nicht mehr
 * mitspielen. Punkte starten bei 0, da die neue Saison noch nicht läuft -
 * sobald der neue Kickbase-Account echte Daten liefert, überschreibt der
 * normale Fetch-Workflow diese Platzhalter-Daten automatisch.
 *
 * Nutzung: node backend/scripts/seedNewSeason.js
 */

const fs = require('fs');
const path = require('path');

const ARCHIVE_DATA_PATH = path.join(__dirname, '../../frontend/public/archive/quali-2025-26/data.json');
const DATA_PATH = path.join(__dirname, '../../frontend/public/data.json');
const HISTORY_DIR = path.join(__dirname, '../../frontend/public/history');
const INDEX_PATH = path.join(HISTORY_DIR, 'index.json');

// Personen, die die Qualirunde beendet haben, aber in der neuen Saison nicht
// mehr dabei sind.
const EXCLUDED_NAMES = ['Baumi', 'magarac'];

const LEAGUE_DEFS = [
    { displayName: 'LIGA 1', color: '#3b82f6' },
    { displayName: 'LIGA 2', color: '#f97316' },
    { displayName: 'LIGA 3', color: '#22c55e' }
];

function loadFinalRanking() {
    const raw = JSON.parse(fs.readFileSync(ARCHIVE_DATA_PATH, 'utf8'));
    const allUsers = raw.leagues.reduce((acc, l) => [...acc, ...l.users], []);
    allUsers.sort((a, b) => a.rank - b.rank);
    return allUsers
        .filter(u => !EXCLUDED_NAMES.includes(u.name))
        .map(u => ({ id: u.id, name: u.name }));
}

function buildLeagueUsers(members) {
    const n = members.length;
    return members.map((m, index) => {
        const rank = index + 1;
        let isTrophy = rank <= 3;
        let trophyColor = '';
        if (rank === 1) trophyColor = 'gold';
        else if (rank === 2) trophyColor = 'silver';
        else if (rank === 3) trophyColor = 'bronze';

        let status = '';
        if (rank <= 2) status = 'green';
        else if (rank === 3) status = 'yellow';
        else if (rank >= n - 1) status = 'red';
        else if (rank === n - 2) status = 'yellow';

        return {
            id: m.id,
            rank,
            name: m.name,
            points: '0',
            pointsMatchday: '0',
            estimatedBudget: '0 €',
            isTrophy,
            trophyColor,
            status
        };
    });
}

function splitIntoLeagues(members) {
    const n = members.length;
    const base = Math.floor(n / 3);
    const remainder = n % 3;
    // Verteilt einen eventuellen Rest zuerst auf Liga 1, dann Liga 2 (gleiche Logik wie zuvor bei der Quali-Aufteilung)
    const sizes = [base + (remainder > 0 ? 1 : 0), base + (remainder > 1 ? 1 : 0), base];

    const leagues = [];
    let cursor = 0;
    for (let i = 0; i < 3; i++) {
        const slice = members.slice(cursor, cursor + sizes[i]);
        cursor += sizes[i];
        leagues.push({
            name: LEAGUE_DEFS[i].displayName,
            color: LEAGUE_DEFS[i].color,
            users: buildLeagueUsers(slice)
        });
    }
    return leagues;
}

function run() {
    const ranking = loadFinalRanking();
    console.log(`Qualirang-Liste (ohne ${EXCLUDED_NAMES.join(', ')}): ${ranking.length} Personen.`);

    const leagues = splitIntoLeagues(ranking);
    leagues.forEach(l => console.log(`  ${l.name}: ${l.users.length} Personen`));

    const payload = {
        name: 'LIGASYSTEM',
        matchday: 1,
        participants: ranking.length,
        timestamp: new Date().toISOString(),
        leagues
    };

    fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2));
    console.log(`Geschrieben: ${DATA_PATH}`);

    if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.writeFileSync(path.join(HISTORY_DIR, 'spieltag-1.json'), JSON.stringify(payload, null, 2));
    console.log('Geschrieben: history/spieltag-1.json');

    fs.writeFileSync(INDEX_PATH, JSON.stringify({ matchdays: [1] }, null, 2));
    console.log('Geschrieben: history/index.json');
}

run();
