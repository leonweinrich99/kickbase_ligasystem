import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { arrayUnion, doc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { useAuth } from './AuthContext';

export const APP_SECTIONS = [
  { id: 'tabelle', label: 'Tabelle & Liga', color: '#ff5c3e' },
  { id: 'feed', label: 'Newsfeed & Artikel', color: '#38bdf8' },
  { id: 'live', label: 'Live-Spieltag', color: '#22c55e' },
  { id: 'pokal', label: 'Pokal', color: '#f59e0b' },
  { id: 'advisor', label: 'Trading Advisor', color: '#a855f7' },
  { id: 'account', label: 'Account & Kader', color: '#6366f1' },
  { id: 'rating', label: 'Manager-Rating', color: '#eab308' },
  { id: 'player', label: 'Spieler-Details', color: '#14b8a6' },
  { id: 'rules', label: 'Regelwerk', color: '#94a3b8' },
  { id: 'archiv', label: 'Saison-Archiv', color: '#64748b' },
  { id: 'admin', label: 'Admin Panel', color: '#c084fc' },
];

export function getBerlinDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function detectPlatform() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'Desktop Web';
  const ua = navigator.userAgent || '';
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  if (isIOS) return isStandalone ? 'iOS PWA' : 'Mobile Web';
  if (isAndroid) return isStandalone ? 'Android PWA' : 'Mobile Web';
  return isStandalone ? 'Desktop PWA' : 'Desktop Web';
}

export function mapRouteToSection(pathname = '/') {
  const p = String(pathname || '/').toLowerCase();
  if (p.startsWith('/feed')) return 'feed';
  if (p.startsWith('/live')) return 'live';
  if (p.startsWith('/pokal')) return 'pokal';
  if (p.startsWith('/admin/advisor')) return 'advisor';
  if (p.startsWith('/admin')) return 'admin';
  if (p.startsWith('/account/manager-rating')) return 'rating';
  if (p.startsWith('/account')) return 'account';
  if (p.startsWith('/player')) return 'player';
  if (p.startsWith('/rules')) return 'rules';
  if (p.startsWith('/archiv')) return 'archiv';
  return 'tabelle';
}

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // max 1x alle 15 Min auf users/{uid}

/**
 * Leichtgewichtiges, datensparsames App-Nutzungs-Tracking fuer das Admin Panel.
 * Schreibt nur fuer eingeloggte, freigegebene Manager:
 * - max. 1x alle 15 Min ein Heartbeat auf `users/{uid}` (lastActiveAt, platform, sessionsCount, activeDaysCount)
 * - pro eindeutigem Seitenaufruf ein atomares Inkrement auf `analytics_daily/{YYYY-MM-DD}`
 */
export function useAppAnalytics() {
  const { pathname } = useLocation();
  const { user, profile } = useAuth();
  const lastTrackedPathRef = useRef('');

  const uid = user?.uid || null;
  const isApproved = profile?.status === 'approved';
  const lastActiveDayInProfile = profile?.lastActiveDay || null;

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !uid || !isApproved) return;
    const trackKey = `${uid}:${pathname}`;
    if (lastTrackedPathRef.current === trackKey) return;
    lastTrackedPathRef.current = trackKey;

    const todayKey = getBerlinDateKey();
    const section = mapRouteToSection(pathname);
    const platform = detectPlatform();

    // 1. Session-Flag (1x pro Browser-Tab/App-Oeffnung)
    let isNewSession = false;
    try {
      const sessKey = `kb_analytics_sess_${uid}_${todayKey}`;
      if (window.sessionStorage.getItem(sessKey) !== '1') {
        window.sessionStorage.setItem(sessKey, '1');
        isNewSession = true;
      }
    } catch {
      // ignore
    }

    // 2. Tages-Aggregat in `analytics_daily/{YYYY-MM-DD}`
    const dailyRef = doc(db, 'analytics_daily', todayKey);
    const dailyPatch = {
      date: todayKey,
      activeUids: arrayUnion(uid),
      totalPageViews: increment(1),
      sections: { [section]: increment(1) },
      updatedAt: serverTimestamp(),
    };
    if (isNewSession) {
      dailyPatch.sessions = increment(1);
      dailyPatch.platforms = { [platform]: increment(1) };
    }
    setDoc(dailyRef, dailyPatch, { merge: true }).catch(() => {});

    // 3. Nutzer-Heartbeat auf `users/{uid}` (gedrosselt auf 15 Min oder neue Session/neuer Tag)
    let shouldUpdateUser = isNewSession || lastActiveDayInProfile !== todayKey;
    try {
      const hbKey = `kb_analytics_hb_${uid}`;
      const lastHb = Number(window.localStorage.getItem(hbKey) || 0);
      if (Date.now() - lastHb >= HEARTBEAT_INTERVAL_MS) {
        shouldUpdateUser = true;
      }
      if (shouldUpdateUser) {
        window.localStorage.setItem(hbKey, String(Date.now()));
      }
    } catch {
      // ignore
    }

    if (shouldUpdateUser) {
      const userPatch = {
        lastActiveAt: serverTimestamp(),
        lastPath: pathname.slice(0, 120),
        platform,
      };
      if (isNewSession) {
        userPatch.sessionsCount = increment(1);
      }
      if (lastActiveDayInProfile !== todayKey) {
        userPatch.lastActiveDay = todayKey;
        userPatch.activeDaysCount = increment(1);
      }
      updateDoc(doc(db, 'users', uid), userPatch).catch(() => {});
    }
  }, [pathname, uid, isApproved, lastActiveDayInProfile]);
}
