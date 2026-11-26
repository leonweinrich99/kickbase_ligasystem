import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import Toggle from './Toggle';
import {
  enablePushNotifications,
  isPushConfigured,
  isPushEnabledOnThisDevice,
  needsHomeScreenInstall,
  resolveNotificationPrefs,
} from './pushNotifications';

// Admin-Panel-Kachel fuer neue Registrierungen (api/notify-admins.js).
// WICHTIG: Schaltet nur noch `notificationPrefs.adminSignups` um statt das
// komplette Geraete-Token zu loeschen - so bleiben Pokal-, Live- und
// Kader-Benachrichtigungen auf diesem Geraet vollstaendig erhalten.
export default function PushNotificationCard() {
  const { user, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!isPushConfigured() || !user) return null;

  const deviceActive = isPushEnabledOnThisDevice(profile);
  const prefs = resolveNotificationPrefs(profile);
  const isChecked = deviceActive && prefs.adminSignups;

  const handleToggle = async (nextValue) => {
    setBusy(true);
    setError(null);
    try {
      if (nextValue) {
        if (!deviceActive) {
          await enablePushNotifications(user.uid);
        }
        await updateDoc(doc(db, 'users', user.uid), { 'notificationPrefs.adminSignups': true });
      } else {
        await updateDoc(doc(db, 'users', user.uid), { 'notificationPrefs.adminSignups': false });
      }
    } catch (pushError) {
      setError(pushError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3 mb-4">
      <div className="min-w-0">
        <div className="text-sm font-bold text-gray-100">Neue Registrierungen</div>
        <div className="text-[11px] text-[#8b92a5] mt-0.5">
          Admin-Push bei neuen Anmeldungen (beeinflusst deine übrigen Benachrichtigungen nicht).
        </div>
        {needsHomeScreenInstall() && (
          <div className="text-[11px] text-yellow-400 mt-1">
            iPhone: App zuerst über „Zum Home-Bildschirm“ installieren.
          </div>
        )}
        {error && <div className="text-[11px] text-red-400 mt-1">{error}</div>}
      </div>
      <Toggle checked={isChecked} onChange={handleToggle} disabled={busy} />
    </div>
  );
}
