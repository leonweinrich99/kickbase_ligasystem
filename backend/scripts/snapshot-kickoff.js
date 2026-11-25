const fs = require('fs');
const path = require('path');

function run() {
    const dataPath = path.join(__dirname, '../../frontend/public/data.json');
    const allPlayersPath = path.join(__dirname, '../../frontend/public/history/all_players.json');
    const advisorDataPath = path.join(__dirname, '../../frontend/public/advisor-data.json');
    const snapshotDir = path.join(__dirname, '../../frontend/public/history/kickoff-squads');

    if (!fs.existsSync(snapshotDir)) {
        fs.mkdirSync(snapshotDir, { recursive: true });
    }

    if (!fs.existsSync(dataPath) || !fs.existsSync(allPlayersPath) || !fs.existsSync(advisorDataPath)) {
        console.log("Missing data files, skipping snapshot.");
        return;
    }

    const dataJson = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const allPlayers = JSON.parse(fs.readFileSync(allPlayersPath, 'utf8'));
    const advisorData = JSON.parse(fs.readFileSync(advisorDataPath, 'utf8'));

    const currentMatchday = dataJson.matchday || 1;
    console.log(`Checking snapshot for Matchday ${currentMatchday}...`);

    let minKo = Infinity;
    for (const p of allPlayers) {
        if (p.performance?.it?.length > 0) {
            const currentSeason = p.performance.it[p.performance.it.length - 1];
            if (currentSeason.ph) {
                const mdEntry = currentSeason.ph.find(e => e.day === currentMatchday);
                if (mdEntry && mdEntry.md) {
                    const ts = new Date(mdEntry.md).getTime();
                    if (ts < minKo) minKo = ts;
                }
            }
        }
    }

    if (minKo === Infinity) {
        console.log("Could not find kickoff time.");
        return;
    }

    const now = Date.now();
    const kickoffDate = new Date(minKo);
    console.log(`Kickoff for MD ${currentMatchday} is ${kickoffDate.toISOString()}`);
    
    // Check if we are past kickoff
    if (now >= minKo) {
        console.log("Kickoff has already passed. Snapshot is frozen.");
        return;
    }

    // Build current squads
    const currentSquads = {};
    for (const lName in advisorData.leagues) {
        for (const mId in advisorData.leagues[lName].managerSquads) {
            currentSquads[mId] = advisorData.leagues[lName].managerSquads[mId].map(p => String(p.playerId || p.id));
        }
    }

    // Offizielle Kickbase-Startelf-Prognose (`prob` 1..5), Status (`st`) und Schnittpunkte (`ap`)
    // kurz vor Anstoss einfrieren, damit die historische KAD-Bewertung (Expected Points vor Spieltag)
    // ab sofort die exakt vor Spielbeginn gueltige Startelf-Wahrscheinlichkeit kennt.
    const playerPreKickoff = {};
    for (const p of allPlayers) {
        const pid = p.i != null ? String(p.i) : (p.id != null ? String(p.id) : null);
        if (!pid) continue;
        playerPreKickoff[pid] = {
            prob: typeof p.prob === 'number' ? p.prob : null,
            st: typeof p.st === 'number' ? p.st : 0,
            ap: typeof p.ap === 'number' ? p.ap : null,
        };
    }

    const snapshotPath = path.join(snapshotDir, `md${currentMatchday}.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify({
        matchday: currentMatchday,
        kickoff: kickoffDate.toISOString(),
        timestamp: new Date().toISOString(),
        squads: currentSquads,
        playerPreKickoff
    }, null, 2));
    console.log(`Successfully snapshotted pre-kickoff squads & player probs (${Object.keys(playerPreKickoff).length} players) to ${snapshotPath}`);
}
run();
