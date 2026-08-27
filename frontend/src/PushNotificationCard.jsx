import { useState } from 'react';
import { useAuth } from './AuthContext';
import Toggle from './Toggle';
import { enablePushNotifications, disablePushNotifications, isPushConfigured, needsHomeScreenInstall } from './pushNotifications';

// Nur noch im Admin Panel genutzt: Benachrichtigt Admins, wenn sich jemand
// neu registriert (siehe api/notify-admins.js). Die allgemeinen
// Pokal-/Kader-Erinnerungen fuer alle Nutzer haben eine eigene Seite
// (Reminders.jsx, verlinkt von Account.jsx aus). Als duenne Kachel mit
// Toggle statt Buttons, konsistent mit Reminders.jsx.
export default function PushNotificationCard() {
  const { user, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('fcmToken') : null;
  const isEnabledOnThisDevice = Boolean(storedToken && profile?.fcmTokens?.includes(storedToken));

  if (!isPushConfigured() || !user) return null;

  const handleToggle = async (nextValue) => {
    setBusy(true);
    setError(null);
    try {
      if (nextValue) {
        const token = await enablePushNotifications(user.uid);
        window.localStorage.setItem('fcmToken', token);
      } else {
        await disablePushNotifications(user.uid, storedToken);
        window.localStorage.removeItem('fcmToken');
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
        <div className="text-[11px] text-[#8b92a5] mt-0.5">Benachrichtigung auf diesem Gerät, sobald sich jemand registriert.</div>
        {needsHomeScreenInstall() && (
          <div className="text-[11px] text-yellow-400 mt-1">iPhone: App zuerst über „Zum Home-Bildschirm" installieren.</div>
        )}
        {error && <div className="text-[11px] text-red-400 mt-1">{error}</div>}
      </div>
      <Toggle checked={isEnabledOnThisDevice} onChange={handleToggle} disabled={busy} />
    </div>
  );
}
