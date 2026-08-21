// Service Worker fuer Push-Benachrichtigungen im Hintergrund (App geschlossen /
// im Hintergrund). Muss im Web-Root liegen (nicht unter /src), damit der Browser
// ihn mit vollem Scope registrieren kann.
//
// WICHTIG: Diese Datei enthaelt bewusst NUR Platzhalter. Die echten Firebase-
// Config-Werte werden beim Build (vite.config.js, Plugin "inject-sw-config")
// aus den VITE_FIREBASE_*-Umgebungsvariablen eingesetzt und landen nur im
// generierten dist/-Ordner (nicht im Git-Repo, das oeffentlich ist).

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: '__VITE_FIREBASE_API_KEY__',
  authDomain: '__VITE_FIREBASE_AUTH_DOMAIN__',
  projectId: '__VITE_FIREBASE_PROJECT_ID__',
  storageBucket: '__VITE_FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__VITE_FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__VITE_FIREBASE_APP_ID__'
});

const messaging = firebase.messaging();

// Neue Version des Service Workers sofort aktivieren (statt erst nach
// mehrfachem Schliessen/Neuoeffnen der App), damit Updates schnell ankommen.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

// Hintergrund-Benachrichtigungen anzeigen (App nicht im Vordergrund).
//
// WICHTIG: Der Server schickt bewusst nur "data" (kein "notification"-Feld).
// Bei einem "notification"-Payload wuerde der Browser automatisch selbst eine
// Benachrichtigung anzeigen - zusaetzlich zu unserem eigenen
// showNotification()-Aufruf hier, was zu doppelten Benachrichtigungen fuehrt.
messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title || 'Ligasystem';
  const options = {
    body: payload.data?.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.data?.link || '/admin' }
  };
  self.registration.showNotification(title, options);
  
  if ('setAppBadge' in navigator) {
    navigator.setAppBadge(1).catch(() => {});
  }
});

// Klick auf die Benachrichtigung -> App/Tab oeffnen bzw. in den Vordergrund holen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }
  const targetUrl = event.notification.data?.url || '/admin';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
