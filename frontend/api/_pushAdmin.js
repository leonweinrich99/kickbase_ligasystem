// Interne Admin- & Self-Test-Push-Handler (von frontend/api/push.js geroutet).
// Dateiname mit Unterstrich -> zaehlt NICHT gegen Vercels 12-Function-Hobby-Limit.
import { getFirestore } from 'firebase-admin/firestore';
import {
  getAdminApp,
  sendDeliveries,
  verifyFirebaseBearerUser,
} from './_pushHelper.js';

export async function handlePushTest(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const app = getAdminApp();
  if (!app) {
    return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });
  }

  try {
    const decoded = await verifyFirebaseBearerUser(req, app);
    if (!decoded?.uid) return res.status(401).json({ error: 'Unauthorized' });

    const db = getFirestore(app);
    const userRef = db.collection('users').doc(decoded.uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Nutzerprofil nicht gefunden' });

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

export async function handleNotifyAdmins(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const app = getAdminApp();
  if (!app) {
    return res.status(200).json({ skipped: true, reason: 'FIREBASE_SERVICE_ACCOUNT_KEY fehlt' });
  }

  try {
    const decodedToken = await verifyFirebaseBearerUser(req, app);
    if (!decodedToken?.uid) {
      return res.status(401).json({ error: 'Unauthorized: Firebase token required' });
    }

    const db = getFirestore(app);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (userDoc.exists && userDoc.data()?.status === 'approved') {
      return res.status(200).json({ skipped: true, reason: 'Account ist bereits freigeschaltet' });
    }

    const { name } = req.body || {};
    const safeName = String(name || decodedToken.name || decodedToken.email || 'Jemand').slice(0, 80);
    const safeEmail = String(decodedToken.email || 'unbekannt').slice(0, 120);

    const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
    const deliveries = [];
    adminsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.notificationPrefs?.adminSignups === false) return;
      if (!Array.isArray(data.fcmTokens) || data.fcmTokens.length === 0) return;
      deliveries.push({
        userRef: docSnap.ref,
        tokens: data.fcmTokens,
        data: {
          title: 'Neue Registrierung',
          body: `${safeName} (${safeEmail}) wartet auf Freischaltung.`,
          link: '/admin',
          tag: `signup-${decodedToken.uid}`,
        },
      });
    });

    if (deliveries.length === 0) {
      return res.status(200).json({ sent: 0, reason: 'Keine Admin-Geräte für Push registriert' });
    }

    const result = await sendDeliveries({ app, db, deliveries });
    return res.status(200).json(result);
  } catch (error) {
    console.error('notify-admins error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

export async function handleAdminBroadcast(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const app = getAdminApp();
  if (!app) {
    return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });
  }

  try {
    const decodedToken = await verifyFirebaseBearerUser(req, app);
    if (!decodedToken?.uid) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const db = getFirestore(app);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }

    const { title, body, link } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    const usersSnap = await db.collection('users').get();
    const deliveries = [];
    usersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!Array.isArray(data.fcmTokens) || data.fcmTokens.length === 0) return;
      deliveries.push({
        userRef: docSnap.ref,
        tokens: data.fcmTokens,
        data: {
          title,
          body,
          link: link || '/',
        },
      });
    });

    if (deliveries.length === 0) {
      return res.status(200).json({ sent: 0, reason: 'Niemand hat Benachrichtigungen aktiviert' });
    }

    const result = await sendDeliveries({ app, db, deliveries });
    return res.status(200).json(result);
  } catch (error) {
    console.error('admin-broadcast error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

export async function handleCommentMention(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const app = getAdminApp();
  if (!app) {
    return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });
  }

  try {
    const decodedToken = await verifyFirebaseBearerUser(req, app);
    if (!decodedToken?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getFirestore(app);
    const senderSnap = await db.collection('users').doc(decodedToken.uid).get();
    if (!senderSnap.exists || senderSnap.data()?.status !== 'approved') {
      return res.status(403).json({ error: 'Forbidden: Approved users only' });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const {
      slug = '',
      articleTitle = '',
      commentText = '',
      mentionedNames = [],
      mentionedKickbaseIds = [],
    } = body || {};

    const cleanNames = Array.isArray(mentionedNames)
      ? mentionedNames.map((n) => String(n || '').trim().toLowerCase()).filter(Boolean).slice(0, 5)
      : [];
    const cleanKbIds = Array.isArray(mentionedKickbaseIds)
      ? mentionedKickbaseIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 5)
      : [];

    if (cleanNames.length === 0 && cleanKbIds.length === 0) {
      return res.status(200).json({ sent: 0, skipped: true, reason: 'Keine Erwähnungen angegeben' });
    }

    const nameSet = new Set(cleanNames);
    const kbIdSet = new Set(cleanKbIds);
    const senderData = senderSnap.data() || {};
    const senderName = String(
      senderData.kickbaseName || senderData.displayName || decodedToken.name || 'Jemand'
    ).slice(0, 60);
    const safeSlug = String(slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeTitle = String(articleTitle || 'Artikel').slice(0, 80);
    const rawSnippet = String(commentText || '').trim().replace(/\s+/g, ' ');
    const snippet = rawSnippet.length > 110 ? `${rawSnippet.slice(0, 107)}…` : rawSnippet;

    const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
    const deliveries = [];

    usersSnap.forEach((docSnap) => {
      if (docSnap.id === decodedToken.uid) return; // Keine Selbst-Erwaehnung pushen
      const data = docSnap.data();
      if (!Array.isArray(data.fcmTokens) || data.fcmTokens.length === 0) return;

      const userKbId = data.kickbaseId != null ? String(data.kickbaseId).trim() : '';
      const userKbName = String(data.kickbaseName || '').trim().toLowerCase();
      const userDisplayName = String(data.displayName || '').trim().toLowerCase();

      const matched =
        (userKbId && kbIdSet.has(userKbId)) ||
        (userKbName && nameSet.has(userKbName)) ||
        (userDisplayName && nameSet.has(userDisplayName));

      if (!matched) return;

      deliveries.push({
        userRef: docSnap.ref,
        tokens: data.fcmTokens,
        data: {
          title: `${senderName} hat dich erwähnt`,
          body: snippet ? `„${snippet}“ · ${safeTitle}` : `Neuer Kommentar im Artikel „${safeTitle}“`,
          link: safeSlug ? `/feed/${safeSlug}#kommentare` : '/feed',
          tag: `mention-${safeSlug || 'feed'}-${Date.now()}`,
        },
      });
    });

    if (deliveries.length === 0) {
      return res.status(200).json({ sent: 0, matched: 0 });
    }

    const result = await sendDeliveries({ app, db, deliveries });
    return res.status(200).json({ ...result, matched: deliveries.length });
  } catch (error) {
    console.error('comment-mention error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
