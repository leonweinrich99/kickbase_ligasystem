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

// Erkennt besondere Spielaktionen (Tor, Vorlage, Elfmeter gehalten) aus den
// Kickbase-Events (deutsch & englisch, abgesichert ueber Mindestpunktzahl,
// damit Torschuesse, Schussvorlagen oder Gegentore nie faelschlich ausloesen).
export const classifyHighlightEvent = (ev) => {
  if (!ev || typeof ev.points !== 'number' || ev.points <= 0) return null;
  const label = String(ev.label || '').toLowerCase();

  // 1. Elfmeter gehalten (TW)
  const isPenaltySave =
    ev.points >= 30 &&
    (/(elfmeter|strafstoß|strafstoss|penalty).*(gehalten|pariert|abgewehrt|saved)/.test(label) ||
      /(gehalten|pariert|saved).*(elfmeter|strafstoß|strafstoss|penalty)/.test(label));
  if (isPenaltySave) return 'penalty_save';

  // 2. Tor
  const excludedGoal = /(gegentor|kassiert|eigentor|conceded|own goal|vorlage|assist|parade|gehalten|saved|torschuss|schuss|abgewehrt|verhindert|zu null|clean sheet)/i;
  const matchesGoal = /(\btor\b|tor erzielt|elfmetertor|freistoßtor|freistosstor|kopfballtor|weitschusstor|\bgoal\b|penalty scored)/i;
  if (ev.points >= 40 && !excludedGoal.test(label) && (matchesGoal.test(label) || ev.points >= 70)) {
    return 'goal';
  }

  // 3. Torvorlage
  const excludedAssist = /(torschussvorlage|schussvorlage|shot assist)/i;
  const matchesAssist = /(torvorlage|\bvorlage\b|\bassist\b)/i;
  if (ev.points >= 20 && !excludedAssist.test(label) && matchesAssist.test(label)) {
    return 'assist';
  }

  return null;
};

export const HIGHLIGHT_ACCENT_COLOR = {
  goal: '#22c55e',
  assist: '#38bdf8',
  penalty_save: '#f59e0b',
};

export const HIGHLIGHT_PRIORITY = {
  goal: 3,
  penalty_save: 2,
  assist: 1,
};
