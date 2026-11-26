// Vergleicht die frisch berechneten Manager-Ratings (`history/manager-ratings.json`)
// mit dem letzten Stand in Firestore `settings/pushState.lastRatings` und sendet
// eine persoenliche Push-Nachricht, sobald ein Manager sein Rating verbessert
// oder eine neue Kartenstufe (Bronze -> Silber -> Gold -> Elite) erreicht hat.
import { getFirestore } from 'firebase-admin/firestore';
import {
  fetchSiteJson,
  getAdminApp,
  getPushState,
  isCronAuthorized,
  isPrefEnabled,
  savePushState,
  sendDeliveries,
} from './_pushHelper.js';

const LEVEL_RANK = {
  Bronze: 1,
  Silber: 2,
  Silver: 2,
  Gold: 3,
  Elite: 4,
};

export default async function handler(req, res) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const app = getAdminApp();
  if (!app) {
    return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });
  }

  try {
    const ratingsJson = await fetchSiteJson('/history/manager-ratings.json');
    if (!ratingsJson || typeof ratingsJson !== 'object') {
      return res.status(502).json({ error: 'manager-ratings.json konnte nicht geladen werden' });
    }

    const currentSnapshot = {};
    for (const [kbId, entry] of Object.entries(ratingsJson)) {
      if (typeof entry?.score !== 'number') continue;
      currentSnapshot[String(kbId)] = {
        score: entry.score,
        level: entry.level || 'Bronze',
        name: entry.name || '',
      };
    }

    if (Object.keys(currentSnapshot).length === 0) {
      return res.status(200).json({ sent: 0, skipped: true, reason: 'Keine gueltigen Ratings vorhanden' });
    }

    const db = getFirestore(app);
    const state = await getPushState(db, 'pushState');
    const prevRatings = state.lastRatings;

    // Erster Lauf: nur Baseline speichern, keine falschen Upgrade-Pushes senden.
    if (!prevRatings || typeof prevRatings !== 'object' || Object.keys(prevRatings).length === 0) {
      await savePushState(db, { lastRatings: currentSnapshot }, 'pushState');
      return res.status(200).json({
        sent: 0,
        baselineInitialized: true,
        trackedManagers: Object.keys(currentSnapshot).length,
      });
    }

    const upgrades = new Map();
    for (const [kbId, cur] of Object.entries(currentSnapshot)) {
      const prev = prevRatings[kbId];
      if (!prev || typeof prev.score !== 'number') continue;
      const scoreUp = cur.score > prev.score;
      const tierUp = (LEVEL_RANK[cur.level] || 0) > (LEVEL_RANK[prev.level] || 0);
      if (scoreUp || tierUp) {
        upgrades.set(kbId, { prev, cur, tierUp });
      }
    }

    if (upgrades.size === 0) {
      await savePushState(db, { lastRatings: currentSnapshot }, 'pushState');
      return res.status(200).json({ sent: 0, skipped: true, reason: 'Keine Rating-Verbesserungen' });
    }

    const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
    const deliveries = [];

    usersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!Array.isArray(data.fcmTokens) || data.fcmTokens.length === 0) return;
      if (!isPrefEnabled(data, 'ratingUp')) return;

      let match = data.kickbaseId != null ? upgrades.get(String(data.kickbaseId)) : null;
      if (!match && data.kickbaseName) {
        const norm = data.kickbaseName.trim().toLowerCase();
        for (const upg of upgrades.values()) {
          if (upg.cur.name.trim().toLowerCase() === norm) {
            match = upg;
            break;
          }
        }
      }
      if (!match) return;

      const { prev, cur, tierUp } = match;
      deliveries.push({
        userRef: docSnap.ref,
        tokens: data.fcmTokens,
        data: {
          title: tierUp ? `Neuer Rang: ${cur.level}!` : 'Manager-Rating gestiegen!',
          body: tierUp
            ? `Dein Rating steigt von ${prev.score} auf ${cur.score} (${prev.level} → ${cur.level}).`
            : `Stark! Dein Manager-Rating verbessert sich von ${prev.score} auf ${cur.score} (${cur.level}).`,
          link: '/account/manager-rating',
          tag: `rating-up-${cur.score}`,
        },
      });
    });

    const result = await sendDeliveries({ app, db, deliveries });
    await savePushState(db, { lastRatings: currentSnapshot }, 'pushState');

    return res.status(200).json({
      ...result,
      upgradedManagers: upgrades.size,
    });
  } catch (error) {
    console.error('notify-rating-changes error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
