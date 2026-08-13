# TODO – Account-/Pokal-/Advisor-Feinschliff

Diese Liste sammelt alle offenen Punkte aus der Feedback-Runde vom 13.08.2026,
damit wir sie systematisch abarbeiten und den Überblick behalten koennen.
Bitte Haken setzen (`[x]`), sobald ein Punkt erledigt UND getestet ist.

## 🐛 Bugs

- [ ] **Regelkatalog wird nicht mehr dargestellt** (`Rules.jsx`) - Code
      mehrfach durchgegangen (Routing, Firestore-Merge, Rendering-Logik) und
      keinen Bug gefunden, der das erklären würde. **Brauche von dir:** Was
      genau siehst du - leere weiße/schwarze Seite, nur die Überschrift ohne
      Regeln, oder eine Fehlermeldung? Screenshot hilft enorm.
- [x] **Zurück-Navigation inkonsistent**: `useBackNavigation()`-Hook erstellt
      und in `Rules.jsx`, `UserDetail.jsx`, `CompareView.jsx`,
      `AdminPanel.jsx`, `Advisor.jsx`, `Reminders.jsx`, `Profile.jsx`
      angewendet - überall jetzt `navigate(-1)` mit Fallback statt fixem Ziel.
- [ ] **Trading Advisor: Kader-Empfehlung weiterhin leer** - Debug-Logging
      ergänzt (`Debug Kader: ...`), aber ich kann die GitHub-Actions-Logs
      nicht selbst auslesen (401 ohne Auth-Token). **Brauche von dir:** Bitte
      den letzten Advisor-Lauf öffnen und mir die 3 Zeilen mit `Debug Kader:`
      kopieren (oder falls keine erscheinen: die rote Fehlermeldung im
      "Run Trading Advisor"-Schritt).

## 🎨 Account-Seite

- [x] **Profilbild oben rechts** im Header - Avatar ersetzt jetzt die
      separate Profil-Kachel komplett, klickbar zu `/account/profile`,
      Admin-Badge als kleiner Punkt am Avatar.
- [x] **Liga- & Pokal-Bereich neu gedacht**: Statt 3 gestapelter Karten jetzt
      EINE Karte mit Tabs (Liga/Pokal/Spieltag) - deutlich weniger
      "Kachel-Gefühl", mehr Infos an einem Ort.
- [x] **Pokal-Matchkarte angereichert**: Datum/Uhrzeit des Matchups, Liga des
      Gegners und aktuelle Gegner-Stats (Platz, Punkte) sind jetzt im
      Pokal-Tab enthalten.
- [x] **Nächster Bundesliga-Spieltag** integriert (`bundesliga-spielplan.json`
      + Spieltag-Tab im Season-Snapshot).

## 👤 Profilseite

- [x] Unnötige Unterüberschriften entfernt (Name/Kickbase-Name/Passwort
      haben jetzt nur noch den Feldnamen, keine erklärenden Sätze mehr).
- [x] Name, Kickbase-Name und Passwort in EINE Karte mit Trennlinien
      zusammengefasst statt 3 separate Kacheln.

## 📱 PWA

- [ ] Verhalten explizit im PWA-/Standalone-Modus testen (insbesondere die
      neue `navigate(-1)`-Logik - sollte in der PWA genauso funktionieren wie
      im Browser, da React-Router-Historie unabhängig vom OS-Verlauf ist,
      aber bitte einmal live gegenchecken).

---

**Offen für dich:** Bitte bei Gelegenheit die zwei "Brauche von dir"-Punkte
oben beantworten (Regelkatalog-Screenshot + Advisor-Debug-Zeilen), dann kann
ich beide finalen Bugs beheben.

