import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import logo from './assets/logo.png';
import { useTour } from './Tour';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.85 1.5l2.6-2.5C16.85 3.4 14.6 2.4 12 2.4 6.9 2.4 2.7 6.6 2.7 11.7S6.9 21 12 21c6.9 0 9.3-4.8 9.3-7.3 0-.5-.05-.9-.12-1.3H12z"/>
  </svg>
);

const Login = () => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, authError, isFirebaseConfigured } = useAuth();
  const tour = useTour();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password, name);
        setSuccessMsg('Account erstellt! Bitte warte auf die Freischaltung durch einen Admin.');
      } else {
        await signInWithEmail(email, password);
      }
    } catch {
      // Fehler wird über authError aus dem Context angezeigt
    } finally {
      setSubmitting(false);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
        <div className="max-w-md text-center bg-[#1c1c1c] border border-[#2e2e2e] rounded-2xl p-8">
          <h1 className="text-lg font-black text-white mb-3 uppercase">Login noch nicht konfiguriert</h1>
          <p className="text-sm text-[#8b92a5]">
            Es fehlen die Firebase-Umgebungsvariablen (siehe <code className="text-[#ff5c3e]">frontend/.env.example</code>).
            Bitte Firebase-Projekt anlegen und Konfiguration eintragen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1c1c1c] border border-[#2e2e2e] rounded-3xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 mb-4">
            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div className="text-[10px] font-bold tracking-wider text-[#ff5c3e] mb-1">SAISON 26/27</div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white mb-4">Ligasystem Login</h1>
          <button
            onClick={tour.start}
            className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-yellow-500 border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 rounded-xl hover:bg-yellow-500/20 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            App-Tutorial ansehen
          </button>
        </div>

        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 bg-white text-[#111] font-bold py-3 rounded-xl mb-6 hover:bg-gray-100 transition-colors"
        >
          <GoogleIcon />
          Mit Google anmelden
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-[#2e2e2e]"></div>
          <span className="text-[10px] uppercase tracking-widest text-[#626978] font-bold">oder</span>
          <div className="flex-1 h-px bg-[#2e2e2e]"></div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-[#000000] border border-[#2e2e2e] rounded-xl px-4 py-3 text-sm text-gray-200 outline-none focus:border-[#ff5c3e]"
              required
            />
          )}
          <input
            type="email"
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[#000000] border border-[#2e2e2e] rounded-xl px-4 py-3 text-sm text-gray-200 outline-none focus:border-[#ff5c3e]"
            required
          />
          <input
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-[#000000] border border-[#2e2e2e] rounded-xl px-4 py-3 text-sm text-gray-200 outline-none focus:border-[#ff5c3e]"
            required
            minLength={6}
          />

          {(authError || localError) && (
            <div className="text-xs text-red-400 font-bold bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
              {authError || localError}
            </div>
          )}
          {successMsg && (
            <div className="text-xs text-green-400 font-bold bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="bg-[#ff5c3e] text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-[#ff5c3e]/90 transition-colors disabled:opacity-50 mt-2"
          >
            {submitting ? 'Bitte warten...' : mode === 'signup' ? 'Account erstellen' : 'Anmelden'}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setLocalError(null); setSuccessMsg(null); }}
            className="text-xs text-[#8b92a5] hover:text-white transition-colors"
          >
            {mode === 'signup' ? 'Schon einen Account? Jetzt anmelden' : 'Noch keinen Account? Jetzt registrieren'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
