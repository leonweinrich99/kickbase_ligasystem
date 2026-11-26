// Sendet eine einzelne Test-Benachrichtigung ausschliesslich an die eigenen
// registrierten Geraete des eingeloggten Nutzers (Button in Reminders.jsx).
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp, sendDeliveries, verifyFirebaseBearerUser } from './_pushHelper.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const app = getAdminApp();
  if (!app) {
    return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });
  }

  try {
    const decoded = await verifyFirebaseBearerUser(req, app);
    if (!decoded?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getFirestore(app);
    const userRef = db.collection('users').doc(decoded.uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Nutzerprofil nicht gefunden' });
    }

    const tokens = snap.data()?.fcmTokens || [];
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: 'Kein Push-Gerät in deinem Profil hinterlegt' });
    }

    const result = await sendDeliveries({
      app,
      db,
      deliveries: [
        {
          userRef,
          tokens,
          data: {
            title: 'Benachrichtigungen aktiv',
            body: 'Alles eingerichtet — Live-Events, Kader-Alarme, Artikel & Rating-Upgrades kommen hier an!',
            link: '/account/reminders',
            tag: 'push-self-test',
          },
        },
      ],
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('push-test error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
