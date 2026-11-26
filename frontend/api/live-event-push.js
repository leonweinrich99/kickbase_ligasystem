// Live-Spiel Special-Events Push (OpenLigaDB als Event-Trigger + gezielter
// Kickbase playercenter-Abgleich NUR fuer aktive Startelf-Spieler von
// Abonnenten).
//
// Ablauf:
// 1. OpenLigaDB-Check (1 kostenloser Call): Laufen gerade Bundesliga-Spiele
//    (oder endete eins vor <= 12 Min.)? Wenn nein -> sofort 200 skipped (0 Kickbase-Calls!).
// 2. Firestore-Check: Gibt es Abonnenten mit `liveEvents` + `kickbaseId`?
// 3. Startelf-Mapping aus `teamcenter` (max. 3 Liga-Calls, ueber _kickbaseClient gecacht)
//    + Zuordnung zu den AKTIVEN Bundesliga-Teams via `players-lite.json`.
// 4. Gezielter `playercenter`-Abruf in 4er-Batches NUR fuer Spieler, deren Team
//    gerade spielt UND die in einer abonnierten Startelf stehen (~5-20 Spieler).
// 5. Event-Klassifizierung: Tor, Vorlage, gehaltener Elfmeter, Platzverweis.
// 6. Deduplizierung in Firestore `settings/livePushState` (1 Push je Event).
//
// Ausloeser: kostenloser externer 2-Minuten-Ping (z.B. cron-job.org) mit
// Header `Authorization: Bearer <CRON_SECRET>`.
import { getFirestore } from 'firebase-admin/firestore';
import {
  COMPETITION_ID,
  getEventTypeMap,
  getPlayerCenterCached,
  getTeamCenterCached,
  loginAndFindLeague,
  mapInBatches,
  resolveLeagueMeta,
  sendRateLimitIfActive,
} from './_kickbaseClient.js';
import {
  fetchSiteJson,
  getAdminApp,
  getPushState,
  isCronAuthorized,
  isPrefEnabled,
  savePushState,
  sendDeliveries,
} from './_pushHelper.js';

const OPENLIGA_BASE = 'https://api.openligadb.de';

const CLUB_ALIASES = {
  bayern: ['bayern', 'fc bayern', 'fcb'],
  dortmund: ['dortmund', 'borussia dortmund', 'bvb'],
  leverkusen: ['leverkusen', 'bayer 04', 'bayer leverkusen', 'b04'],
  leipzig: ['leipzig', 'rb leipzig', 'rbl'],
  stuttgart: ['stuttgart', 'vfb stuttgart', 'vfb'],
  frankfurt: ['frankfurt', 'eintracht frankfurt', 'sge'],
  freiburg: ['freiburg', 'sc freiburg', 'scf'],
  hoffenheim: ['hoffenheim', 'tsg hoffenheim', 'tsg'],
  bremen: ['bremen', 'werder bremen', 'svw'],
  augsburg: ['augsburg', 'fc augsburg', 'fca'],
  wolfsburg: ['wolfsburg', 'vfl wolfsburg', 'wob'],
  gladbach: ['gladbach', 'mgladbach', 'moenchengladbach', 'borussia moenchengladbach', 'bmg'],
  union: ['union', 'union berlin', '1 fc union', 'fcu'],
  mainz: ['mainz', 'fsv mainz', 'mainz 05', 'm05'],
  koeln: ['koeln', 'koln', '1 fc koeln', 'fc koeln', 'effzeh'],
  hamburg: ['hamburg', 'hamburger sv', 'hsv'],
  schalke: ['schalke', 'fc schalke', 's04'],
  paderborn: ['paderborn', 'sc paderborn', 'scp'],
  stpauli: ['pauli', 'st pauli', 'fc st pauli'],
  heidenheim: ['heidenheim', '1 fc heidenheim', 'fch'],
  bochum: ['bochum', 'vfl bochum'],
  kiel: ['kiel', 'holstein kiel'],
};

function normalizeClubName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveClubCanonicalKey(name) {
  const norm = normalizeClubName(name);
  if (!norm) return null;
  for (const [canonical, aliases] of Object.entries(CLUB_ALIASES)) {
    if (aliases.some((a) => norm.includes(a))) return canonical;
  }
  return norm;
}

function getCurrentBundesligaSeason() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
}

async function fetchOpenLigaActiveState() {
  const season = getCurrentBundesligaSeason();
  const res = await fetch(`${OPENLIGA_BASE}/getmatchdata/bl1/${season}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { activeMatches: [], matchday: null };
  const matches = await res.json().catch(() => null);
  if (!Array.isArray(matches) || matches.length === 0) {
    return { activeMatches: [], matchday: null };
  }

  const nowMs = Date.now();
  const activeMatches = [];
  let matchday = null;

  for (const m of matches) {
    if (matchday == null && m.group?.groupOrderID != null) {
      matchday = m.group.groupOrderID;
    }
    const koStr = m.matchDateTimeUTC || m.matchDateTime;
    const koMs = koStr ? Date.parse(koStr) : NaN;
    if (Number.isNaN(koMs)) continue;

    // Aktiv = angepfiffen (oder Anpfiff in <= 3 Min.) und noch nicht > 140 Min. alt
    // ODER frisch abgepfiffen (innerhalb der letzten ~12 Min., gemessen via lastUpdateDateTime)
    const elapsedMin = (nowMs - koMs) / 60000;
    const isInLiveWindow = !m.matchIsFinished && elapsedMin >= -3 && elapsedMin <= 145;
    let isJustFinished = false;
    if (m.matchIsFinished && elapsedMin >= 85 && elapsedMin <= 145) {
      const updMs = m.lastUpdateDateTime ? Date.parse(m.lastUpdateDateTime) : NaN;
      if (!Number.isNaN(updMs) && nowMs - updMs <= 12 * 60 * 1000) {
        isJustFinished = true;
      }
    }

    if (isInLiveWindow || isJustFinished) {
      activeMatches.push(m);
    }
  }

  return { activeMatches, matchday };
}

function classifyLivePushEvent(ev) {
  if (!ev || typeof ev.points !== 'number' || ev.points === 0) return null;
  const label = String(ev.label || '').toLowerCase();

  // 1) Platzverweis (Rot / Gelb-Rot)
  if (
    ev.points <= -40 &&
    /(rote karte|gelb-rot|gelb\/rot|platzverweis|red card|second yellow)/i.test(label)
  ) {
    return 'red_card';
  }

  if (ev.points <= 0) return null;

  // 2) Elfmeter gehalten
  const isPenaltySave =
    ev.points >= 30 &&
    (/(elfmeter|strafstoß|strafstoss|penalty).*(gehalten|pariert|abgewehrt|saved)/i.test(label) ||
      /(gehalten|pariert|saved).*(elfmeter|strafstoß|strafstoss|penalty)/i.test(label));
  if (isPenaltySave) return 'penalty_save';

  // 3) Tor
  const excludedGoal = /(gegentor|kassiert|eigentor|conceded|own goal|vorlage|assist|parade|gehalten|saved|torschuss|schuss|abgewehrt|verhindert|zu null|clean sheet)/i;
  const matchesGoal = /(\btor\b|tor erzielt|elfmetertor|freistoßtor|freistosstor|kopfballtor|weitschusstor|\bgoal\b|penalty scored)/i;
  if (ev.points >= 40 && !excludedGoal.test(label) && (matchesGoal.test(label) || ev.points >= 70)) {
    return 'goal';
  }

  // 4) Torvorlage
  const excludedAssist = /(torschussvorlage|schussvorlage|shot assist)/i;
  const matchesAssist = /(torvorlage|\bvorlage\b|\bassist\b)/i;
  if (ev.points >= 20 && !excludedAssist.test(label) && matchesAssist.test(label)) {
    return 'assist';
  }

  return null;
}

function formatEventMessage(type, playerName, minute, points) {
  const minTxt = typeof minute === 'number' && minute > 0 ? `${minute}'` : 'Live';
  const ptsTxt = points > 0 ? `+${points} Pkt` : `${points} Pkt`;

  if (type === 'goal') {
    return {
      title: `⚽ TOR! ${playerName} (${minTxt})`,
      body: `${ptsTxt} · Dein Startelf-Spieler trifft!`,
    };
  }
  if (type === 'assist') {
    return {
      title: `👟 VORLAGE! ${playerName} (${minTxt})`,
      body: `${ptsTxt} · Assist für deine Startelf!`,
    };
  }
  if (type === 'penalty_save') {
    return {
      title: `🧤 ELFER GEHALTEN! ${playerName} (${minTxt})`,
      body: `${ptsTxt} · Starke Parade für deine Startelf!`,
    };
  }
  return {
    title: `🟥 PLATZVERWEIS! ${playerName} (${minTxt})`,
    body: `${ptsTxt} · Dein Startelf-Spieler muss vom Platz.`,
  };
}

export default async function handler(req, res) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (sendRateLimitIfActive(res)) return;

  const app = getAdminApp();
  if (!app) {
    return res.status(200).json({ sent: 0, skipped: true, reason: 'Firebase nicht eingerichtet' });
  }

  try {
    // 1) OpenLigaDB Event-Gate: Laufen aktuell Bundesliga-Spiele?
    const { activeMatches, matchday: olMatchday } = await fetchOpenLigaActiveState();
    if (activeMatches.length === 0) {
      return res.status(200).json({
        sent: 0,
        skipped: true,
        reason: 'Aktuell läuft keine Bundesliga-Partie (OpenLigaDB)',
      });
    }

    const db = getFirestore(app);
    const [usersSnap, ratingsJson, playersLiteJson] = await Promise.all([
      db.collection('users').where('status', '==', 'approved').get(),
      fetchSiteJson('/history/manager-ratings.json'),
      fetchSiteJson('/history/players-lite.json'),
    ]);

    // 2) Abonnenten mit `liveEvents` + `kickbaseId` sammeln
    const subscribersByLeague = new Map();
    let totalSubscribers = 0;

    usersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.kickbaseId || !Array.isArray(data.fcmTokens) || data.fcmTokens.length === 0) return;
      if (!isPrefEnabled(data, 'liveEvents')) return;
      const kbId = String(data.kickbaseId);
      const lk = ratingsJson?.[kbId]?.league;
      if (!lk) return;
      if (!subscribersByLeague.has(lk)) subscribersByLeague.set(lk, []);
      subscribersByLeague.get(lk).push({
        kbId,
        ref: docSnap.ref,
        tokens: data.fcmTokens,
      });
      totalSubscribers += 1;
    });

    if (totalSubscribers === 0) {
      return res.status(200).json({ sent: 0, skipped: true, reason: 'Keine aktiven Live-Event-Abonnenten' });
    }

    // 3) Aktive Bundesliga-Vereine aus OpenLigaDB auf Kickbase-Team-IDs mappen
    const activeClubKeys = new Set();
    for (const m of activeMatches) {
      const k1 = resolveClubCanonicalKey(m.team1?.teamName || m.team1?.shortName);
      const k2 = resolveClubCanonicalKey(m.team2?.teamName || m.team2?.shortName);
      if (k1) activeClubKeys.add(k1);
      if (k2) activeClubKeys.add(k2);
    }

    const playerMetaById = new Map();
    const activeKickbaseTeamIds = new Set();
    for (const p of playersLiteJson?.players || []) {
      if (p?.i == null) continue;
      const pid = String(p.i);
      const tid = p.tid != null ? String(p.tid) : null;
      playerMetaById.set(pid, {
        name: `${p.fn || ''} ${p.ln || p.n || ''}`.trim() || p.ln || p.n || `Spieler ${pid}`,
        tid,
      });
      if (tid && p.tn && activeClubKeys.has(resolveClubCanonicalKey(p.tn))) {
        activeKickbaseTeamIds.add(tid);
      }
    }

    // 4) Startelf-Map fuer abonnierte Manager abrufen (max. 3 Liga-Calls)
    const ownersByPlayerId = new Map();
    let sharedToken = null;
    let resolvedDay = olMatchday;

    for (const [lk, subs] of subscribersByLeague.entries()) {
      const auth = await loginAndFindLeague(lk);
      if (sendRateLimitIfActive(res)) return;
      if (!auth) continue;
      sharedToken = auth.token;

      const meta = await resolveLeagueMeta(auth.leagueId, auth.token, null);
      if (sendRateLimitIfActive(res)) return;
      const day = meta.day || resolvedDay;
      if (!day) continue;
      resolvedDay = day;

      const sampleUid = subs[0].kbId || meta.sampleUserId;
      const teamcenter = await getTeamCenterCached(auth.leagueId, sampleUid, day, auth.token);
      if (sendRateLimitIfActive(res)) return;

      const byUid = new Map((teamcenter?.us || []).map((u) => [String(u.i), u]));
      for (const sub of subs) {
        const entry = byUid.get(sub.kbId);
        for (const rawPid of entry?.lp || []) {
          if (!rawPid) continue;
          const pid = String(rawPid);
          const pMeta = playerMetaById.get(pid);
          // Nur Spieler beruecksichtigen, deren Bundesliga-Club GERADE spielt!
          if (activeKickbaseTeamIds.size > 0 && pMeta?.tid && !activeKickbaseTeamIds.has(pMeta.tid)) {
            continue;
          }
          if (!ownersByPlayerId.has(pid)) ownersByPlayerId.set(pid, []);
          ownersByPlayerId.get(pid).push(sub);
        }
      }
    }

    const activePlayerIds = Array.from(ownersByPlayerId.keys());
    if (activePlayerIds.length === 0 || !sharedToken || !resolvedDay) {
      return res.status(200).json({
        sent: 0,
        skipped: true,
        activeMatches: activeMatches.length,
        reason: 'Kein abonnierter Startelf-Spieler in den laufenden Partien aktiv',
      });
    }

    // 5) Deduplizierungs-State aus Firestore laden (reset bei neuem Spieltag)
    const liveState = await getPushState(db, 'livePushState');
    const isSameMatchday = liveState.matchday === resolvedDay;
    const sentSet = new Set(isSameMatchday && Array.isArray(liveState.sentEventKeys) ? liveState.sentEventKeys : []);
    const isFreshState = !isSameMatchday || !Array.isArray(liveState.sentEventKeys);

    // 6) Gezielter playercenter-Abruf NUR fuer die aktiven Startelf-Spieler
    const eventTypeMap = await getEventTypeMap(sharedToken);
    if (sendRateLimitIfActive(res)) return;

    const playerSnapshots = await mapInBatches(
      activePlayerIds,
      async (pid) => {
        const pc = await getPlayerCenterCached(COMPETITION_ID, pid, resolvedDay, sharedToken);
        return pc ? { pid, pc } : null;
      },
      4,
      60
    );
    if (sendRateLimitIfActive(res)) return;

    const deliveries = [];
    const newKeys = [];

    for (const item of playerSnapshots) {
      if (!item) continue;
      const { pid, pc } = item;
      const playerName = playerMetaById.get(pid)?.name || pc.n || `Spieler ${pid}`;
      const currentMatchMinute = typeof pc.mt === 'number' ? pc.mt : null;
      const owners = ownersByPlayerId.get(pid) || [];

      for (const rawEv of pc.events || []) {
        if (!rawEv || rawEv.p === 0) continue;
        const ev = {
          label: eventTypeMap.get(rawEv.eti) || '',
          points: rawEv.p,
          minute: typeof rawEv.mt === 'number' ? rawEv.mt : 0,
        };
        const type = classifyLivePushEvent(ev);
        if (!type) continue;

        const key = `md${resolvedDay}:p${pid}:m${ev.minute}:${type}`;
        if (sentSet.has(key)) continue;

        sentSet.add(key);
        newKeys.push(key);

        // Schutz vor Alt-Event-Flut beim allerersten Aktivieren mitten in einem Spiel:
        // Events, die bereits > 15 Spielminuten zurueckliegen, nur als gesehen merken.
        if (isFreshState && currentMatchMinute != null && currentMatchMinute - ev.minute > 15) {
          continue;
        }

        const msg = formatEventMessage(type, playerName, ev.minute, ev.points);
        for (const owner of owners) {
          deliveries.push({
            userRef: owner.ref,
            tokens: owner.tokens,
            data: {
              ...msg,
              link: '/live',
              tag: key,
            },
          });
        }
      }
    }

    const result = await sendDeliveries({ app, db, deliveries });

    if (newKeys.length > 0 || !isSameMatchday) {
      await savePushState(
        db,
        {
          matchday: resolvedDay,
          sentEventKeys: Array.from(sentSet).slice(-500),
        },
        'livePushState'
      );
    }

    return res.status(200).json({
      ...result,
      matchday: resolvedDay,
      activeMatches: activeMatches.length,
      checkedPlayers: activePlayerIds.length,
      newEventsDetected: newKeys.length,
    });
  } catch (error) {
    console.error('live-event-push error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
