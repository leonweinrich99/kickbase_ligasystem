import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { db, getMessagingIfSupported } from './firebase';

// Der VAPID-Key ist der OEFFENTLICHE Teil des Web-Push-Zertifikats aus der
// Firebase Console (Projekteinstellungen -> Cloud Messaging -> Web-Konfiguration
// -> "Zertifikate fuer Web-Push" -> Schluesselpaar generieren). Nicht geheim.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

// Erhoehen, sobald wesentliche neue Push-Kategorien dazukommen, um alle Manager
// einmalig nach ihren gewuenschten Benachrichtigungen zu fragen.
export const CURRENT_PUSH_PROMPT_VERSION = 2;

export const NOTIFICATION_CATEGORIES = [
  {
    key: 'liveEvents',
    title: 'Live-Spiel Special Events',
    description: 'Tor, Vorlage, gehaltener Elfmeter oder Platzverweis deiner Startelf-Spieler',
    defaultOn: true,
  },
  {
    key: 'squadAlert',
    title: 'Kader-Alarm vor Anpfiff',
    description: 'Handlungsbedarf Do/Fr vor dem Spieltag (verletzte Starter, freie Plätze, geschätztes Minus)',
    defaultOn: true,
  },
  {
    key: 'articles',
    title: 'Neue Artikel & Weekly',
    description: 'Sobald ein neuer Spieltagsbericht, Trading-Artikel oder die Weekly-Ausgabe erscheint',
    defaultOn: true,
  },
  {
    key: 'ratingUp',
    title: 'Manager-Rating Upgrade',
    description: 'Wenn dein Manager-Rating steigt oder du eine neue Kartenstufe erreichst',
    defaultOn: true,
  },
  {
    key: 'pokal',
    title: 'Pokal-Erinnerung & Ergebnisse',
    description: 'Mittwochs vor einer Pokal-Runde sowie nach Entscheidung deines Duells',
    defaultOn: true,
  },
];

export const DEFAULT_NOTIFICATION_PREFS = {
  liveEvents: true,
  squadAlert: true,
  articles: true,
  ratingUp: true,
  pokal: true,
  adminSignups: true,
};

/**
 * Vereinheitlicht die neuen `notificationPrefs` abwaertskompatibel mit den
 * bisherigen `reminderPrefs` ({ pokal, squad }), sodass Bestandsnutzer keine
 * Einstellungen verlieren.
 */
export const resolveNotificationPrefs = (profile) => {
  const np = profile?.notificationPrefs || {};
  const rp = profile?.reminderPrefs || {};
  return {
    liveEvents: typeof np.liveEvents === 'boolean' ? np.liveEvents : DEFAULT_NOTIFICATION_PREFS.liveEvents,
    squadAlert:
      typeof np.squadAlert === 'boolean'
        ? np.squadAlert
        : typeof rp.squad === 'boolean'
          ? rp.squad
          : DEFAULT_NOTIFICATION_PREFS.squadAlert,
    articles: typeof np.articles === 'boolean' ? np.articles : DEFAULT_NOTIFICATION_PREFS.articles,
    ratingUp: typeof np.ratingUp === 'boolean' ? np.ratingUp : DEFAULT_NOTIFICATION_PREFS.ratingUp,
    pokal:
      typeof np.pokal === 'boolean'
        ? np.pokal
        : typeof rp.pokal === 'boolean'
          ? rp.pokal
          : DEFAULT_NOTIFICATION_PREFS.pokal,
    adminSignups: typeof np.adminSignups === 'boolean' ? np.adminSignups : DEFAULT_NOTIFICATION_PREFS.adminSignups,
  };
};

export const getStoredFcmToken = () =>
  (typeof window !== 'undefined' ? window.localStorage.getItem('fcmToken') : null);

export const isPushEnabledOnThisDevice = (profile) => {
  const storedToken = getStoredFcmToken();
  return Boolean(storedToken && Array.isArray(profile?.fcmTokens) && profile.fcmTokens.includes(storedToken));
};

export const isPushConfigured = () => Boolean(VAPID_KEY);

// Grober Hinweis fuer die UI: Auf iOS funktioniert Web Push nur, wenn die App
// ueber "Zum Home-Bildschirm hinzufuegen" installiert wurde (ab iOS 16.4).
export const isRunningAsInstalledApp = () => {
  if (typeof window === 'undefined') return true; // Desktop/Android: keine Einschraenkung
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
};

const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

export const needsHomeScreenInstall = () => isIOS() && !isRunningAsInstalledApp();

// Zeigt eine per Data-Payload empfangene FCM-Nachricht als Benachrichtigung an
// (Server schickt bewusst nur "data", kein "notification" - siehe
// firebase-messaging-sw.js fuer die Begruendung).
const showDataNotification = async (payload) => {
  const data = payload?.data || {};
  const title = data.title || 'Kickbase Ligasystem';
  const body = data.body || '';
  const targetUrl = data.link || '/';
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: targetUrl },
  };

  try {
    const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
  } catch {
    // Fallback auf direkte Browser-Notification
  }

  const notification = new Notification(title, options);
  notification.onclick = () => {
    window.focus();
    if (targetUrl && targetUrl !== window.location.pathname) {
      window.location.assign(targetUrl);
    }
    notification.close();
  };
};

let unsubscribeForeground = null;

/**
 * Registriert den Foreground-Handler (onMessage) genau EINMAL pro Sitzung,
 * damit Nachrichten auch dann angezeigt werden, wenn die App gerade sichtbar ist.
 */
export const initForegroundPushListener = async () => {
  if (unsubscribeForeground || !VAPID_KEY) return;
  const messaging = await getMessagingIfSupported();
  if (!messaging) return;
  unsubscribeForeground = onMessage(messaging, showDataNotification);
};

/**
 * Fragt die Benachrichtigungs-Erlaubnis an (MUSS von einem direkten Klick
 * ausgeloest werden, sonst blockt iOS Safari das stillschweigend) und speichert
 * das FCM-Geraete-Token am Nutzerprofil in Firestore.
 */
export const enablePushNotifications = async (uid) => {
  if (!VAPID_KEY) {
    throw new Error('Push ist noch nicht eingerichtet (VITE_FIREBASE_VAPID_KEY fehlt).');
  }
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Dieser Browser unterstützt keine Push-Benachrichtigungen.');
  }

  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    throw new Error(
      needsHomeScreenInstall()
        ? 'Auf dem iPhone geht das nur, wenn die App über „Zum Home-Bildschirm“ installiert und von dort geöffnet wurde.'
        : 'Dieser Browser unterstützt keine Push-Benachrichtigungen.'
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Benachrichtigungen wurden im Browser nicht erlaubt.');
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

  if (!token) {
    throw new Error('Konnte kein Geräte-Token erzeugen.');
  }

  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('fcmToken', token);
  }

  await initForegroundPushListener();
  return token;
};

export const disablePushNotifications = async (uid, token) => {
  if (!token) return;
  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('fcmToken');
  }
};

export const sendSelfTestPush = async (firebaseUser) => {
  if (!firebaseUser) throw new Error('Nicht eingeloggt.');
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch('/api/push-test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Test-Push fehlgeschlagen (${res.status})`);
  }
  return data;
};
