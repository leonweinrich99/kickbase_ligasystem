# Setup-Anleitung: Neue Saison 26/27 (Ligasystem, Login, Pokal)

Diese Datei fasst zusammen, was **manuell** eingerichtet werden muss, damit die im Code
vorbereiteten neuen Features live gehen. Der Code ist fertig, es fehlen nur noch echte
Zugangsdaten/Projekte, die nur der Betreiber selbst anlegen kann.

## 1. Neuer Kickbase-Account (unabhängiges Ligasystem)

Es wird nur noch **ein** Kickbase-Account benötigt, der Mitglied in allen 3 Ligen ist.

Lokal in `backend/.env` (siehe `backend/.env.example`):

```
KICKBASE_EMAIL=...
KICKBASE_PASS=...
KICKBASE_LEAGUE_1_NAME=Liga 1
KICKBASE_LEAGUE_2_NAME=Liga 2
KICKBASE_LEAGUE_3_NAME=Liga 3
```

Die `_NAME`-Werte müssen exakt so heißen wie die Ligen in der Kickbase-App (bzw. so viel
davon, dass sie eindeutig zuordenbar sind - der Code sucht per "enthält").

Für den automatischen GitHub-Actions-Workflow (`.github/workflows/update-data.yml`):
- Repository Settings -> Secrets and variables -> Actions
- Secrets: `KICKBASE_EMAIL`, `KICKBASE_PASS`
- Variables: `KICKBASE_LEAGUE_1_NAME`, `KICKBASE_LEAGUE_2_NAME`, `KICKBASE_LEAGUE_3_NAME`

Danach einmal manuell fetchen zum Testen:
```
cd backend
node scripts/fetch-data.js
```

## 2. Archiv der Qualifikationsrunde

Ist bereits erledigt: `frontend/public/archive/quali-2025-26/` enthält den eingefrorenen
Stand (Tabelle, Historie, optimale Elf). Erreichbar über `/archiv` in der App. Diese Daten
werden von den neuen Fetch-Skripten **nicht mehr angefasst**.

## 3. Pokal-Auslosung

Sobald feststeht, wer beim Pokal wirklich mitspielt (manche Personen aus der Qualirunde
spielen nicht mehr mit), optional `backend/pokal-excluded.json` anlegen:

```json
{ "excludedNames": ["Name 1", "Name 2"] }
```

Dann die Auslosung (neu) generieren:
```
cd backend
node scripts/generatePokalBracket.js
```

Das Skript liest die Endtabelle aus dem Archiv, verlost 1. Platz gegen letzten Platz usw.
und vergibt Freilose an die besten Plätze, falls weniger als 32 Teilnehmer*innen antreten.
Ergebnis landet in `frontend/public/pokal-data.json`.

## 4. Login (Firebase Auth + Firestore) + Admin Panel

### 4.1 Firebase-Projekt anlegen
1. https://console.firebase.google.com -> "Projekt hinzufügen"
2. **Authentication** aktivieren -> Sign-in-Methoden **Google** und **E-Mail/Passwort** einschalten
3. **Firestore Database** anlegen (im Produktionsmodus)
4. Unter Projekteinstellungen -> "Meine Apps" -> Web-App hinzufügen -> die angezeigte
   Config in `frontend/.env` eintragen (siehe `frontend/.env.example`):
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_INITIAL_ADMIN_EMAIL=deine-admin-mail@example.com
   ```

### 4.2 Firestore Security Rules deployen
In `frontend/firestore.rules` **zuerst** die Zeile mit `"admin@example.com"` durch deine
echte Admin-Mail ersetzen (muss exakt mit `VITE_INITIAL_ADMIN_EMAIL` übereinstimmen!).

Dann die Regeln in der Firebase Console unter Firestore -> "Regeln" einfügen und
veröffentlichen (Copy & Paste reicht, kein CLI nötig).

### 4.3 Erster Login = Admin-Bootstrap
- Mit `VITE_INITIAL_ADMIN_EMAIL` per **Google-Login** anmelden (Google-Mails sind immer
  verifiziert). Dieser Account wird automatisch `status: approved`, `role: admin`.
- Bei Login per E-Mail/Passwort muss die Adresse zusätzlich über Firebase
  E-Mail-Verifizierung bestätigt sein, sonst greift der Auto-Bootstrap nicht.

### 4.4 Weitere Nutzer freischalten
- Alle anderen registrieren sich selbst (Google oder E-Mail/Passwort) und landen erstmal
  im Status "Ausstehend" ("Warte auf Freischaltung").
- Der Admin geht auf `/admin` (Link erscheint im Footer, sobald man als Admin eingeloggt
  ist) und schaltet Accounts frei / lehnt sie ab / macht weitere Personen zu Admins.

### 4.5 Deployment (Vercel)
Alle `VITE_FIREBASE_*` und `VITE_INITIAL_ADMIN_EMAIL` Variablen zusätzlich in den
Vercel-Projekteinstellungen (Environment Variables) eintragen, damit der Login auch auf
der Live-URL funktioniert.

> Hinweis: Solange keine `VITE_FIREBASE_*` Variablen gesetzt sind, läuft die App wie
> gehabt **ohne** Login (Fail-Open für die lokale Entwicklung).

## 5. Push-Benachrichtigung bei neuen Registrierungen

Damit du mitbekommst, wenn sich jemand Neues registriert und auf Freischaltung wartet,
gibt es **zwei parallele** Wege - der zweite braucht etwas Einrichtung, funktioniert
dafür als **echte iPhone-Benachrichtigung direkt von der installierten App**.

### 5.1 ntfy.sh (schon fertig eingerichtet, separate App)
[ntfy.sh](https://ntfy.sh) ist ein kostenloser Push-Dienst ganz ohne Account.
`VITE_NTFY_TOPIC` ist lokal und in Vercel bereits mit einem zufälligen,
einzigartigen Topic-Namen hinterlegt.

1. Installiere die **ntfy-App** ([iOS](https://apps.apple.com/app/ntfy/id1625396347) /
   [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)) - oder öffne
   `https://ntfy.sh/<dein-topic>` im Browser.
2. In der App auf "+" tippen und **genau** den Topic-Namen aus `VITE_NTFY_TOPIC`
   eingeben.

### 5.2 Native Push direkt von der Ligasystem-App (Firebase Cloud Messaging)

Funktioniert auch für die als PWA auf dem iPhone-Homescreen installierte App
(**ab iOS 16.4**) - die Benachrichtigung kommt dann wie bei jeder normalen App direkt
vom Ligasystem-Icon, ganz ohne separate App. **Firebase Cloud Messaging ist komplett
kostenlos**, es wird kein kostenpflichtiger "Blaze"-Plan benötigt (das war nur bei
automatisch auslösenden Cloud Functions nötig, die hier bewusst nicht verwendet werden
- stattdessen läuft der Versand über die schon vorhandene Vercel-Funktion `/api/notify-admins`).

**Einmalige Einrichtung (2 Schritte in der Firebase Console, kein Programmieren nötig):**

1. **VAPID-Schlüssel (öffentlich):** [Firebase Console](https://console.firebase.google.com)
   → dein Projekt → Zahnrad/Projekteinstellungen → Tab **"Cloud Messaging"** → Abschnitt
   "Web-Konfiguration" → "Zertifikate für Web-Push" → **"Schlüsselpaar generieren"**.
   Den angezeigten Schlüssel kopieren und einsetzen in:
   - `frontend/.env` als `VITE_FIREBASE_VAPID_KEY=...`
   - Vercel Environment Variables als `VITE_FIREBASE_VAPID_KEY` (Production + Preview)

2. **Service-Account-Schlüssel (geheim, nur für den Server):** Projekteinstellungen →
   Tab **"Dienstkonten"** → **"Neuen privaten Schlüssel generieren"** → JSON-Datei wird
   heruntergeladen. Den kompletten Inhalt dieser Datei (als ein Stück Text) einsetzen in:
   - Vercel Environment Variables als `FIREBASE_SERVICE_ACCOUNT_KEY`
     (**wichtig:** ohne `VITE_`-Präfix, sonst landet das Geheimnis im öffentlichen
     Frontend-Bundle! Nur in Vercel eintragen, nicht in `frontend/.env`.)

**Danach im Admin Panel (`/admin`):**
- Ganz oben erscheint die Karte "Push-Benachrichtigungen auf diesem Gerät" ->
  "Benachrichtigungen aktivieren" antippen (muss ein echter Tap sein, iOS blockt
  automatische Anfragen).
- Auf dem iPhone **wichtig:** Die App muss dafür über "Zum Home-Bildschirm hinzufügen"
  installiert und von dort (nicht im Safari-Tab) geöffnet sein.
- Erlaubnis bestätigen - fertig. Jede*r Admin kann das auf beliebig vielen eigenen
  Geräten aktivieren.

> Beide Wege laufen unabhängig voneinander - du kannst nur ntfy, nur FCM, beide oder
> keins davon nutzen. Ist `VITE_FIREBASE_VAPID_KEY` nicht gesetzt, blendet sich die
> Karte im Admin Panel automatisch aus.
