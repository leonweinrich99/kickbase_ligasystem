// Erkennt neu veroeffentlichte Artikel in `feed-articles.json` sowie neue
// Montags-Ausgaben in `weekly-summary.json` und sendet genau 1x pro neuem
// Artikel eine Push-Benachrichtigung an alle Manager mit aktiviertem
// `articles`-Abo. Deduplizierung ueber Firestore `settings/pushState`.
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

const CATEGORY_PREFIX = {
  spieltag: 'Spieltagsbericht',
  pokal: 'Pokal-News',
  trading: 'Trading Journal',
  weekly: 'Weekly Summary',
  allgemein: 'Ligasystem News',
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
    const [feedJson, weeklyJson] = await Promise.all([
      fetchSiteJson('/feed-articles.json'),
      fetchSiteJson('/weekly-summary.json'),
    ]);

    const candidates = [];

    for (const a of feedJson?.articles || []) {
      if (!a?.slug || !a?.title) continue;
      candidates.push({
        key: `feed:${a.slug}`,
        title: a.title,
        subtitle: a.subtitle || '',
        category: a.category || 'allgemein',
        link: `/feed/${a.slug}`,
        date: a.date || a.publishedAt || '',
      });
    }

    const weeklyEditions = Array.isArray(weeklyJson?.editions)
      ? weeklyJson.editions
      : weeklyJson?.slug
        ? [weeklyJson]
        : [];

    for (const ed of weeklyEditions) {
      if (!ed?.slug) continue;
      candidates.push({
        key: `weekly:${ed.slug}`,
        title: ed.headline || ed.title || `Weekly Summary – Spieltag ${ed.matchday ?? ''}`.trim(),
        subtitle: ed.teaser || ed.subtitle || 'Deine persönliche Wochen-Auswertung ist online.',
        category: 'weekly',
        link: `/feed/weekly/${ed.slug}`,
        date: ed.generatedAt || ed.date || '',
      });
    }

    if (candidates.length === 0) {
      return res.status(200).json({ sent: 0, skipped: true, reason: 'Keine Artikel gefunden' });
    }

    const db = getFirestore(app);
    const state = await getPushState(db, 'pushState');
    const allKeys = candidates.map((c) => c.key);

    // Erster Lauf: nur Baseline speichern, damit keine alten Bestandsartikel gespammt werden.
    if (!Array.isArray(state.sentArticleKeys)) {
      await savePushState(db, { sentArticleKeys: allKeys.slice(0, 250) }, 'pushState');
      return res.status(200).json({
        sent: 0,
        baselineInitialized: true,
        trackedArticles: allKeys.length,
      });
    }

    const seen = new Set(state.sentArticleKeys);
    const fresh = candidates.filter((c) => !seen.has(c.key));
    if (fresh.length === 0) {
      return res.status(200).json({ sent: 0, skipped: true, reason: 'Keine neuen Artikel' });
    }

    // Sicherheitsdeckel: maximal 3 neue Artikel pro Lauf pushen (alle neuen Keys trotzdem markieren).
    const toNotify = fresh.slice(0, 3);

    const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
    const subscribers = [];
    usersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!Array.isArray(data.fcmTokens) || data.fcmTokens.length === 0) return;
      if (!isPrefEnabled(data, 'articles')) return;
      subscribers.push({ ref: docSnap.ref, tokens: data.fcmTokens });
    });

    let totalSent = 0;
    let totalFailed = 0;

    for (const article of toNotify) {
      const prefix = CATEGORY_PREFIX[article.category] || 'Neuer Artikel';
      const deliveries = subscribers.map((sub) => ({
        userRef: sub.ref,
        tokens: sub.tokens,
        data: {
          title: `${prefix}: ${article.title}`,
          body: article.subtitle || 'Jetzt im Newsfeed lesen.',
          link: article.link,
          tag: article.key,
        },
      }));
      const r = await sendDeliveries({ app, db, deliveries });
      totalSent += r.sent;
      totalFailed += r.failed;
    }

    const updatedKeys = [...new Set([...fresh.map((f) => f.key), ...state.sentArticleKeys])].slice(0, 250);
    await savePushState(db, { sentArticleKeys: updatedKeys }, 'pushState');

    return res.status(200).json({
      sent: totalSent,
      failed: totalFailed,
      notifiedArticles: toNotify.map((a) => a.key),
    });
  } catch (error) {
    console.error('notify-articles error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
