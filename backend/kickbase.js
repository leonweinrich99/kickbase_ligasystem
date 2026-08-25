process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');

// Der Kickbase-Account aus KICKBASE_EMAIL/PASS muss selbst Mitglied jeder Liga sein,
// damit wir per API überhaupt Daten abrufen können - taucht dadurch aber als
// (fiktiver) Teilnehmer "Admin" mit 0 Punkten in jeder Liga auf. Das ist kein echter
// Manager und darf nirgendwo in der App auftauchen (Tabelle, Ratings, Advisor, ...).
// Konfigurierbar in backend/technical-accounts.json (gleiches Muster wie
// pokal-excluded.json), damit sich das ohne Code-Änderung anpassen lässt.
const TECHNICAL_ACCOUNTS_PATH = path.join(__dirname, 'technical-accounts.json');
const loadExcludedManagerNames = () => {
    try {
        if (fs.existsSync(TECHNICAL_ACCOUNTS_PATH)) {
            return JSON.parse(fs.readFileSync(TECHNICAL_ACCOUNTS_PATH, 'utf8')).excludedNames || [];
        }
    } catch (e) {
        console.warn('Konnte technical-accounts.json nicht lesen:', e.message);
    }
    return [];
};

const fetchSingleLeagueData = async (email, password, leagueNameContains = "Qualigruppe 1") => {
    try {
        console.log(`Attempting to login to Kickbase for ${email}...`);
        const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                em: email, 
                loy: false, 
                pass: password, 
                rep: {} 
            })
        });
        const loginData = await loginRes.json();

        if (loginData.err) {
            console.error(`API Error for ${email}:`, loginData.errMsg);
            return { error: `Login fehlgeschlagen: ${loginData.errMsg}`, source: { email, league: leagueNameContains } };
        }

        const token = loginData.tkn;
        if (!token) {
            console.error(`No token received for ${email}.`);
            return { error: `Login fehlgeschlagen: Kein Token erhalten`, source: { email, league: leagueNameContains } };
        }

        // 1. Hole alle Ligen
        const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', { headers: { Authorization: `Bearer ${token}` } });
        const leaguesData = await leaguesRes.json();

        let targetId = null;
        const leaguesList = leaguesData?.lins || leaguesData?.leagues || (Array.isArray(leaguesData) ? leaguesData : []);
        
        const needleTokens = leagueNameContains.toLowerCase().match(/[a-z0-9]+/g) || [];
        for (const l of leaguesList) {
            const leagueName = (l.n || l.name).toLowerCase();
            const leagueTokens = leagueName.match(/[a-z0-9]+/g) || [];
            
            const isMatch = needleTokens.every(token => leagueTokens.includes(token));
            if (isMatch || leagueName.includes(leagueNameContains.toLowerCase())) {
                targetId = l.i || l.id;
                break;
            }
        }

        if (!targetId) {
            console.log(`No league found for ${email} with target "${leagueNameContains}".`);
            return { error: `Liga "${leagueNameContains}" nicht gefunden`, source: { email, league: leagueNameContains } };
        }

        console.log(`Found league "${leagueNameContains}" (ID: ${targetId}) for ${email}.`);

        // 2. Hole Ranking
        const rankingRes = await fetch(`https://api.kickbase.com/v4/leagues/${targetId}/ranking`, { headers: { Authorization: `Bearer ${token}` } });
        const rankingData = await rankingRes.json();
        const users = rankingData.us || [];



        // Budget Kalkulation: TV (Team Value) aus dem Ranking
        const userBudgets = {};
        users.forEach(u => {
            userBudgets[u.i] = u.tv || 0; 
        });

        return {
            users,
            userBudgets,
            matchday: rankingData.day || 28,
            source: { email, league: leagueNameContains }
        };

    } catch (e) {
        console.error(`Error fetching data for ${email} (${leagueNameContains}):`, e.message);
        return { error: `Systemfehler: ${e.message}`, source: { email, league: leagueNameContains } };
    }
};

// Liest ALLE konfigurierten Kickbase-Accounts aus den ENV-Variablen (aktuell
// bis zu 3: der urspruengliche Account, ein zweiter (z.B. alte
// Qualigruppen-Saison) und ein dritter, z.B. wenn Liga 1/2/3 spaeter unter
// einem neuen Account verwaltet werden). Wird an mehreren Stellen gebraucht,
// da nicht jede Liga zwingend im selben Account liegt.
const getConfiguredKickbaseAccounts = () => {
    const accounts = [];
    for (const suffix of ['', '_2', '_3']) {
        const email = process.env[`KICKBASE_EMAIL${suffix}`];
        const pass = process.env[`KICKBASE_PASS${suffix}`];
        if (email && pass) accounts.push({ email, pass });
    }
    return accounts;
};

const fetchRawKickbaseData = async () => {
    try {
        const accounts = getConfiguredKickbaseAccounts();

        const targets = ['Qualigruppe 1', 'Qualigruppe 2'];
        const tasks = [];
        for (const account of accounts) {
            for (const target of targets) {
                tasks.push(fetchSingleLeagueData(account.email, account.pass, target));
            }
        }
        return await Promise.all(tasks);
    } catch (e) {
        console.error("Error in fetchRawKickbaseData:", e.message);
        throw e;
    }
};

const transformKickbaseData = (allResults, previousData = null) => {
    try {
        let combinedUsersMap = new Map();
        let combinedBudgets = {};
        let matchday = 28;

        for (const res of allResults) {
            if (!res || res.error) continue;
            
            res.users.forEach(u => {
                if (!combinedUsersMap.has(u.i) || u.sp > combinedUsersMap.get(u.i).sp) {
                    combinedUsersMap.set(u.i, u);
                    combinedBudgets[u.i] = res.userBudgets[u.i];
                }
            });

            if (res.matchday > matchday) matchday = res.matchday;
        }

        // Vorbereitung der Punkte-Differenz (Spieltags-Wertung)
        const previousPointsMap = new Map();
        if (previousData && previousData.leagues) {
            previousData.leagues.forEach(l => {
                l.users.forEach(u => {
                    // Wir müssen die formatierte Punktzahl zurück in eine Zahl wandeln
                    const rawPoints = parseInt(u.points.replace(/\./g, '')) || 0;
                    previousPointsMap.set(u.id, rawPoints);
                });
            });
        }

        const excludedManagerNames = loadExcludedManagerNames();
        const combinedUsers = Array.from(combinedUsersMap.values())
            .filter(u => (u.sp || 0) > 0)
            .filter(u => !excludedManagerNames.includes(u.n));
        combinedUsers.sort((a, b) => (b.sp || 0) - (a.sp || 0));

        const formatPoints = (sp) => (sp || 0).toLocaleString('de-DE');
        const formatMoney = (val) => (val || 0).toLocaleString('de-DE') + ' €';

        const participantsCount = combinedUsers.length;
        const col1Count = 9;
        const col2Count = 9;

        const transformedUsers = combinedUsers.map((u, index) => {
            const rank = index + 1;
            let isTrophy = rank <= 3;
            let trophyColor = '';
            if (rank === 1) trophyColor = 'gold';
            else if (rank === 2) trophyColor = 'silver';
            else if (rank === 3) trophyColor = 'bronze';

            let status = '';
            if (index < col1Count) {
                if (index >= col1Count - 2) status = 'red';
                else if (index === col1Count - 3) status = 'yellow';
            } else if (index < col1Count + col2Count) {
                const relIndex = index - col1Count;
                if (relIndex <= 1) status = 'green';
                else if (relIndex === 2) status = 'yellow';
                else if (relIndex >= col2Count - 2) status = 'red';
                else if (relIndex === col2Count - 3) status = 'yellow';
            } else {
                const relIndex = index - (col1Count + col2Count);
                if (relIndex <= 1) status = 'green';
                else if (relIndex === 2) status = 'yellow';
            }

            // Spieltag-Punkte berechnen
            const currentPoints = u.sp || 0;
            const prevPoints = previousPointsMap.get(u.i) || 0;
            const matchdayPoints = currentPoints - prevPoints;

            return {
                id: u.i,
                rank: rank,
                name: u.n,
                points: formatPoints(currentPoints),
                pointsMatchday: formatPoints(matchdayPoints),
                estimatedBudget: formatMoney(combinedBudgets[u.i]),
                isTrophy,
                trophyColor,
                status
            };
        });

        const dashboardData = {
            name: "QUALIFIKATIONSRUNDE",
            matchday: matchday,
            participants: participantsCount,
            timestamp: new Date().toISOString(),
            leagues: [
                {
                    name: "LIGA 1",
                    color: "#3b82f6",
                    users: transformedUsers.slice(0, col1Count)
                },
                {
                    name: "LIGA 2",
                    color: "#f97316",
                    users: transformedUsers.slice(col1Count, col1Count + col2Count)
                },
                {
                    name: "LIGA 3",
                    color: "#22c55e",
                    users: transformedUsers.slice(col1Count + col2Count)
                }
            ]
        };

        return dashboardData;

    } catch (e) {
        console.error("Error transforming data:", e.message);
        return { error: e.message };
    }
};

const fetchKickbaseData = async (previousData = null) => {
    const rawData = await fetchRawKickbaseData();
    return transformKickbaseData(rawData, previousData);
};

// =====================================================================================
// NEUES LIGASYSTEM (Saison 26/27): 3 komplett unabhängige Ligen aus EINEM Kickbase-Account.
// Jede Liga hat ihr eigenes Ranking, es findet KEIN Vergleich/Zusammenführen über die
// Ligen hinweg mehr statt (anders als in der Qualifikationsrunde).
// =====================================================================================

const LEAGUE_DEFS = [
    { key: 'LIGA1', name: process.env.KICKBASE_LEAGUE_1_NAME || '1. Liga', displayName: 'LIGA 1', color: '#3b82f6' },
    { key: 'LIGA2', name: process.env.KICKBASE_LEAGUE_2_NAME || '2. Liga', displayName: 'LIGA 2', color: '#f97316' },
    { key: 'LIGA3', name: process.env.KICKBASE_LEAGUE_3_NAME || '3. Liga', displayName: 'LIGA 3', color: '#22c55e' }
];

const fetchRawIndependentLeagues = async () => {
    const accounts = getConfiguredKickbaseAccounts();

    if (accounts.length === 0) {
        console.error("Kein Kickbase-Account konfiguriert (KICKBASE_EMAIL/PASS fehlen). Bitte ENV-Variablen hinterlegen.");
        return LEAGUE_DEFS.map(def => ({ error: 'Kein Account konfiguriert', def }));
    }

    // Jede der 3 Ligen kann grundsaetzlich in einem ANDEREN Account liegen
    // (z.B. wenn ein neuer Account nur einen Teil der Ligen verwaltet) -
    // deshalb pro Liga ALLE Accounts durchprobieren, bis einer sie findet,
    // statt nur den ersten zu nutzen.
    const tasks = LEAGUE_DEFS.map(async (def) => {
        let lastResult = { error: 'Keine Accounts konfiguriert' };
        for (const account of accounts) {
            const result = await fetchSingleLeagueData(account.email, account.pass, def.name);
            if (!result.error) {
                return { ...result, def };
            }
            lastResult = result;
        }
        return { ...lastResult, def };
    });

    return await Promise.all(tasks);
};

const transformIndependentLeagues = (rawResults, previousData = null) => {
    try {
        const formatPoints = (sp) => (sp || 0).toLocaleString('de-DE');
        const formatMoney = (val) => (val || 0).toLocaleString('de-DE') + ' €';

        const prevLeagueMaps = {};
        if (previousData && previousData.leagues) {
            previousData.leagues.forEach(l => {
                const map = new Map();
                l.users.forEach(u => map.set(u.id, parseInt((u.points || '0').replace(/\./g, '')) || 0));
                prevLeagueMaps[l.name] = map;
            });
        }

        let matchday = 1;
        let participantsCount = 0;
        const errors = [];
        const excludedManagerNames = loadExcludedManagerNames();

        const leagues = rawResults.map(res => {
            const def = res.def;
            if (!res || res.error) {
                errors.push({ league: def.displayName, error: res?.error || 'Unbekannter Fehler' });
                return { name: def.displayName, color: def.color, users: [], error: res?.error || 'Keine Daten' };
            }

            if (res.matchday > matchday) matchday = res.matchday;

            const users = (res.users || [])
                .filter(u => (u.sp || 0) >= 0)
                .filter(u => !excludedManagerNames.includes(u.n));
            users.sort((a, b) => (b.sp || 0) - (a.sp || 0));
            participantsCount += users.length;

            const prevMap = prevLeagueMaps[def.displayName] || new Map();
            const n = users.length;

            const transformedUsers = users.map((u, index) => {
                const rank = index + 1;
                let isTrophy = rank <= 3;
                let trophyColor = '';
                if (rank === 1) trophyColor = 'gold';
                else if (rank === 2) trophyColor = 'silver';
                else if (rank === 3) trophyColor = 'bronze';

                // Auf-/Abstiegszonen INNERHALB der eigenen Liga (Platz 1-2 = Aufstieg, letzte 2 = Abstieg)
                let status = '';
                if (rank <= 2) status = 'green';
                else if (rank === 3) status = 'yellow';
                else if (rank >= n - 1) status = 'red';
                else if (rank === n - 2) status = 'yellow';

                const currentPoints = u.sp || 0;
                const prevPoints = prevMap.get(u.i) || 0;
                const matchdayPoints = currentPoints - prevPoints;

                return {
                    id: u.i,
                    rank,
                    name: u.n,
                    points: formatPoints(currentPoints),
                    pointsMatchday: formatPoints(matchdayPoints),
                    estimatedBudget: formatMoney(u.tv || 0),
                    isTrophy,
                    trophyColor,
                    status
                };
            });

            return { name: def.displayName, color: def.color, users: transformedUsers };
        });

        return {
            name: "LIGASYSTEM",
            matchday,
            participants: participantsCount,
            timestamp: new Date().toISOString(),
            leagues,
            errors: errors.length ? errors : undefined
        };
    } catch (e) {
        console.error("Error transforming independent league data:", e.message);
        return { error: e.message };
    }
};

const fetchIndependentLeaguesData = async (previousData = null) => {
    const rawData = await fetchRawIndependentLeagues();
    return transformIndependentLeagues(rawData, previousData);
};

module.exports = {
    fetchKickbaseData,
    fetchRawKickbaseData,
    transformKickbaseData,
    fetchRawIndependentLeagues,
    transformIndependentLeagues,
    fetchIndependentLeaguesData,
    LEAGUE_DEFS
};

