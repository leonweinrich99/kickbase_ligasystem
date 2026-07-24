import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';

// Alle Werte kommen aus Umgebungsvariablen (siehe frontend/.env.example).
// Diese Konfiguration ist NICHT geheim (Firebase Web-Config ist öffentlich
// einsehbar) - der eigentliche Schutz passiert über Firestore Security Rules
// + die Admin-Freigabe (siehe firestore.rules und AuthContext.jsx).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = isFirebaseConfigured
  ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig))
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const googleProvider = new GoogleAuthProvider();

// Push-Benachrichtigungen (Firebase Cloud Messaging). isSupported() prueft
// asynchron, ob der Browser Web Push kann (z.B. iOS Safari nur als installierte
// PWA ab iOS 16.4 - in einem normalen Safari-Tab liefert es false zurueck).
export const getMessagingIfSupported = async () => {
  if (!app) return null;
  try {
    const supported = await isMessagingSupported();
    return supported ? getMessaging(app) : null;
  } catch {
    return null;
  }
};

export default app;