// Reine Hilfsfunktion fuer die Live-Pitch-Darstellung (ui/LiveLineupGrid.jsx)
// - eigene Datei statt in LiveLineupGrid.jsx selbst, weil eine .jsx-Datei mit
// react-refresh NUR Komponenten exportieren darf (sonst bricht Fast Refresh).

// Fuellt die Startelf auf 11 Spieler auf (Flaschenhals-Positionsverteilung
// wie backend/squadRules.js: 1 TW, min. 3 ABW, min. 3 MF, min. 2 ST, Rest
// MF/ST) - Platzhalter zeigen "-" statt einer Zahl (siehe LivePlayerCircle).
export const buildLineupWithDummies = (players) => {
  const lineup = [...players];
  let twCount = lineup.filter((p) => p.position === 1).length;
  let awCount = lineup.filter((p) => p.position === 2).length;
  let mfCount = lineup.filter((p) => p.position === 3).length;
  let stCount = lineup.filter((p) => p.position === 4).length;

  let dummyIndex = 1;
  while (lineup.length < 11) {
    const dummy = { id: 'dummy-' + dummyIndex++, isDummy: true, name: 'Unbekannt', lastName: 'Unbekannt', points: null, imagePath: null };
    if (twCount < 1) { dummy.position = 1; twCount++; }
    else if (awCount < 3) { dummy.position = 2; awCount++; }
    else if (mfCount < 3) { dummy.position = 3; mfCount++; }
    else if (stCount < 2) { dummy.position = 4; stCount++; }
    else if (mfCount < 5) { dummy.position = 3; mfCount++; }
    else { dummy.position = 4; stCount++; }
    lineup.push(dummy);
  }
  return lineup;
};

// Vereinswappen je Team-ID aus all_players.json ableiten (jeder Spieler
// traegt tid [Team-ID] + tim [Wappen-SVG-Pfad seines EIGENEN Vereins] - ein
// Treffer pro Team reicht). Fuer die Spieler-Detailseite (PlayerLiveDetailPage),
// die "eigenes Wappen - Ergebnis - Gegner-Wappen" wie im Kickbase-Original
// zeigt (Owner-Vorlage 23.11.2026, Screenshot "Rômulo 181 Punkte").
export const buildTeamLogoMap = (allPlayers) => {
  const map = new Map();
  (allPlayers || []).forEach((p) => {
    if (p.tid != null && p.tim && !map.has(String(p.tid))) {
      map.set(String(p.tid), `https://kickbase.b-cdn.net/${p.tim}`);
    }
  });
  return map;
};
