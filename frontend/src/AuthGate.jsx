import React from 'react';
import { useAuth } from './AuthContext';
import Login from './Login';

const Spinner = () => (
  <div className="min-h-screen bg-[#0f1115] flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-[#ff5c3e] border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const PendingScreen = ({ status }) => {
  const { signOut, profile } = useAuth();
  const isRejected = status === 'rejected';

  return (
    <div className="min-h-screen bg-[#0f1115] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center bg-[#1a1d24] border border-[#2a2e37] rounded-3xl p-8 shadow-2xl">
        <div className={`w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center ${isRejected ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
          {isRejected ? '✕' : '⏳'}
        </div>
        <h1 className="text-lg font-black text-white uppercase mb-3">
          {isRejected ? 'Zugang abgelehnt' : 'Warte auf Freischaltung'}
        </h1>
        <p className="text-sm text-[#8b92a5] mb-1">
          {isRejected
            ? 'Dein Zugang wurde von einem Admin abgelehnt. Bei Fragen wende dich bitte direkt an den Admin.'
            : `Hallo ${profile?.displayName || ''}! Dein Account muss noch von einem Admin bestätigt werden, bevor du das Ligasystem sehen kannst.`}
        </p>
        <button
          onClick={signOut}
          className="mt-6 text-xs font-bold uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors"
        >
          Abmelden
        </button>
      </div>
    </div>
  );
};

// AuthGate schützt die komplette App hinter Login + Admin-Freigabe.
// Wenn Firebase (noch) nicht konfiguriert ist, wird die App ohne Login angezeigt,
// damit lokale Entwicklung ohne Firebase-Setup weiterhin funktioniert.
const AuthGate = ({ children }) => {
  const { user, profile, loading, isFirebaseConfigured } = useAuth();

  if (!isFirebaseConfigured) return children;
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (!profile || profile.status === 'pending') return <PendingScreen status="pending" />;
  if (profile.status === 'rejected') return <PendingScreen status="rejected" />;

  return children;
};

export default AuthGate;
