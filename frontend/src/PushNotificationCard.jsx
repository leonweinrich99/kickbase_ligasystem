import { useState } from 'react';
import { useAuth } from './AuthContext';
import { enablePushNotifications, disablePushNotifications, isPushConfigured, needsHomeScreenInstall } from './pushNotifications';

// Nur noch im Admin Panel genutzt: Benachrichtigt Admins, wenn sich jemand
// neu registriert (siehe api/notify-admins.js). Die allgemeinen
// Pokal-/Kader-Erinnerungen fuer alle Nutzer haben eine eigene Seite
// (Reminders.jsx, verlinkt von Account.jsx aus).
export default function PushNotificationCard() {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('fcmToken') : null;
  const isEnabledOnThisDevice = Boolean(storedToken && profile?.fcmTokens?.includes(storedToken));

  if (!isPushConfigured() || !user) return null;

  const handleEnable = async () => {
    setStatus('loading');
    setError(null);
    try {
      const token = await enablePushNotifications(user.uid);
      window.localStorage.setItem('fcmToken', token);
      setStatus('idle');
    } catch (pushError) {
      setError(pushError.message);
      setStatus('error');
    }
  };

  const handleDisable = async () => {
    setStatus('loading');
    try {
      await disablePushNotifications(user.uid, storedToken);
      window.localStorage.removeItem('fcmToken');
      setStatus('idle');
    } catch (pushError) {
      setError(pushError.message);
      setStatus('error');
    }
  };

  return (
    <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <div className="font-bold text-gray-100">Push-Benachrichtigungen auf diesem Gerät</div>
        <div className="text-xs text-[#8b92a5]">Erhalte eine Mitteilung, sobald sich jemand Neues registriert.</div>
        {needsHomeScreenInstall() && (
          <div className="text-xs text-yellow-400 mt-1">Auf dem iPhone: App zuerst über „Zum Home-Bildschirm" installieren.</div>
        )}
        {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
      </div>
      {isEnabledOnThisDevice ? (
        <button
          onClick={handleDisable}
          disabled={status === 'loading'}
          className="text-[10px] font-black uppercase tracking-widest bg-green-500/10 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50 shrink-0"
        >
          {status === 'loading' ? '...' : '✓ Aktiviert (deaktivieren)'}
        </button>
      ) : (
        <button
          onClick={handleEnable}
          disabled={status === 'loading'}
          className="text-[10px] font-black uppercase tracking-widest bg-[#ff5c3e]/10 text-[#ff5c3e] border border-[#ff5c3e]/30 px-4 py-2 rounded-lg hover:bg-[#ff5c3e]/20 transition-colors disabled:opacity-50 shrink-0"
        >
          {status === 'loading' ? 'Aktiviere...' : 'Benachrichtigungen aktivieren'}
        </button>
      )}
    </div>
  );
}
