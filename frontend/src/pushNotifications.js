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

  // Benachrichtigungen anzeigen, waehrend die App gerade selbst geoeffnet ist.
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Ligasystem';
    const body = payload.notification?.body || '';
    if (Notification.permission === 'granted') {
      registration.showNotification(title, { body, icon: '/icons/icon-192.png' });
    }
  });

  return token;
};

export const disablePushNotifications = async (uid, token) => {
  if (!token) return;
  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
};
