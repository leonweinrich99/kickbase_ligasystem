// Baut eine Name -> Profilbild-URL-Zuordnung für ALLE Kickbase-Manager,
// unabhängig davon in welcher Liga/welchem Account sie stehen. Läuft bewusst
// über LIGA1-3 UND den separaten Pokal-Account (siehe backend/.env.example,
// KICKBASE_EMAIL_4/PASS_4) - manche Pokal-Teilnehmer stehen NICHT in
// LIGA1-3, ein einzelner fetch-data.js-Lauf würde sie nicht erfassen.
//
// WICHTIG: Das exakte Feld, unter dem Kickbase das Profilbild eines MANAGERS
// (nicht eines Spielers - dort ist es "pim") ausliefert, ist noch nicht
// verifiziert (siehe backend/advisor/_diag_profile_image.py /
// .github/workflows/_diag-profile-image.yml). IMAGE_FIELD_CANDIDATES wird
// daher der Reihe nach probiert; sobald das Diagnose-Skript das echte Feld
// bestätigt hat, hier auf genau dieses eine Feld reduzieren. Bis dahin ist
// dieses Skript "best effort": findet es kein bekanntes Feld, bleibt
// manager-images.json einfach leer/unvollständig und das Frontend fällt
// automatisch auf den Buchstaben-Avatar zurück (siehe ui/ManagerAvatar.jsx).
const fs = require('fs');
const path = require('path');
const { fetchSingleLeagueData, getConfiguredKickbaseAccounts, LEAGUE_DEFS } = require('../kickbase');

const IMAGE_BASE_URL = 'https://kickbase.b-cdn.net/';
const IMAGE_FIELD_CANDIDATES = ['uim', 'pim', 'img', 'profileImage', 'pi', 'im', 'shpi', 'usim'];
const OUTPUT_PATH = path.join(__dirname, '../../frontend/public/history/manager-images.json');
const POKAL_LEAGUE_NAME = process.env.KICKBASE_LEAGUE_POKAL_NAME || 'Pokal';

function resolveImagePath(u) {
    for (const key of IMAGE_FIELD_CANDIDATES) {
        const val = u?.[key];
        if (typeof val === 'string' && val.trim()) return val.trim();
    }
    return null;
}

function toFullUrl(imgPath) {
    if (!imgPath) return null;
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) return imgPath;
    return `${IMAGE_BASE_URL}${imgPath}`;
}

async function run() {
    const accounts = getConfiguredKickbaseAccounts();
    if (!accounts.length) {
        console.log('Kein Kickbase-Account konfiguriert - überspringe manager-images.json.');
        return;
    }

    // Alle Liga-Namen, die für Bilder relevant sind: die 3 Haupt-Ligen + Pokal.
    // Jede Liga kann in einem ANDEREN Account liegen, daher werden - wie auch
    // sonst in dieser App üblich (siehe fetchRawIndependentLeagues) - einfach
    // alle Accounts gegen alle Liga-Namen probiert.
    const leagueNames = [...LEAGUE_DEFS.map((d) => d.name), POKAL_LEAGUE_NAME];

    const imagesByName = {};
    let sampleKeysLogged = false;
    let foundAnyLeague = false;

    for (const account of accounts) {
        for (const leagueName of leagueNames) {
            const result = await fetchSingleLeagueData(account.email, account.pass, leagueName);
            if (result.error) continue;
            foundAnyLeague = true;

            (result.users || []).forEach((u) => {
                if (!sampleKeysLogged) {
                    console.log('Beispiel-Keys eines Ranking-Users (für die Diagnose des Bildfelds):', Object.keys(u).join(', '));
                    sampleKeysLogged = true;
                }
                const fullUrl = toFullUrl(resolveImagePath(u));
                if (fullUrl && u.n && !imagesByName[u.n]) {
                    imagesByName[u.n] = fullUrl;
                }
            });
        }
    }

    if (!foundAnyLeague) {
        console.warn('Keine der konfigurierten Ligen/Accounts konnte abgerufen werden - manager-images.json wird nicht überschrieben.');
        return;
    }

    const foundCount = Object.keys(imagesByName).length;
    console.log(`${foundCount} Manager-Profilbild(er) gefunden.`);
    if (foundCount === 0) {
        console.warn('Kein bekanntes Bildfeld in IMAGE_FIELD_CANDIDATES gefunden - bitte Diagnose-Skript prüfen und Feld ergänzen.');
    }

    if (!fs.existsSync(path.dirname(OUTPUT_PATH))) {
        fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    }
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
        updatedAt: new Date().toISOString(),
        images: imagesByName
    }, null, 2));
    console.log(`manager-images.json geschrieben (${OUTPUT_PATH}).`);
}

run().catch((err) => {
    console.error('Fehler beim Sammeln der Manager-Profilbilder:', err.message);
    // Bewusst kein process.exit(1): fehlende Bilder sind unkritisch, der Rest
    // der täglichen Datenaktualisierung soll trotzdem grün durchlaufen.
});
