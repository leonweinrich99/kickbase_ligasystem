import { useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import {
  enablePushNotifications,
  disablePushNotifications,
  isPushConfigured,
  needsHomeScreenInstall,
} from './pushNotifications';

const BellIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
  </svg>
);

const Toggle = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${checked ? 'bg-[#ff5c3e]' : 'bg-[#2e2e2e]'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}></span>
  </button>
);

const ReminderRow = ({ title, description, checked, onChange, disabled }) => (
  <div className="flex items-center justify-between gap-4 bg-[#171717] border border-[#2e2e2e] rounded-2xl px-5 py-4">
    <div className="min-w-0">
      <div className="text-sm font-bold text-gray-100">{title}</div>
      <div className="text-xs text-[#8b92a5] mt-0.5">{description}</div>
    </div>
    <Toggle checked={checked} onChange={onChange} disabled={disabled} />
  </div>
);

export default function Reminders() {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('fcmToken') : null;
  const isEnabledOnThisDevice = Boolean(storedToken && profile?.fcmTokens?.includes(storedToken));

  // Pokal-Erinnerung gab es zuerst und war implizit "an", sobald Push
  // aktiviert wurde - fehlt das Feld (Bestandsnutzer), zaehlt das als an.
  // Die Kader-Erinnerung ist neu und daher standardmaessig AUS (opt-in).
  const pokalEnabled = profile?.reminderPrefs?.pokal !== false;
  const squadEnabled = profile?.reminderPrefs?.squad === true;

  if (!isPushConfigured() || !user) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
        <div className="text-center bg-[#171717] border border-[#2e2e2e] rounded-2xl p-8">
          <p className="text-sm text-[#8b92a5] mb-6">Erinnerungen sind aktuell nicht verfügbar.</p>
          <Link to="/account" className="text-[#ff5c3e] text-sm font-bold uppercase tracking-widest">Zurück</Link>
        </div>
      </div>
    );
  }

  const handleEnable = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const token = await enablePushNotifications(user.uid);
      window.localStorage.setItem('fcmToken', token);
      // Beim erstmaligen Aktivieren beide Erinnerungen an, damit man nicht
      // extra nochmal umschalten muss.
      await updateDoc(doc(db, 'users', user.uid), { reminderPrefs: { pokal: true, squad: true } });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await disablePushNotifications(user.uid, storedToken);
      window.localStorage.removeItem('fcmToken');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  };

  const setPref = async (key, value) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), { [`reminderPrefs.${key}`]: value });
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#ff5c3e]/10 text-[#ff5c3e]">
              {BellIcon}
            </div>
            <h1 className="text-xl sm:text-2xl font-black uppercase text-white">Erinnerungen</h1>
          </div>
          <Link
            to="/account"
            aria-label="Schließen"
            className="w-10 h-10 shrink-0 flex items-center justify-center bg-[#171717] border border-[#2e2e2e] rounded-xl text-[#8b92a5] hover:text-white hover:border-[#404040] transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </Link>
        </div>

        {needsHomeScreenInstall() && (
          <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 mb-6">
            Auf dem iPhone funktioniert das nur, wenn die App über „Zum Home-Bildschirm" installiert wurde.
          </div>
        )}
        {status && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6">{status}</div>
        )}

        {!isEnabledOnThisDevice ? (
          <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-6 text-center">
            <p className="text-sm text-[#8b92a5] mb-5">Aktiviere Benachrichtigungen auf diesem Gerät, um Erinnerungen zu erhalten.</p>
            <button
              onClick={handleEnable}
              disabled={busy}
              className="w-full text-[10px] font-black uppercase tracking-widest bg-[#ff5c3e]/10 text-[#ff5c3e] border border-[#ff5c3e]/30 px-4 py-3 rounded-xl hover:bg-[#ff5c3e]/20 transition-colors disabled:opacity-50"
            >
              {busy ? 'Aktiviere...' : 'Erinnerungen aktivieren'}
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 mb-6">
              <ReminderRow
                title="Pokal-Erinnerung"
                description="Mittwochs vor einem Pokal-Spieltag"
                checked={pokalEnabled}
                onChange={(value) => setPref('pokal', value)}
              />
              <ReminderRow
                title="Kader-Erinnerung"
                description="Freitagmorgens, um deinen Liga-Kader für den Spieltag aufzustellen"
                checked={squadEnabled}
                onChange={(value) => setPref('squad', value)}
              />
            </div>

            <button
              onClick={handleDisable}
              disabled={busy}
              className="w-full text-[10px] font-black uppercase tracking-widest bg-[#171717] border border-[#2e2e2e] text-[#8b92a5] px-4 py-3 rounded-xl hover:text-white hover:border-[#404040] transition-colors disabled:opacity-50"
            >
              {busy ? '...' : 'Benachrichtigungen auf diesem Gerät deaktivieren'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
