/* global process */
// Gemeinsamer Server-Helper fuer alle Push-Endpunkte (Firebase Admin,
// Cron-Authentifizierung, Nutzer-Praeferenzen, Deduplizierungs-State in
// Firestore `settings/*` und sicheres Entfernen dauerhaft ungueltiger Tokens).
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const SITE_BASE_URL = (process.env.PUBLIC_APP_URL || 'https://www.developtimize.de').replace(/\/$/, '');

export const PERMANENT_INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = req.headers?.authorization;
  return authHeader === `Bearer ${secret}`;
}

export async function verifyFirebaseBearerUser(req, app) {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) return null;
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth(app).verifyIdToken(idToken);
}

/**
 * Exaktes Gegenstueck zu frontend/src/pushNotifications.js::resolveNotificationPrefs:
 * respektiert abwaertskompatibel sowohl `notificationPrefs` als auch das alte
 * `reminderPrefs` ({ pokal, squad }).
 */
export function isPrefEnabled(userData, key) {
  const np = userData?.notificationPrefs || {};
  const rp = userData?.reminderPrefs || {};

  if (typeof np[key] === 'boolean') return np[key];

  if (key === 'pokal') {
    return typeof rp.pokal === 'boolean' ? rp.pokal : true;
  }
  if (key === 'squadAlert') {
    return typeof rp.squad === 'boolean' ? rp.squad : true;
  }
  return true;
}

export async function fetchSiteJson(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${SITE_BASE_URL}${path.startsWith('/') ? path : `/${path}`}${sep}t=${Date.now()}`;
  const res = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function getPushState(db, docId = 'pushState') {
  const snap = await db.collection('settings').doc(docId).get();
  return snap.exists ? snap.data() || {} : {};
}

export async function savePushState(db, patch, docId = 'pushState') {
  await db.collection('settings').doc(docId).set(
    {
      ...patch,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

/**
 * Sendet personalisierte oder Broadcast-Push-Nachrichten in 500er-Chunks via
 * `sendEach` und entfernt ausschließlich dauerhaft ungültige Tokens.
 *
 * `deliveries`: Array aus `{ userRef, tokens: string[], data: { title, body, link?, tag? } }`
 */
export async function sendDeliveries({ app, db, deliveries }) {
  const messages = [];
  const tokenOwners = new Map();

  for (const item of deliveries || []) {
    const tokens = Array.isArray(item.tokens) ? [...new Set(item.tokens.filter(Boolean))] : [];
    if (tokens.length === 0) continue;
    const payloadData = {
      title: String(item.data?.title || 'Kickbase Ligasystem'),
      body: String(item.data?.body || ''),
      link: String(item.data?.link || '/'),
    };
    if (item.data?.tag) payloadData.tag = String(item.data.tag);

    for (const token of tokens) {
      if (item.userRef && !tokenOwners.has(token)) {
        tokenOwners.set(token, item.userRef);
      }
      messages.push({ token, data: payloadData });
    }
  }

  if (messages.length === 0) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  const messaging = getMessaging(app);
  const invalidTokens = [];
  let sent = 0;
  let failed = 0;

  for (let offset = 0; offset < messages.length; offset += 500) {
    const chunk = messages.slice(offset, offset + 500);
    const result = await messaging.sendEach(chunk);
    sent += result.successCount;
    failed += result.failureCount;
    result.responses.forEach((resp, idx) => {
      if (!resp.success && PERMANENT_INVALID_TOKEN_CODES.has(resp.error?.code)) {
        invalidTokens.push(chunk[idx].token);
      }
    });
  }

  if (invalidTokens.length > 0 && db) {
    const tokensByOwnerPath = new Map();
    for (const token of invalidTokens) {
      const owner = tokenOwners.get(token);
      if (!owner) continue;
      if (!tokensByOwnerPath.has(owner.path)) {
        tokensByOwnerPath.set(owner.path, { ref: owner, tokens: [] });
      }
      tokensByOwnerPath.get(owner.path).tokens.push(token);
    }
    if (tokensByOwnerPath.size > 0) {
      const batch = db.batch();
      for (const entry of tokensByOwnerPath.values()) {
        batch.update(entry.ref, { fcmTokens: FieldValue.arrayRemove(...entry.tokens) });
      }
      await batch.commit();
    }
  }

  return { sent, failed, pruned: invalidTokens.length };
}
