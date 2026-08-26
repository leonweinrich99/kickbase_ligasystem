import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  const app = getAdminApp();
  if (!app) return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });

  try {
    // Bewusst dynamischer Import statt statischem Top-Level-Import (siehe
    // notify-admins.js): "firebase-admin/auth" als statischer Import ließ die
    // gesamte Funktion beim Laden in Vercels Serverless-Bundling mit einem
    // 500er crashen, noch bevor der Handler-Code überhaupt lief.
    const { getAuth } = await import('firebase-admin/auth');
    const decodedToken = await getAuth(app).verifyIdToken(idToken);
    const db = getFirestore(app);
    
    // Admin Check
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }

    const { title, body, link } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    const usersSnap = await db.collection('users').get();
    const tokens = [];
    const tokenOwners = new Map();

    usersSnap.forEach((userSnap) => {
      const data = userSnap.data();
      const userTokens = data.fcmTokens;
      if (!Array.isArray(userTokens)) return;
      userTokens.forEach((token) => {
        if (!tokenOwners.has(token)) tokenOwners.set(token, userSnap.ref);
        tokens.push(token);
      });
    });

    if (tokens.length === 0) return res.status(200).json({ sent: 0, reason: 'Niemand hat Benachrichtigungen aktiviert' });

    const messaging = getMessaging(app);
    const invalidTokens = [];
    let sent = 0;
    let failed = 0;

    for (let offset = 0; offset < tokens.length; offset += 500) {
      const chunk = tokens.slice(offset, offset + 500);
      const result = await messaging.sendEachForMulticast({
        tokens: chunk,
        data: {
          title,
          body,
          link: link || '/',
        },
      });
      sent += result.successCount;
      failed += result.failureCount;
      result.responses.forEach((response, index) => {
        if (!response.success) invalidTokens.push(chunk[index]);
      });
    }

    if (invalidTokens.length > 0) {
      const { FieldValue } = await import('firebase-admin/firestore');
      const batch = db.batch();
      const uniqueOwners = new Set();
      invalidTokens.forEach((token) => {
        const owner = tokenOwners.get(token);
        if (!owner || uniqueOwners.has(owner.path)) return;
        uniqueOwners.add(owner.path);
        batch.update(owner, { 
          fcmTokens: FieldValue.arrayRemove(...invalidTokens.filter((item) => tokenOwners.get(item)?.path === owner.path)) 
        });
      });
      await batch.commit();
    }

    return res.status(200).json({ sent, failed });
  } catch (error) {
    console.error('admin-broadcast error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
