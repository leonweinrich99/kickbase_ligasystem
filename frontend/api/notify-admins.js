/* global process */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Erwartet FIREBASE_SERVICE_ACCOUNT_KEY als Vercel-Umgebungsvariable: der
// komplette Inhalt der Service-Account-JSON-Datei aus der Firebase Console
// (Projekteinstellungen -> Dienstkonten -> "Neuen privaten Schluessel generieren"),
// als ein-zeiliger String eingefuegt. NICHT mit VITE_-Praefix -> landet nie im
// Client-Bundle.
function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;

  const serviceAccount = JSON.parse(raw);
  return initializeApp({ credential: cert(serviceAccount) });
}

const PERMANENT_INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Firebase token required' });
  }

  const app = getAdminApp();
  if (!app) {
    // Push ist (noch) nicht eingerichtet - kein harter Fehler, der Signup-Flow
    // soll davon unabhaengig funktionieren (ntfy.sh laeuft parallel als Fallback).
    return res.status(200).json({ skipped: true, reason: 'FIREBASE_SERVICE_ACCOUNT_KEY fehlt' });
  }

  try {
    const idToken = authHeader.slice('Bearer '.length).trim();
    const { getAuth } = await import('firebase-admin/auth');
    const decodedToken = await getAuth(app).verifyIdToken(idToken);

    const db = getFirestore(app);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    // Nur ausstehende (neu registrierte) Accounts duerfen Admin-Signup-Pushs ausloesen.
    if (userDoc.exists && userDoc.data()?.status === 'approved') {
      return res.status(200).json({ skipped: true, reason: 'Account ist bereits freigeschaltet' });
    }

    const { name } = req.body || {};
    const safeName = String(name || decodedToken.name || decodedToken.email || 'Jemand').slice(0, 80);
    const safeEmail = String(decodedToken.email || 'unbekannt').slice(0, 120);

    const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();

    const tokens = [];
    adminsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (Array.isArray(data.fcmTokens)) tokens.push(...data.fcmTokens);
    });

    if (tokens.length === 0) {
      return res.status(200).json({ sent: 0, reason: 'Keine Admin-Geräte für Push registriert' });
    }

    const messaging = getMessaging(app);
    const result = await messaging.sendEachForMulticast({
      tokens,
      // Bewusst NUR "data" statt "notification": Bei einem "notification"-Payload
      // zeigt der Browser/Service Worker automatisch selbst eine Benachrichtigung
      // an - zusaetzlich zu unserem eigenen showNotification()-Aufruf in
      // firebase-messaging-sw.js. Das fuehrte zu doppelten Benachrichtigungen.
      // Mit reinem "data"-Payload haben wir die volle (und einzige) Kontrolle.
      data: {
        title: 'Neue Registrierung',
        body: `${safeName} (${safeEmail}) wartet auf Freischaltung.`,
        link: 'https://www.developtimize.de/admin'
      }
    });

    // Nur dauerhaft ungueltige/abgelaufene Tokens entfernen (nie bei temporaerem FCM-500).
    const invalidTokens = [];
    result.responses.forEach((r, i) => {
      if (!r.success && PERMANENT_INVALID_TOKEN_CODES.has(r.error?.code)) {
        invalidTokens.push(tokens[i]);
      }
    });
    if (invalidTokens.length > 0) {
      const { FieldValue } = await import('firebase-admin/firestore');
      const batch = db.batch();
      adminsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (Array.isArray(data.fcmTokens) && data.fcmTokens.some((t) => invalidTokens.includes(t))) {
          batch.update(docSnap.ref, { fcmTokens: FieldValue.arrayRemove(...invalidTokens) });
        }
      });
      await batch.commit();
    }

    return res.status(200).json({ sent: result.successCount, failed: result.failureCount });
  } catch (error) {
    console.error('notify-admins error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
