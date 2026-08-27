import React, { useState } from 'react';
import { XCircle, Clock, HelpCircle } from 'lucide-react';
import { useAuth } from './AuthContext';
import Login from './Login';
import LoadingScreen from './LoadingScreen';
import { shouldShowSplash, markSplashShown } from './appLoadState';
import { useTour } from './Tour';

// Zeigt die grosse animierte Splash-Animation NUR, wenn sie in dieser Sitzung
// noch nicht lief (gemeinsamer Flag mit SeasonView/Pokal - siehe appLoadState.js).
// Sonst reicht eine stille, dunkle Flaeche, damit die Animation nicht ein
// zweites Mal direkt hintereinander abgespielt wird (einmal hier waehrend des
// Login-Checks, einmal in SeasonView/Pokal waehrend des Datenabrufs).
const Spinner = () => {
  const [show] = useState(() => {
    const should = shouldShowSplash();
    if (should) markSplashShown();
    return should;
  });
  return show ? <LoadingScreen /> : <div className="min-h-screen bg-[#000000]"></div>;
};

const PendingScreen = ({ status }) => {
  const { signOut, profile } = useAuth();
  const tour = useTour();
  const isRejected = status === 'rejected';

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center card-surface rounded-3xl p-8 shadow-2xl">
        <div className={`w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center ${isRejected ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
          {isRejected ? <XCircle size={26} strokeWidth={2.5} /> : <Clock size={26} strokeWidth={2.5} />}
        </div>
        <h1 className="text-lg font-black text-white uppercase mb-3">
          {isRejected ? 'Zugang abgelehnt' : 'Warte auf Freischaltung'}
        </h1>
        <p className="text-sm text-[#8b92a5] mb-1">
          {isRejected
            ? 'Dein Zugang wurde von einem Admin abgelehnt. Bei Fragen wende dich bitte direkt an den Admin.'
            : `Hallo ${profile?.displayName || ''}! Dein Account muss noch von einem Admin bestätigt werden, bevor du das Ligasystem sehen kannst.`}
        </p>

        {!isRejected && (
          <>
            <p className="text-xs text-[#626978] mt-4 mb-4">
              Nutze die Wartezeit doch, um dir schon mal anzuschauen, wie die App funktioniert:
            </p>
            <button
              onClick={tour.start}
              className="w-full flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-yellow-500 border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 rounded-xl hover:bg-yellow-500/20 transition-colors"
            >
              <HelpCircle size={14} strokeWidth={2.5} />
              App-Tutorial ansehen
            </button>
          </>
        )}

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
// Läuft gerade die interaktive App-Tour, wird die Sperre vorübergehend
// aufgehoben, damit die Tour echte Seiten zeigen kann (auch für Personen,
// die noch nicht eingeloggt oder noch nicht freigeschaltet sind).
const AuthGate = ({ children }) => {
  const { user, profile, loading, isFirebaseConfigured } = useAuth();
  const tour = useTour();

  if (tour?.isActive) return children;
  if (!isFirebaseConfigured) return children;
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (!profile || profile.status === 'pending') return <PendingScreen status="pending" />;
  if (profile.status === 'rejected') return <PendingScreen status="rejected" />;

  return children;
};

export default AuthGate;
