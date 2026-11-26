// Smarter Kader-Alarm vor dem Bundesliga-Wochenende:
// 1. Prueft ueber OpenLigaDB, ob in den naechsten 54 Stunden ueberhaupt ein
//    Bundesliga-Spieltag angepfiffen wird (kein Fehlalarm in Laenderspiel-/Winterpausen!).
// 2. Prueft fuer jeden Manager mit aktiviertem `squadAlert`-Abo live den
//    Kickbase-Kader auf konkreten Handlungsbedarf:
//    - verletzte / gesperrte / angeschlagene Spieler in der Startelf (`st !== 0`)
//    - Spieler mit niedriger Startelf-Wahrscheinlichkeit (`prob >= 4`)
//    - weniger als 11 Spieler in Kader/Startelf
//    - geschaetztes Minus-Budget laut `advisor-data.json` (klar als Schätzung markiert!)
// 3. Sendet eine gezielte, kompakte Push-Nachricht direkt mit Link zu `/live`.
import { getFirestore } from 'firebase-admin/firestore';
import {
  API_BASE,
  getJson,
  loginAndFindLeague,
  mapInBatches,
  sendRateLimitIfActive,
} from './_kickbaseClient.js';
import {
  fetchSiteJson,
  getAdminApp,
  isCronAuthorized,
  isPrefEnabled,
  sendDeliveries,
} from './_pushHelper.js';

const OPENLIGA_BASE = 'https://api.openligadb.de';

function getCurrentBundesligaSeason() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
}

async function getUpcomingBundesligaMatchday() {
  const season = getCurrentBundesligaSeason();
  const res = await fetch(`${OPENLIGA_BASE}/getmatchdata/bl1/${season}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const matches = await res.json().catch(() => null);
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const nowMs = Date.now();
  const horizonMs = nowMs + 54 * 60 * 60 * 1000;
  let earliestUpcoming = null;

  for (const m of matches) {
    if (m.matchIsFinished) continue;
    const koStr = m.matchDateTimeUTC || m.matchDateTime;
    if (!koStr) continue;
    const koMs = Date.parse(koStr);
    if (Number.isNaN(koMs)) continue;
    if (koMs >= nowMs - 30 * 60 * 1000 && koMs <= horizonMs) {
      if (!earliestUpcoming || koMs < earliestUpcoming.koMs) {
        earliestUpcoming = {
          koMs,
          matchday: m.group?.groupOrderID ?? null,
        };
      }
    }
  }
  return earliestUpcoming;
}

function extractSquadArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    for (const key of ['it', 'pl', 'players', 'squad']) {
      if (Array.isArray(raw[key])) return raw[key];
    }
  }
  return [];
}

function formatShortMio(val) {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1).replace('.', ',')} Mio €`;
  return `${Math.round(abs / 1000)}k €`;
}

function findEstimatedBudget(advisorJson, kickbaseId, kickbaseName) {
  const leagues = advisorJson?.leagues;
  if (!leagues || typeof leagues !== 'object') return null;
  const normName = (kickbaseName || '').trim().toLowerCase();

  for (const lg of Object.values(leagues)) {
    // Primaer: `managerBudgets` ist direkt nach Kickbase-User-ID indiziert
    const managerBudgets = lg?.managerBudgets;
    if (managerBudgets && typeof managerBudgets === 'object') {
      if (kickbaseId != null && typeof managerBudgets[String(kickbaseId)]?.availableBudget === 'number') {
        return managerBudgets[String(kickbaseId)].availableBudget;
      }
      for (const b of Object.values(managerBudgets)) {
        const bName = String(b?.manager || b?.name || '').trim().toLowerCase();
        if (normName && bName === normName && typeof b?.availableBudget === 'number') {
          return b.availableBudget;
        }
      }
    }

    // Fallback: `budgets` (Array mit `{ manager, availableBudget }`)
    const budgets = lg?.budgets;
    const budgetList = Array.isArray(budgets)
      ? budgets
      : budgets && typeof budgets === 'object'
        ? Object.values(budgets)
        : [];
    for (const b of budgetList) {
      const bName = String(b?.manager || b?.name || '').trim().toLowerCase();
      if (normName && bName === normName && typeof b?.availableBudget === 'number') {
        return b.availableBudget;
      }
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (sendRateLimitIfActive(res)) return;

  const app = getAdminApp();
  if (!app) {
    return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase ist nicht eingerichtet' });
  }

  try {
    // 1) Spieltag-Pruefung via OpenLigaDB (verhindert Fehlalarme in Länderspiel-/Winterpausen)
    const force = req.query?.force === '1';
    const upcoming = await getUpcomingBundesligaMatchday();
    if (!upcoming && !force) {
      return res.status(200).json({
        sent: 0,
        skipped: true,
        reason: 'Kein Bundesliga-Anpfiff in den nächsten 54 Stunden (spielfrei)',
      });
    }

    const db = getFirestore(app);
    const [usersSnap, ratingsJson, advisorJson] = await Promise.all([
      db.collection('users').where('status', '==', 'approved').get(),
      fetchSiteJson('/history/manager-ratings.json'),
      fetchSiteJson('/advisor-data.json'),
    ]);

    const subscribers = [];
    usersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!Array.isArray(data.fcmTokens) || data.fcmTokens.length === 0) return;
      if (!isPrefEnabled(data, 'squadAlert')) return;
      subscribers.push({ ref: docSnap.ref, data });
    });

    if (subscribers.length === 0) {
      return res.status(200).json({ sent: 0, reason: 'Niemand hat den Kader-Alarm aktiviert' });
    }

    // Liga-Logins einmalig je benoetigter Liga (max 3 Logins)
    const authByLeague = new Map();
    const neededLeagues = new Set();
    for (const sub of subscribers) {
      const kbId = sub.data.kickbaseId != null ? String(sub.data.kickbaseId) : null;
      const lk = kbId ? ratingsJson?.[kbId]?.league : null;
      if (lk) neededLeagues.add(lk);
    }
    for (const lk of neededLeagues) {
      const auth = await loginAndFindLeague(lk);
      if (auth) authByLeague.set(lk, auth);
    }

    const mdLabel = upcoming?.matchday ? `ST ${upcoming.matchday}` : 'Spieltag';
    const onlyIssues = req.query?.onlyIssues !== '0';

    const deliveries = [];
    const inspected = await mapInBatches(
      subscribers,
      async (sub) => {
        const kbId = sub.data.kickbaseId != null ? String(sub.data.kickbaseId) : null;
        const lk = kbId ? ratingsJson?.[kbId]?.league : null;
        const auth = lk ? authByLeague.get(lk) : null;

        const issues = [];
        if (kbId && auth) {
          const raw = await getJson(
            `${API_BASE}/leagues/${auth.leagueId}/managers/${kbId}/squad`,
            auth.token
          );
          const squad = extractSquadArray(raw);
          if (squad.length > 0) {
            const explicitStarters = squad.filter((p) => typeof p.lo === 'number' && p.lo >= 0);
            const starters = explicitStarters.length > 0 ? explicitStarters.slice(0, 11) : squad.slice(0, 11);

            if (starters.length < 11) {
              const missing = 11 - starters.length;
              issues.push(`${missing} freie${missing === 1 ? 'r' : ''} Startelf-${missing === 1 ? 'Platz' : 'Plätze'}`);
            }

            const injured = starters.filter((p) => typeof p.st === 'number' && p.st !== 0);
            if (injured.length > 0) {
              const names = injured
                .slice(0, 2)
                .map((p) => p.pn || p.ln || p.n || 'Spieler')
                .join(', ');
              issues.push(
                `${injured.length} verletzte/gesperrte Starter (${names}${injured.length > 2 ? ' …' : ''})`
              );
            }

            const benchRisk = starters.filter(
              (p) => (!p.st || p.st === 0) && typeof p.prob === 'number' && p.prob >= 4
            );
            if (benchRisk.length > 0) {
              issues.push(`${benchRisk.length} Starter mit geringer Einsatzchance`);
            }
          }
        }

        const estBudget = findEstimatedBudget(advisorJson, kbId, sub.data.kickbaseName);
        if (typeof estBudget === 'number' && estBudget < 0) {
          issues.push(`geschätzt -${formatShortMio(estBudget)} im Minus (bitte in Kickbase prüfen)`);
        }

        if (issues.length > 0) {
          return {
            userRef: sub.ref,
            tokens: sub.data.fcmTokens,
            data: {
              title: `Kader-Alarm vor ${mdLabel}`,
              body: issues.join(' · '),
              link: '/live',
              tag: `squad-alert-${mdLabel}`,
            },
          };
        }

        if (!onlyIssues) {
          return {
            userRef: sub.ref,
            tokens: sub.data.fcmTokens,
            data: {
              title: `Kader-Check vor ${mdLabel}`,
              body: 'Vergiss nicht, vor Anpfiff deine Aufstellung & deinen Kontostand zu prüfen!',
              link: '/live',
              tag: `squad-check-${mdLabel}`,
            },
          };
        }
        return null;
      },
      4,
      80
    );

    for (const d of inspected) {
      if (d) deliveries.push(d);
    }

    const result = await sendDeliveries({ app, db, deliveries });
    return res.status(200).json({
      ...result,
      matchday: upcoming?.matchday ?? null,
      checkedManagers: subscribers.length,
      alertsTriggered: deliveries.length,
    });
  } catch (error) {
    console.error('squad-reminder error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
