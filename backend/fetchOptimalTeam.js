require('dotenv').config();
const fs = require('fs');
const path = require('path');
const solver = require('javascript-lp-solver');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Hilfsfunktion für Pausen (Rate-Limiting verhindern)
const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchOptimalTeam() {
    const email = process.env.KICKBASE_EMAIL;
    const password = process.env.KICKBASE_PASS;
    // Wir nehmen an, dass es eine Ziel-Liga gibt
    const targetLeagueName = process.env.KICKBASE_LEAGUE || "Qualigruppe 1"; 

    if (!email || !password) {
        console.error("KICKBASE_EMAIL oder KICKBASE_PASS fehlt in .env (oder als Umgebungsvariable).");
        return;
    }

    console.log(`Starte Optimale-Elf-Berechnung für Account: ${email}`);

    try {
        // 1. Login
        const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ em: email, loy: false, pass: password, rep: {} })
        });
        const loginData = await loginRes.json();
        
        if (loginData.err) {
            throw new Error(`Login fehlgeschlagen: ${loginData.errMsg}`);
        }
        
        const token = loginData.tkn;
        
        // 2. Ligen abrufen und League-ID finden
        const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const leaguesData = await leaguesRes.json();
        const leaguesList = leaguesData.lins || leaguesData.leagues || [];
        
        if (leaguesList.length === 0) {
            throw new Error("Dieser Account ist in keiner Kickbase-Liga.");
        }

        let leagueId = null;
        let foundLeagueName = "";

        // Erst nach dem Wunschnamen suchen
        for (const l of leaguesList) {
            const name = l.n || l.name;
            if (name.toLowerCase().includes(targetLeagueName.toLowerCase())) {
                leagueId = l.i || l.id;
                foundLeagueName = name;
                break;
            }
        }
        
        // Fallback: Wenn nicht gefunden, nimm einfach die erste Liga
        if (!leagueId) {
            const firstLeague = leaguesList[0];
            leagueId = firstLeague.i || firstLeague.id;
            foundLeagueName = firstLeague.n || firstLeague.name;
            console.log(`Liga '${targetLeagueName}' nicht gefunden. Nutze stattdessen erste verfügbare Liga: '${foundLeagueName}'`);
        } else {
            console.log(`Nutze Liga: '${foundLeagueName}' (ID: ${leagueId})`);
        }
        
        // 3. Ranking abrufen, um den aktuellen Spieltag zu erfahren
        const rankingRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/ranking`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const rankingData = await rankingRes.json();
        const currentMatchday = rankingData.day; // Der Spieltag, der gerade abgeschlossen wurde oder läuft
        console.log(`Aktueller Spieltag erkannt: ${currentMatchday}`);

        // 4. Bundesliga-Teams abrufen (v4/base/predictions/teams/1)
        console.log("Rufe Bundesliga-Teams ab...");
        const teamsRes = await fetch('https://api.kickbase.com/v4/base/predictions/teams/1', {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!teamsRes.ok) {
            const errText = await teamsRes.text();
            throw new Error(`Fehler beim Abrufen der Teams (Status ${teamsRes.status}): ${errText}`);
        }

        const teamsData = await teamsRes.json();
        console.log("Teams API Antwort Keys:", Object.keys(teamsData));
        
        // Versuche verschiedene Keys für die Teams-Liste (Kickbase nutzt 'tms')
        const teams = teamsData.tms || teamsData.teams || teamsData.t || (Array.isArray(teamsData) ? teamsData : []);
        
        console.log(`Lade Spieler für ${teams.length} Teams...`);
        let allPlayers = [];

        // 5. Spieler aller Teams abrufen
        for (let tIdx = 0; tIdx < teams.length; tIdx++) {
            const team = teams[tIdx];
            const teamId = team.tid || team.i || team.id || team.teamId;
            const teamName = team.tn || team.n || team.name || "Unbekannt";
            
            if (!teamId) {
                console.log(`Überspringe Team ohne ID: ${JSON.stringify(team)}`);
                continue;
            }
            
            console.log(`Abfrage Team ${tIdx+1}/18: ${teamName} (ID: ${teamId})...`);
            
            // Wir nutzen den Team-Profile Endpoint, um den Kader abzurufen
            const teamProfileRes = await fetch(`https://api.kickbase.com/v4/competitions/1/teams/${teamId}/teamprofile`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (!teamProfileRes.ok) {
                console.error(`  -> FEHLER: Konnte Profil für ${teamName} nicht laden (Status ${teamProfileRes.status})`);
                continue;
            }

            const profileData = await teamProfileRes.json();
            console.log(`  -> Profil geladen. Keys: ${Object.keys(profileData).join(', ')}`);

            // Versuche verschiedene Keys für die Spielerliste
            let playersRaw = profileData.pl || profileData.players || profileData.p || profileData.sl || profileData.squad;
            let playersList = [];

            if (Array.isArray(playersRaw)) {
                playersList = playersRaw;
            } else if (playersRaw && typeof playersRaw === 'object') {
                // Falls es ein Objekt ist, nimm alle Werte (Values)
                playersList = Object.values(playersRaw);
                console.log(`  -> 'pl' ist ein Objekt. Konvertiere ${playersList.length} Values zu Array.`);
            }

            console.log(`  -> ${playersList.length} Spieler gefunden.`);
            
            for (const p of playersList) {
                if (!p || typeof p !== 'object') continue;
                const pId = p.i || p.id;
                if (!pId) continue;

                allPlayers.push({
                    id: pId,
                    teamId: teamId,
                    firstName: p.fn || '',
                    lastName: p.n || p.ln || '',
                    name: `${p.fn ? p.fn + ' ' : ''}${p.n || p.ln || ''}`.trim(),
                    position: p.p || p.pos || 0, // 1=TW, 2=AW, 3=MF, 4=ST
                    marketValue: p.mv || p.marketValue || 0,
                    imagePath: p.pi || p.profileBig || p.profile
                });
            }
            await delay(300); // 300ms Pause pro Team
        }
        
        console.log(`Insgesamt ${allPlayers.length} Spieler geladen. Rufe nun detaillierte Stats für Spieltag ${currentMatchday} ab (dies kann ca. 2-3 Minuten dauern)...`);
        
        // 6. Für jeden Spieler detaillierte Stats abrufen, um die Punkte für den `currentMatchday` zu bekommen
        for (let i = 0; i < allPlayers.length; i++) {
            const player = allPlayers[i];
            
            try {
                const statsRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/players/${player.id}/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                if (statsRes.status === 200) {
                    const statsData = await statsRes.json();
                    const matchDays = statsData.matchDays || statsData.mds || [];
                    
                    // Suche nach den Punkten des aktuellen Spieltags
                    const mdStat = matchDays.find(md => (md.day || md.d) === currentMatchday);
                    player.points = mdStat ? (mdStat.points || mdStat.p || 0) : 0;
                } else {
                    player.points = 0;
                }
            } catch (err) {
                console.error(`Fehler bei Spieler ${player.id}: ${err.message}`);
                player.points = 0;
            }
            
            if (i % 50 === 0 && i > 0) {
                console.log(`Fortschritt: ${i} / ${allPlayers.length} Spieler verarbeitet...`);
            }
            await delay(250); // 250ms Pause pro Spieler (Rate-Limiting)
        }
        
        console.log("Stats geladen. Starte Berechnung der optimalen Elf...");

        // ==========================================
        // 7. ILP Solver: Die Optimale Elf berechnen
        // ==========================================
        
        // Modell initialisieren
        const model = {
            optimize: "points",
            opType: "max",
            constraints: {
                budget: { max: 250000000 },
                total_players: { equal: 11 },
                pos_1: { equal: 1 },         // Genau 1 TW
                pos_2: { min: 3, max: 5 },   // 3-5 AW
                pos_3: { min: 3, max: 5 },   // 3-5 MF
                pos_4: { min: 1, max: 3 }    // 1-3 ST
            },
            variables: {},
            ints: {}
        };
        
        // Jedes Team darf max 2 Spieler stellen
        const teamIds = [...new Set(allPlayers.map(p => p.teamId))];
        for (const tid of teamIds) {
            model.constraints[`team_${tid}`] = { max: 2 };
        }
        
        // Variablen befüllen (jeder Spieler ist eine Variable [0 oder 1])
        for (const p of allPlayers) {
            const varName = `player_${p.id}`;
            model.variables[varName] = {
                points: p.points,
                budget: p.marketValue,
                total_players: 1,
                [`team_${p.teamId}`]: 1,
                [`pos_${p.position}`]: 1
            };
            model.ints[varName] = 1;
        }
        
        // Lösen!
        const result = solver.Solve(model);
        
        if (!result.feasible) {
            throw new Error("Der Solver konnte keine gültige Aufstellung finden (Constraints nicht erfüllbar).");
        }
        
        console.log(`Lösung gefunden! Max Punkte: ${result.result}`);
        
        // Gewählte Spieler extrahieren
        const selectedPlayerIds = [];
        for (const key in result) {
            if (key.startsWith('player_') && result[key] === 1) {
                selectedPlayerIds.push(key.replace('player_', ''));
            }
        }
        
        const bestTeam = allPlayers.filter(p => selectedPlayerIds.includes(p.id.toString()));
        
        // Nach Positionen sortieren (TW -> AW -> MF -> ST)
        bestTeam.sort((a, b) => a.position - b.position);
        
        // Zusammenfassung berechnen
        const totalPoints = bestTeam.reduce((sum, p) => sum + p.points, 0);
        const totalBudget = bestTeam.reduce((sum, p) => sum + p.marketValue, 0);
        
        const outputData = {
            matchday: currentMatchday,
            totalPoints: totalPoints,
            totalBudget: totalBudget,
            timestamp: new Date().toISOString(),
            lineup: bestTeam
        };
        
        // Speichern im Frontend-Ordner
        const outDir = path.join(__dirname, '..', 'frontend', 'public', 'history');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        
        const filePath = path.join(outDir, `optimal-md-${currentMatchday}.json`);
        fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2));
        
        console.log(`Erfolg! Optimale Elf für Spieltag ${currentMatchday} gespeichert in ${filePath}`);
        
    } catch (e) {
        console.error("Fehler im FetchOptimalTeam-Prozess:", e);
    }
}

// Wenn direkt ausgeführt
if (require.main === module) {
    fetchOptimalTeam();
}

module.exports = { fetchOptimalTeam };
