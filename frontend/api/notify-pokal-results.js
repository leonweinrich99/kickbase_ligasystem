// Benachrichtigt beteiligte Manager nach Abschluss einer Pokal-Runde
// (nach update-pokal-results.yml) ueber ihr persönliches Duell-Ergebnis.
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

const ROUND_KEYS = [
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

export default async function handler(req, res) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const app = getAdminApp();
  if (!app) {
    return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });
  }

  try {
    const pokal = await fetchSiteJson('/pokal-data.json');
    if (!pokal || typeof pokal !== 'object') {
      return res.status(502).json({ error: 'pokal-data.json konnte nicht geladen werden' });
    }

    const decidedMatches = [];
    for (const r of ROUND_KEYS) {
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
