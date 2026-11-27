// Interne geplante Push-Handler: Artikel/Weekly, Manager-Rating-Upgrades,
// Pokal-Erinnerung und Pokal-Ergebnisse (von frontend/api/push.js geroutet).
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

const LEVEL_RANK = {
  Bronze: 1,
  Silber: 2,
  Silver: 2,
  Gold: 3,
  Elite: 4,
};

const CUP_ROUNDS = [
  { name: 'Sechzehntelfinale', matchday: 5, date: '2026-10-10' },
  { name: 'Achtelfinale', matchday: 8, date: '2026-10-31' },
  { name: 'Viertelfinale', matchday: 10, date: '2026-11-21' },
  { name: 'Halbfinale', matchday: 12, date: '2026-12-05' },
  { name: 'Finale', matchday: 14, date: '2026-12-19' },
];

const POKAL_ROUND_KEYS = [
  { key: 'roundOf32Left', label: 'Sechzehntelfinale' },
  { key: 'roundOf32Right', label: 'Sechzehntelfinale' },
  { key: 'roundOf16Left', label: 'Achtelfinale' },
  { key: 'roundOf16Right', label: 'Achtelfinale' },
  { key: 'quarterFinalsLeft', label: 'Viertelfinale' },
  { key: 'quarterFinalsRight', label: 'Viertelfinale' },
  { key: 'semiFinalsLeft', label: 'Halbfinale' },
  { key: 'semiFinalsRight', label: 'Halbfinale' },
  { key: 'final', label: 'Finale' },
];

function getBerlinDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce((result, part) => {
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

export async function handleNotifyArticles(req, res) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  const app = getAdminApp();
  if (!app) return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });

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
        slug: a.slug,
        title: a.title,
        subtitle: a.subtitle || '',
        category: a.category || 'allgemein',
        link: `/feed/${a.slug}`,
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
        slug: ed.slug,
        title: ed.headline || ed.title || `Weekly Summary – Spieltag ${ed.matchday ?? ''}`.trim(),
        subtitle: ed.teaser || ed.subtitle || 'Deine persönliche Wochen-Auswertung ist online.',
        category: 'weekly',
        link: `/feed/weekly/${ed.slug}`,
      });
    }

    if (candidates.length === 0) {
      return res.status(200).json({ sent: 0, skipped: true, reason: 'Keine Artikel gefunden' });
    }

    let parsedBody = req.body;
    if (typeof parsedBody === 'string') {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {
        parsedBody = {};
      }
    }
    const forceSlug = String(parsedBody?.forceSlug || req.query?.forceSlug || '').trim();

    const db = getFirestore(app);
    const state = await getPushState(db, 'pushState');
    const allKeys = candidates.map((c) => c.key);

    let fresh;
    if (forceSlug) {
      fresh = candidates.filter((c) => c.key === forceSlug || c.slug === forceSlug);
      if (fresh.length === 0) {
        return res.status(404).json({ sent: 0, error: `Artikel "${forceSlug}" nicht gefunden` });
      }
    } else {
      if (!Array.isArray(state.sentArticleKeys)) {
        await savePushState(db, { sentArticleKeys: allKeys.slice(0, 250) }, 'pushState');
        return res.status(200).json({ sent: 0, baselineInitialized: true, trackedArticles: allKeys.length });
      }

      const seen = new Set(state.sentArticleKeys);
      fresh = candidates.filter((c) => !seen.has(c.key));
      if (fresh.length === 0) {
        return res.status(200).json({ sent: 0, skipped: true, reason: 'Keine neuen Artikel' });
      }
    }

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

    const prevKeys = Array.isArray(state.sentArticleKeys) ? state.sentArticleKeys : allKeys;
    const updatedKeys = [...new Set([...fresh.map((f) => f.key), ...prevKeys])].slice(0, 250);
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

export async function handleNotifyRatingChanges(req, res) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  const app = getAdminApp();
  if (!app) return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });

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

    return res.status(200).json({ ...result, upgradedManagers: upgrades.size });
  } catch (error) {
    console.error('notify-rating-changes error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

export async function handlePokalReminder(req, res) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const today = getBerlinDateKey();
  const round = CUP_ROUNDS.find((entry) => daysBetween(today, entry.date) === 3);
  if (!round) {
    return res.status(200).json({ sent: 0, skipped: true, reason: 'Heute ist kein Mittwoch vor einem Pokal-Spieltag' });
  }

  const app = getAdminApp();
  if (!app) return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase ist nicht eingerichtet' });

  try {
    const db = getFirestore(app);
    const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
    const deliveries = [];

    usersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!Array.isArray(data.fcmTokens) || data.fcmTokens.length === 0) return;
      if (!isPrefEnabled(data, 'pokal')) return;
      deliveries.push({
        userRef: docSnap.ref,
        tokens: data.fcmTokens,
        data: {
          title: `Pokal-Erinnerung: ${round.name}`,
          body: `Diesen Samstag ist Bundesliga-Spieltag ${round.matchday}. Dein Pokal-Duell steht an!`,
          link: '/pokal',
          tag: `pokal-reminder-${round.matchday}`,
        },
      });
    });

    const result = await sendDeliveries({ app, db, deliveries });
    return res.status(200).json({ ...result, round: round.name, matchday: round.matchday });
  } catch (error) {
    console.error('pokal-reminder error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

export async function handleNotifyPokalResults(req, res) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  const app = getAdminApp();
  if (!app) return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });

  try {
    const pokal = await fetchSiteJson('/pokal-data.json');
    if (!pokal || typeof pokal !== 'object') {
      return res.status(502).json({ error: 'pokal-data.json konnte nicht geladen werden' });
    }

    const decidedMatches = [];
    for (const r of POKAL_ROUND_KEYS) {
      const raw = pokal[r.key];
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const m of list) {
        if (!m || m.isBye || (m.winner !== 1 && m.winner !== 2)) continue;
        if (!m.p1 || !m.p2 || m.p1 === 'Freilos' || m.p2 === 'Freilos') continue;
        const matchKey = `${r.key}:${m.id || `${m.p1}-${m.p2}`}`;
        decidedMatches.push({ ...m, matchKey, roundLabel: r.label });
      }
    }

    const db = getFirestore(app);
    const state = await getPushState(db, 'pushState');
    const allKeys = decidedMatches.map((m) => m.matchKey);

    if (!Array.isArray(state.sentPokalMatches)) {
      await savePushState(db, { sentPokalMatches: allKeys }, 'pushState');
      return res.status(200).json({ sent: 0, baselineInitialized: true, trackedMatches: allKeys.length });
    }

    const seen = new Set(state.sentPokalMatches);
    const newlyDecided = decidedMatches.filter((m) => !seen.has(m.matchKey));
    if (newlyDecided.length === 0) {
      return res.status(200).json({ sent: 0, skipped: true, reason: 'Keine neuen Pokal-Ergebnisse' });
    }

    const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
    const userByName = new Map();
    usersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.kickbaseName || !Array.isArray(data.fcmTokens) || data.fcmTokens.length === 0) return;
      if (!isPrefEnabled(data, 'pokal')) return;
      userByName.set(data.kickbaseName.trim().toLowerCase(), { ref: docSnap.ref, tokens: data.fcmTokens });
    });

    const deliveries = [];
    for (const m of newlyDecided) {
      const sides = [
        { name: m.p1, opp: m.p2, ownScore: m.score1, oppScore: m.score2, won: m.winner === 1 },
        { name: m.p2, opp: m.p1, ownScore: m.score2, oppScore: m.score1, won: m.winner === 2 },
      ];
      for (const s of sides) {
        const target = userByName.get(s.name.trim().toLowerCase());
        if (!target) continue;
        const scoreTxt =
          s.ownScore != null && s.oppScore != null
            ? ` (${s.ownScore.toLocaleString('de-DE')} : ${s.oppScore.toLocaleString('de-DE')})`
            : '';
        deliveries.push({
          userRef: target.ref,
          tokens: target.tokens,
          data: {
            title: s.won ? `Pokal-${m.roundLabel}: Weiter!` : `Pokal-${m.roundLabel}: Ausgeschieden`,
            body: s.won
              ? `Du gewinnst dein Duell gegen ${s.opp}${scoreTxt}.`
              : `Knappe Sache gegen ${s.opp}${scoreTxt} — alle Ergebnisse im Pokal-Baum.`,
            link: '/pokal',
            tag: `pokal-res-${m.matchKey}`,
          },
        });
      }
    }

    const result = await sendDeliveries({ app, db, deliveries });
    const updatedKeys = [...new Set([...state.sentPokalMatches, ...newlyDecided.map((m) => m.matchKey)])];
    await savePushState(db, { sentPokalMatches: updatedKeys }, 'pushState');

    return res.status(200).json({ ...result, decidedMatches: newlyDecided.length });
  } catch (error) {
    console.error('notify-pokal-results error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
