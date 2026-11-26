import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured } from './firebase';
import { initForegroundPushListener } from './pushNotifications';

const AuthContext = createContext(null);

// Diese E-Mail-Adresse wird beim allerersten Login automatisch als Admin
// freigeschaltet, damit nicht ausgesperrt wird, wer das System einrichtet.
const INITIAL_ADMIN_EMAIL = (import.meta.env.VITE_INITIAL_ADMIN_EMAIL || '').toLowerCase();

// Push-Benachrichtigung an die Admins über ntfy.sh (kostenlos, kein Account
// nötig) - einfach die ntfy-App installieren oder https://ntfy.sh/<Topic> im
// Browser öffnen und dieses Topic abonnieren, siehe SETUP-NEUE-SAISON.md.
const NTFY_TOPIC = import.meta.env.VITE_NTFY_TOPIC || '';

const notifyNewSignup = async (firebaseUser, resolvedDisplayName) => {
  const name = resolvedDisplayName || firebaseUser.displayName || firebaseUser.email || 'Unbekannt';

  // Weg 1: Native Push-Benachrichtigung direkt auf dem Gerät der Admins (iPhone-PWA
  // etc.) über die eigene Vercel-Serverless-Funktion + Firebase Cloud Messaging.
  // Firebase ID-Token mitschicken, damit /api/notify-admins echte Neuregistrierungen
  // verifizieren kann und nicht anonym gespammt werden kann.
  try {
    const idToken = await firebaseUser.getIdToken();
    fetch('/api/notify-admins', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ name, email: firebaseUser.email }),
    }).catch(() => {});
  } catch {
    // Nice-to-have, darf den Login-Flow nicht stören.
  }

  // Weg 2: Zusätzlich über ntfy.sh, falls konfiguriert - funktioniert auch ohne
  // dass ein Admin die Push-Benachrichtigungen im Admin Panel aktiviert hat.
  if (!NTFY_TOPIC) return;
  fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: {
      'Title': 'Neue Registrierung - Ligasystem',
      'Priority': 'default',
      'Tags': 'bust_in_silhouette'
    },
    body: `${name} (${firebaseUser.email}) hat sich registriert und wartet auf Freischaltung.`
  }).catch(() => {
    // Benachrichtigung ist ein Nice-to-have und darf den Login-Flow nicht stören.
  });
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [authError, setAuthError] = useState(null);
  const pendingDisplayNameRef = useRef(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }

    // Muss bei JEDEM App-Start neu registriert werden (siehe Kommentar in
    // pushNotifications.js) - sonst verschwinden Push-Nachrichten spurlos,
    // wenn die App beim Zustellzeitpunkt gerade sichtbar/im Vordergrund war.
    initForegroundPushListener();

    let unsubscribeProfile = null;
    let activeRunId = 0;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      const runId = ++activeRunId;
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      setUser(firebaseUser);

      if (!firebaseUser) {
        pendingDisplayNameRef.current = null;
        setProfile(null);
        setLoading(false);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);
      if (runId !== activeRunId) return;

      if (!snap.exists()) {
        const isInitialAdmin = INITIAL_ADMIN_EMAIL &&
          firebaseUser.email?.toLowerCase() === INITIAL_ADMIN_EMAIL &&
          firebaseUser.emailVerified;
        const resolvedName =
          firebaseUser.displayName || pendingDisplayNameRef.current || firebaseUser.email;
        pendingDisplayNameRef.current = null;

        try {
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: resolvedName,
            photoURL: firebaseUser.photoURL || null,
            status: isInitialAdmin ? 'approved' : 'pending',
            role: isInitialAdmin ? 'admin' : 'user',
            createdAt: serverTimestamp()
          });

          if (!isInitialAdmin) {
            notifyNewSignup(firebaseUser, resolvedName);
          }
        } catch (e) {
          // Wird z.B. von firestore.rules abgelehnt, falls VITE_INITIAL_ADMIN_EMAIL
          // nicht exakt mit der in firestore.rules hinterlegten Admin-Mail übereinstimmt.
          console.error('Konnte Nutzerprofil nicht anlegen:', e.message);
        }
      }

      if (runId !== activeRunId) return;

      // Live-Updates auf das eigene Profil (z.B. wenn Admin gerade freischaltet)
      unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
        setProfile(docSnap.exists() ? docSnap.data() : null);
        setLoading(false);
      });
    });

    return () => {
      activeRunId += 1;
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }
      unsubscribeAuth();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setAuthError(mapAuthError(e));
      throw e;
    }
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setAuthError(mapAuthError(e));
      throw e;
    }
  }, []);

  const signUpWithEmail = useCallback(async (email, password, displayName) => {
    setAuthError(null);
    pendingDisplayNameRef.current = displayName ? displayName.trim() : null;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
    } catch (e) {
      pendingDisplayNameRef.current = null;
      setAuthError(mapAuthError(e));
      throw e;
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (e) {
      setAuthError(mapAuthError(e));
      throw e;
    }
  }, []);

  const signOut = useCallback(() => firebaseSignOut(auth), []);

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    authError,
    isFirebaseConfigured,
    isAdmin: profile?.role === 'admin',
    isApproved: profile?.status === 'approved',
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    signOut
  }), [user, profile, loading, authError, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

function mapAuthError(e) {
  const code = e?.code || '';
  const map = {
    'auth/invalid-credential': 'E-Mail oder Passwort ist falsch.',
    'auth/wrong-password': 'E-Mail oder Passwort ist falsch.',
    'auth/user-not-found': 'Kein Account mit dieser E-Mail gefunden.',
    'auth/email-already-in-use': 'Für diese E-Mail existiert bereits ein Account.',
    'auth/weak-password': 'Das Passwort muss mindestens 6 Zeichen lang sein.',
    'auth/invalid-email': 'Ungültige E-Mail-Adresse.',
    'auth/popup-closed-by-user': 'Anmeldung wurde abgebrochen.'
  };
  return map[code] || 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
}

export const useAuth = () => useContext(AuthContext);
