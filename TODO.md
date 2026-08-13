# TODO – Account-/Pokal-/Advisor-Feinschliff

Diese Liste sammelt alle offenen Punkte aus der Feedback-Runde vom 13.08.2026,
damit wir sie systematisch abarbeiten und den Überblick behalten koennen.
Bitte Haken setzen (`[x]`), sobald ein Punkt erledigt UND getestet ist.

## 🐛 Bugs

- [x] **Regelkatalog-Bearbeitung funktionierte nicht**: Der Stift-Button war
      nur bei Maus-Hover sichtbar (`opacity-0 group-hover:opacity-100`) -
      auf Touch-Geräten/PWA gibt es aber keinen Hover-Zustand, der Button war
      dadurch praktisch unsichtbar/unerreichbar. Jetzt dauerhaft sichtbar.
      "Als Admin: Maus über eine Regel bewegen..."-Hinweistext entfernt.
- [x] **Zurück-Navigation inkonsistent**: `useBackNavigation()`-Hook erstellt
      und überall angewendet.
- [x] **Trading Advisor: Kader-Empfehlung war leer** - Ursache gefunden über
      Debug-Log: Merge-Konflikt, da sowohl die Live-Vorhersagen als auch die
      Kader-API ein Feld `mv` liefern → pandas hängt beim Merge
      stillschweigend `_x`/`_y` an, wodurch die Spalte `mv` verschwand
      (`"['mv'] not in index"`). Fix: Nur die Join-Spalte aus der Kader-API
      übernehmen, alle Werte kommen aus den (aktuelleren) Vorhersagen.
- [ ] Regelkatalog-Anzeige selbst ("wird nicht dargestellt") - laut
      Rückmeldung funktioniert die Anzeige inzwischen, nur das Bearbeiten war
      betroffen (siehe oben) → als gelöst betrachtet.

## 🚀 Trading Advisor für alle Manager (neu)

- [x] **Kader-Empfehlungen für JEDEN Manager, ohne eigenen Login**: Über den
      Kickbase-Endpoint `/leagues/{id}/managers/{managerId}/squad` kann der
      EINE technische Hauptaccount die Kader ALLER Manager einer Liga
      abrufen - kein Nutzer muss eigene Kickbase-Zugangsdaten hinterlegen.
      `run_advisor.py` berechnet jetzt für jeden Manager in der Liga
      personalisierte Kader-Empfehlungen (`managerSquads` je Kickbase-ID).
- [x] Account-Seite: neuer "Kader"-Tab im Season-Snapshot zeigt automatisch
      die eigenen, personalisierten Empfehlungen (per `kickbaseId`) an.
- [x] Admin-Seite (`/admin/advisor`): Dropdown zum Durchschalten aller
      Manager-Kader zu Test-/Debug-Zwecken.
- [ ] **Sobald bereit**: `LEAGUE_DEFS` in `run_advisor.py` von der
      "test"-Liga auf die 3 echten Ligen (`LIGA1/2/3`) umstellen (Block ist
      bereits vorbereitet, nur auskommentiert).
- [x] **Kader-Endpoint hat anderes Feldschema**: `/managers/{id}/squad`
      nennt die Spieler-ID `pi` statt `i` (`pn`, `tid`, `pos`, `p`, `mv`
      statt `i`, `n`, ...) - robuste Feld-Erkennung ergänzt, jetzt getestet.

## 🔍 Scouting-Report im Trading Advisor (neu, 13.08.2026)

- [x] **Recherche Kickbase-API vs. transfermarkt.de**: Kickbase liefert
      zuverlässig Position, Team, Marktwert-Verlauf, Punkte/Spieltag,
      Einsatzminuten/Spieltag. Vereinshistorie, Geburtsdatum, Nationalität,
      Tore/Vorlagen sind über die Kickbase-API **nicht verfügbar** (kein
      passender Endpoint gefunden) - dafür bräuchte man transfermarkt.de
      (Scraping, kein offizielles API, aktuell nicht umgesetzt).
- [x] **"Graph steigt, Wert negativ"-Widerspruch behoben**: Die alte Anzeige
      zeigte nur EINE Gesamtveränderung über das komplette Chart-Fenster
      (z.B. 60 Tage) - das kann bei einem Einbruch mit anschließender
      Erholung widersprüchlich wirken. Jetzt: klare 1-Tag-/3-Tage-/7-Tage-
      Aufschlüsselung (direkt aus den Modell-Features, nicht aus dem
      sichtbaren Chart-Ausschnitt berechnet).
- [x] **Scouting-Report ergänzt**: Einsätze (Saison), Gesamtminuten,
      Ø Punkte/Spiel, letzter Spieltag (Minuten + Punkte) - korrekt
      dedupliziert (ein Spieltag zählt nur einmal, nicht pro Kalendertag).
      Sichtbar sowohl in der Kartenübersicht (kompakt) als auch im
      Detail-Modal (vollständig).

## 🎨 Icon-Familie (neu)

- [ ] **Eigene Icons im Logo-Stil erstellen lassen** (Sechseck + isometrisches
      3-Stufen-Podest in Blau/Orange/Grün + wechselndes "Topper"-Symbol,
      siehe fertiger Prompt im Chat vom 13.08.2026). Geplante Icons:
      Trading Advisor, Regelkatalog, Admin Panel, Erinnerungen, Quali-Archiv,
      Kader, Spielplan. **Wird später von Leon erledigt** (Asset-Erstellung
      über externe Bild-KI), danach Einbau in die App durch mich.

## 🎨 Account-Seite

- [x] Profilbild oben rechts im Header.
- [x] Liga- & Pokal-Bereich neu gedacht (Season-Snapshot-Karte mit Tabs).
- [x] Pokal-Matchkarte angereichert (Datum, Gegner-Liga, Gegner-Stats).
- [x] Nächster Bundesliga-Spieltag integriert.

## 👤 Profilseite

- [x] Unnötige Unterüberschriften entfernt.
- [x] Name, Kickbase-Name und Passwort in einer Karte zusammengefasst.

## 📱 PWA

- [x] Pencil-Button-Bug (siehe oben) war direkt PWA-bedingt (kein Hover auf
      Touch-Geräten) - behoben.
- [ ] Weiteres PWA-Verhalten bei Gelegenheit gegenchecken.

---

**Alles oben Erledigte ist committet & gepusht.** Offene Punkte: Umstellung
auf die 3 echten Ligen (wenn gewünscht) und ein finaler PWA-Rundgang.

