import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { db, getMessagingIfSupported } from './firebase';

// Der VAPID-Key ist der OEFFENTLICHE Teil des Web-Push-Zertifikats aus der
// Firebase Console (Projekteinstellungen -> Cloud Messaging -> Web-Konfiguration
// -> "Zertifikate fuer Web-Push" -> Schluesselpaar generieren). Nicht geheim.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

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
  const title = payload.data?.title || 'Ligasystem';
  const body = payload.data?.body || '';
  if (Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
  if (registration) {
    registration.showNotification(title, { body, icon: '/icons/icon-192.png' });
  } else {
    new Notification(title, { body, icon: '/icons/icon-192.png' });
  }
};

let foregroundListenerReady = false;

/**
 * Registriert den Foreground-Handler (onMessage), der Nachrichten anzeigt,
 * WAEHREND die App gerade offen/sichtbar ist. Muss bei JEDEM App-Start neu
 * aufgerufen werden - anders als der Service Worker (der dauerhaft bestehen
 * bleibt), verliert die Firebase-Messaging-Instanz diesen Handler bei jedem
 * Reload/Neustart der Seite. Ohne diesen erneuten Aufruf verschwinden
 * Nachrichten spurlos, wenn die App zum Zustellzeitpunkt sichtbar war (der
 * Service Worker liefert sie dann NICHT selbst aus, sondern reicht sie an die
 * Seite weiter - und ohne Handler landet sie im Nichts).
 */
export const initForegroundPushListener = async () => {
  if (foregroundListenerReady || !VAPID_KEY) return;
  const messaging = await getMessagingIfSupported();
  if (!messaging) return;
  foregroundListenerReady = true;
  onMessage(messaging, showDataNotification);
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
    throw new Error('Dieser Browser unterstuetzt keine Push-Benachrichtigungen.');
  }

  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    throw new Error(
      needsHomeScreenInstall()
        ? 'Auf dem iPhone geht das nur, wenn die App ueber "Zum Home-Bildschirm" installiert und von dort geoeffnet wurde.'
        : 'Dieser Browser unterstuetzt keine Push-Benachrichtigungen.'
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

  if (!token) {
    throw new Error('Konnte kein Geraete-Token erzeugen.');
  }

  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });

  // Sicherstellen, dass der Foreground-Handler aktiv ist (falls initForegroundPushListener()
  // z.B. wegen fehlendem VAPID-Key beim App-Start noch uebersprungen wurde).
  foregroundListenerReady = false;
  await initForegroundPushListener();

  return token;
};

export const disablePushNotifications = async (uid, token) => {
  if (!token) return;
  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
};
