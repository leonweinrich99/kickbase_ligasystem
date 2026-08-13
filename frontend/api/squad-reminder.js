/* global process */

// Erinnert freitagmorgens alle Nutzer mit aktivierter "Kader"-Erinnerung
// daran, ihren Liga-Kader fuer den bevorstehenden Bundesliga-Spieltag
// aufzustellen (die meisten Kickbase-Ligen sperren die Aufstellung ab dem
// ersten Anpfiff des Wochenendes, i.d.R. Freitagabend).
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const querySecret = req.query.secret;
  if (!process.env.CRON_SECRET || (authHeader !== `Bearer ${process.env.CRON_SECRET}` && querySecret !== process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const app = getAdminApp();
  if (!app) return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase ist nicht eingerichtet' });

  try {
    const db = getFirestore(app);
    const usersSnap = await db.collection('users').get();
    const tokens = [];
    const tokenOwners = new Map();

    usersSnap.forEach((userSnap) => {
      const data = userSnap.data();
      // Anders als bei der Pokal-Erinnerung ist dies eine NEUE, zusaetzliche
      // Erinnerung -> nur senden, wenn explizit aktiviert (Standard: aus,
      // ausser der Nutzer hat sie im Erinnerungen-Menü eingeschaltet).
      if (data.reminderPrefs?.squad !== true) return;
      const userTokens = data.fcmTokens;
      if (!Array.isArray(userTokens)) return;
      userTokens.forEach((token) => {
        if (!tokenOwners.has(token)) tokenOwners.set(token, userSnap.ref);
        tokens.push(token);
      });
    });

    if (tokens.length === 0) return res.status(200).json({ sent: 0, reason: 'Niemand hat die Kader-Erinnerung aktiviert' });

    const messaging = getMessaging(app);
    const invalidTokens = [];
    let sent = 0;
    let failed = 0;

    for (let offset = 0; offset < tokens.length; offset += 500) {
      const chunk = tokens.slice(offset, offset + 500);
      const result = await messaging.sendEachForMulticast({
        tokens: chunk,
        data: {
          title: 'Kader-Erinnerung',
          body: 'Vergiss nicht, deinen Liga-Kader für den Spieltag aufzustellen!',
          link: '/',
        },
      });
      sent += result.successCount;
      failed += result.failureCount;
      result.responses.forEach((response, index) => {
        if (!response.success) invalidTokens.push(chunk[index]);
      });
    }

    if (invalidTokens.length > 0) {
      const batch = db.batch();
      const uniqueOwners = new Set();
      invalidTokens.forEach((token) => {
        const owner = tokenOwners.get(token);
        if (!owner || uniqueOwners.has(owner.path)) return;
        uniqueOwners.add(owner.path);
        batch.update(owner, { fcmTokens: FieldValue.arrayRemove(...invalidTokens.filter((item) => tokenOwners.get(item)?.path === owner.path)) });
      });
      await batch.commit();
    }

    return res.status(200).json({ sent, failed });
  } catch (error) {
    console.error('squad-reminder error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
