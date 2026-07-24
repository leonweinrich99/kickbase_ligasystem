import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured } from './firebase';

const AuthContext = createContext(null);

// Diese E-Mail-Adresse wird beim allerersten Login automatisch als Admin
// freigeschaltet, damit nicht ausgesperrt wird, wer das System einrichtet.
const INITIAL_ADMIN_EMAIL = (import.meta.env.VITE_INITIAL_ADMIN_EMAIL || '').toLowerCase();

// Push-Benachrichtigung an die Admins über ntfy.sh (kostenlos, kein Account
// nötig) - einfach die ntfy-App installieren oder https://ntfy.sh/<Topic> im
// Browser öffnen und dieses Topic abonnieren, siehe SETUP-NEUE-SAISON.md.
const NTFY_TOPIC = import.meta.env.VITE_NTFY_TOPIC || '';

const notifyNewSignup = (firebaseUser) => {
  if (!NTFY_TOPIC) return;
  const name = firebaseUser.displayName || firebaseUser.email || 'Unbekannt';
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

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        const isInitialAdmin = INITIAL_ADMIN_EMAIL &&
          firebaseUser.email?.toLowerCase() === INITIAL_ADMIN_EMAIL &&
          firebaseUser.emailVerified;

        try {
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email,
            photoURL: firebaseUser.photoURL || null,
            status: isInitialAdmin ? 'approved' : 'pending',
            role: isInitialAdmin ? 'admin' : 'user',
            createdAt: serverTimestamp()
          });

          if (!isInitialAdmin) {
            notifyNewSignup(firebaseUser);
          }
        } catch (e) {
          // Wird z.B. von firestore.rules abgelehnt, falls VITE_INITIAL_ADMIN_EMAIL
          // nicht exakt mit der in firestore.rules hinterlegten Admin-Mail übereinstimmt.
          console.error('Konnte Nutzerprofil nicht anlegen:', e.message);
        }
      }

      // Live-Updates auf das eigene Profil (z.B. wenn Admin gerade freischaltet)
      const unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
        setProfile(docSnap.exists() ? docSnap.data() : null);
        setLoading(false);
      });

      return () => unsubscribeProfile();
    });

    return () => unsubscribeAuth();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setAuthError(mapAuthError(e));
      throw e;
    }
  };

  const signInWithEmail = async (email, password) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setAuthError(mapAuthError(e));
      throw e;
    }
  };

  const signUpWithEmail = async (email, password, displayName) => {
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(cred.user, { displayName });
      }
    } catch (e) {
      setAuthError(mapAuthError(e));
      throw e;
    }
  };

  const signOut = () => firebaseSignOut(auth);

  const value = {
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
    signOut
  };

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
