// Service Worker fuer Push-Benachrichtigungen im Hintergrund (App geschlossen /
// im Hintergrund). Muss im Web-Root liegen (nicht unter /src), damit der Browser
// ihn mit vollem Scope registrieren kann.
//
// Die Firebase-Web-Config ist NICHT geheim (oeffentlich einsehbare Client-Config,
// siehe frontend/src/firebase.js) und wird hier bewusst fest hinterlegt, da
// Service Worker keine Vite-Umgebungsvariablen lesen koennen.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDnLGo-_UFaDKFVwpvjb1yhx9LUOGKYQdg',
  authDomain: 'kickbase-ligasystem.firebaseapp.com',
  projectId: 'kickbase-ligasystem',
  storageBucket: 'kickbase-ligasystem.firebasestorage.app',
  messagingSenderId: '401740931804',
  appId: '1:401740931804:web:8110ae77069e7830d48a19'
});

const messaging = firebase.messaging();

// Hintergrund-Benachrichtigungen anzeigen (App nicht im Vordergrund).
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Ligasystem';
  const options = {
    body: payload.notification?.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.fcmOptions?.link || payload.data?.link || '/admin' }
  };
  self.registration.showNotification(title, options);
});

// Klick auf die Benachrichtigung -> App/Tab oeffnen bzw. in den Vordergrund holen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
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
