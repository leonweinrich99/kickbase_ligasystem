import { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import Toggle from './Toggle';
import CloseButton from './ui/CloseButton';
import remindersLogo from './assets/reminders_logo.png';
import {
  CURRENT_PUSH_PROMPT_VERSION,
  NOTIFICATION_CATEGORIES,
  disablePushNotifications,
  enablePushNotifications,
  getStoredFcmToken,
  isPushConfigured,
  isPushEnabledOnThisDevice,
  needsHomeScreenInstall,
  resolveNotificationPrefs,
  sendSelfTestPush,
} from './pushNotifications';

const ReminderRow = ({ title, description, checked, onChange, disabled }) => (
  <div className="flex items-center justify-between gap-4 px-5 py-4">
    <div className="min-w-0">
      <div className="text-sm font-bold text-gray-100">{title}</div>
      <div className="text-xs text-[#8b92a5] mt-0.5 leading-relaxed">{description}</div>
    </div>
    <Toggle checked={checked} onChange={onChange} disabled={disabled} />
  </div>
);

export default function Reminders() {
  const { user, profile } = useAuth();
  const goBack = useBackNavigation('/account');
  const [status, setStatus] = useState(null);
  const [testSuccess, setTestSuccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const storedToken = getStoredFcmToken();
  const isEnabledOnThisDevice = isPushEnabledOnThisDevice(profile);
  const prefs = resolveNotificationPrefs(profile);
  const totalDevices = Array.isArray(profile?.fcmTokens) ? profile.fcmTokens.length : 0;

  if (!isPushConfigured() || !user) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
        <div className="text-center card-surface rounded-2xl p-8">
          <p className="text-sm text-[#8b92a5] mb-6">Benachrichtigungen sind aktuell nicht verfügbar.</p>
          <button onClick={goBack} className="text-[#ff5c3e] text-sm font-bold uppercase tracking-widest">
            Zurück
          </button>
        </div>
      </div>
    );
  }

  const handleEnable = async () => {
    setBusy(true);
    setStatus(null);
    setTestSuccess(null);
    try {
      await enablePushNotifications(user.uid);
      // Bestehende Einstellungen auf anderen Geraeten NICHT ueberschreiben - nur
      // fehlende Schluessel ueber resolveNotificationPrefs mit Defaults auffuellen.
      const mergedPrefs = resolveNotificationPrefs(profile);
      await updateDoc(doc(db, 'users', user.uid), {
        notificationPrefs: mergedPrefs,
        'reminderPrefs.pokal': mergedPrefs.pokal,
        'reminderPrefs.squad': mergedPrefs.squadAlert,
        pushPromptVersion: CURRENT_PUSH_PROMPT_VERSION,
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setStatus(null);
    setTestSuccess(null);
    try {
      await disablePushNotifications(user.uid, storedToken);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  };

  const setPref = async (key, value) => {
    setStatus(null);
    try {
      const updates = {
        [`notificationPrefs.${key}`]: value,
        pushPromptVersion: CURRENT_PUSH_PROMPT_VERSION,
      };
      // Legacy-Felder synchron halten, solange noch Alt-Checks existieren
      if (key === 'pokal') updates['reminderPrefs.pokal'] = value;
      if (key === 'squadAlert') updates['reminderPrefs.squad'] = value;
      await updateDoc(doc(db, 'users', user.uid), updates);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const handleTestPush = async () => {
    setTesting(true);
    setStatus(null);
    setTestSuccess(null);
    try {
      const res = await sendSelfTestPush(user);
      setTestSuccess(
        res.sent > 0
          ? `Test-Benachrichtigung an ${res.sent} ${res.sent === 1 ? 'Gerät' : 'Geräte'} gesendet.`
          : 'Kein aktives Gerät gefunden.'
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <img src={remindersLogo} alt="Benachrichtigungen Logo" className="w-11 h-11 object-contain shrink-0" />
            <div>
              <h1 className="text-xl sm:text-2xl font-black uppercase text-white leading-tight">
                Benachrichtigungen
              </h1>
              {totalDevices > 0 && (
                <div className="text-[11px] text-[#8b92a5] mt-0.5">
                  {isEnabledOnThisDevice
                    ? `Auf diesem Gerät aktiv (${totalDevices} ${totalDevices === 1 ? 'Gerät' : 'Geräte'} verbunden)`
                    : `Auf ${totalDevices} anderem ${totalDevices === 1 ? 'Gerät' : 'Geräten'} aktiv`}
                </div>
              )}
            </div>
          </div>
          <CloseButton onClick={goBack} />
        </div>

        {needsHomeScreenInstall() && (
          <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 mb-5 leading-relaxed">
            Auf dem iPhone funktionieren Push-Benachrichtigungen nur, wenn die App über Safari → Teilen → „Zum Home-Bildschirm“ installiert und von dort geöffnet wurde.
          </div>
        )}

        {status && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-5">
            {status}
          </div>
        )}

        {testSuccess && (
          <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{testSuccess}</span>
          </div>
        )}

        {!isEnabledOnThisDevice ? (
          <div className="card-surface rounded-2xl p-6 text-center mb-5">
            <p className="text-sm text-[#8b92a5] mb-5 leading-relaxed">
              Aktiviere Push-Benachrichtigungen auf diesem Gerät, um Live-Tore deiner Spieler, Kader-Alarme, neue Artikel, Rating-Upgrades und Pokal-Infos direkt aufs Display zu bekommen.
            </p>
            <button
              onClick={handleEnable}
              disabled={busy}
              className="w-full text-[11px] font-black uppercase tracking-widest bg-[#ff5c3e] text-white px-4 py-3.5 rounded-xl hover:bg-[#ff5c3e]/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Aktiviere...' : 'Benachrichtigungen aktivieren'}
            </button>
          </div>
        ) : (
          <>
            <div className="card-surface rounded-2xl divide-y divide-[#2a2a2a] overflow-hidden mb-4">
              {NOTIFICATION_CATEGORIES.map((cat) => (
                <ReminderRow
                  key={cat.key}
                  title={cat.title}
                  description={cat.description}
                  checked={prefs[cat.key]}
                  onChange={(value) => setPref(cat.key, value)}
                />
              ))}
            </div>

            {!profile?.kickbaseId && (
              <div className="text-xs text-yellow-400/90 bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-3 mb-4 leading-relaxed">
                Hinweis: Für persönliche Live-Events, Kader-Alarm und Rating-Upgrades muss dein Kickbase-Name unter Account → Profil verknüpft sein.
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleTestPush}
                disabled={testing}
                className="w-full flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest bg-[#ff5c3e]/15 text-[#ff5c3e] border border-[#ff5c3e]/35 px-4 py-3 rounded-xl hover:bg-[#ff5c3e]/25 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Send size={13} />
                {testing ? 'Sende Test...' : 'Test-Benachrichtigung senden'}
              </button>

              <button
                onClick={handleDisable}
                disabled={busy}
                className="w-full text-[10px] font-black uppercase tracking-widest bg-[#171717] border border-[#2e2e2e] text-[#8b92a5] px-4 py-3 rounded-xl hover:text-white hover:border-[#404040] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {busy ? '...' : 'Auf diesem Gerät deaktivieren'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
