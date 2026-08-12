/* global process */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const CUP_ROUNDS = [
  { name: 'Sechzehntelfinale', matchday: 5, date: '2026-10-10' },
  { name: 'Achtelfinale', matchday: 8, date: '2026-10-31' },
  { name: 'Viertelfinale', matchday: 10, date: '2026-11-21' },
  { name: 'Halbfinale', matchday: 12, date: '2026-12-05' },
  { name: 'Finale', matchday: 14, date: '2026-12-19' },
];

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

function getBerlinDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function daysBetween(first, second) {
  const firstMs = Date.parse(`${first}T00:00:00Z`);
  const secondMs = Date.parse(`${second}T00:00:00Z`);
  return Math.round((secondMs - firstMs) / 86400000);
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const querySecret = req.query.secret;
  if (!process.env.CRON_SECRET || (authHeader !== `Bearer ${process.env.CRON_SECRET}` && querySecret !== process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = getBerlinDateKey();
  const round = CUP_ROUNDS.find((entry) => daysBetween(today, entry.date) === 3);
  if (!round) {
    return res.status(200).json({ sent: 0, skipped: true, reason: 'Heute ist kein Mittwoch vor einem Pokal-Spieltag' });
  }

  const app = getAdminApp();
  if (!app) return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase ist nicht eingerichtet' });

  try {
    const db = getFirestore(app);
    const usersSnap = await db.collection('users').get();
    const tokens = [];
    const tokenOwners = new Map();

    usersSnap.forEach((userSnap) => {
      const userTokens = userSnap.data().fcmTokens;
      if (!Array.isArray(userTokens)) return;
      userTokens.forEach((token) => {
        if (!tokenOwners.has(token)) tokenOwners.set(token, userSnap.ref);
        tokens.push(token);
      });
    });

    if (tokens.length === 0) return res.status(200).json({ sent: 0, reason: 'Keine Push-Geräte registriert' });

    const messaging = getMessaging(app);
    const invalidTokens = [];
    let sent = 0;
    let failed = 0;

    for (let offset = 0; offset < tokens.length; offset += 500) {
      const chunk = tokens.slice(offset, offset + 500);
      const result = await messaging.sendEachForMulticast({
        tokens: chunk,
        data: {
          title: `Pokal-Erinnerung: ${round.name}`,
          body: `Diesen Samstag ist Bundesliga-Spieltag ${round.matchday}. Dein Pokal-Duell steht an!`,
          link: '/pokal',
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

    return res.status(200).json({ sent, failed, round: round.name, matchday: round.matchday });
  } catch (error) {
    console.error('pokal-reminder error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
