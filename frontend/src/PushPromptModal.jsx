import React, { useEffect, useState } from 'react';
import { Share, PlusSquare, X } from './ui/icons';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useTour } from './Tour';
import Toggle from './Toggle';
import remindersLogo from './assets/reminders_logo.png';
import {
  CURRENT_PUSH_PROMPT_VERSION,
  NOTIFICATION_CATEGORIES,
  enablePushNotifications,
  isPushConfigured,
  isPushEnabledOnThisDevice,
  needsHomeScreenInstall,
  resolveNotificationPrefs,
} from './pushNotifications';

const SNOOZE_KEY = 'kickbase_push_prompt_snoozed_v2';

/**
 * Einmalige, geraetebewusste Abfrage fuer alle eingeloggten & freigeschalteten
 * Manager, sobald `pushPromptVersion < CURRENT_PUSH_PROMPT_VERSION`.
 *
 * - iPhone im Safari-Tab: 2-Schritt-Installationshinweis (iOS erlaubt Web-Push
 *   nur in der Homescreen-PWA).
 * - Push noch AUS (PWA / Android / Desktop): Kategorie-Auswahl + 1-Tap-Aktivieren
 *   (direkter User-Tap -> iOS erlaubt Notification.requestPermission()).
 * - Push bereits AN (Bestandsnutzer): Neue Kategorien auswaehlen & speichern ohne
 *   erneuten OS-Permission-Dialog.
 */
export default function PushPromptModal() {
  const { user, profile, isApproved } = useAuth();
  const tour = useTour();

  const [ready, setReady] = useState(false);
  const [dismissedLocally, setDismissedLocally] = useState(() => {
    try {
      return sessionStorage.getItem(SNOOZE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [draftPrefs, setDraftPrefs] = useState(() => resolveNotificationPrefs(null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const shouldPrompt =
    Boolean(user && profile && isApproved && isPushConfigured()) &&
    !tour?.isActive &&
    !dismissedLocally &&
    (profile.pushPromptVersion || 0) < CURRENT_PUSH_PROMPT_VERSION;

  useEffect(() => {
    if (!shouldPrompt) return undefined;
    // Sanfter Delay, damit die App erst sichtbar geladen ist und kein abruptes
    // Popup direkt beim Start aufploppt.
    const timer = window.setTimeout(() => {
      setDraftPrefs(resolveNotificationPrefs(profile));
      setReady(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [shouldPrompt, profile]);

  if (!shouldPrompt || !ready) return null;

  const isIosBrowser = needsHomeScreenInstall();
  const alreadyEnabled = isPushEnabledOnThisDevice(profile);

  const handleSnooze = () => {
    try {
      sessionStorage.setItem(SNOOZE_KEY, '1');
    } catch {
      // ignore storage errors
    }
    setDismissedLocally(true);
  };

  const handleDeclinePermanently = async () => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        pushPromptVersion: CURRENT_PUSH_PROMPT_VERSION,
      });
      setDismissedLocally(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!alreadyEnabled) {
        await enablePushNotifications(user.uid);
      }
      await updateDoc(doc(db, 'users', user.uid), {
        notificationPrefs: {
          ...resolveNotificationPrefs(profile),
          ...draftPrefs,
        },
        'reminderPrefs.pokal': draftPrefs.pokal,
        'reminderPrefs.squad': draftPrefs.squadAlert,
        pushPromptVersion: CURRENT_PUSH_PROMPT_VERSION,
      });
      setDismissedLocally(true);
    } catch (e) {
      setError(e.message || 'Benachrichtigungen konnten nicht aktiviert werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 flex items-end sm:items-center justify-center p-3 sm:p-4"
      onClick={handleSnooze}
      role="dialog"
      aria-modal="true"
      aria-label="Benachrichtigungen einrichten"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#141414] border border-[#2e2e2e] shadow-2xl overflow-hidden max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3.5 border-b border-[#242424] flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={remindersLogo} alt="" className="w-11 h-11 object-contain shrink-0" />
            <div>
              <h2 className="text-base font-black uppercase tracking-tight text-white leading-tight">
                {alreadyEnabled
                  ? 'Neue Benachrichtigungen'
                  : isIosBrowser
                    ? 'App installieren für Push'
                    : 'Nichts mehr verpassen'}
              </h2>
              <p className="text-[11px] text-[#8b92a5] mt-0.5">
                {alreadyEnabled
                  ? 'Wähle aus, wofür du künftig Pushes erhalten willst.'
                  : isIosBrowser
                    ? 'Auf dem iPhone klappt Push über den Home-Bildschirm.'
                    : 'Live-Tore, Kader-Alarm, Artikel & Rating direkt aufs Handy.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSnooze}
            aria-label="Schließen"
            className="w-8 h-8 rounded-lg bg-[#1d1d1d] border border-[#2e2e2e] flex items-center justify-center text-[#8b92a5] hover:text-white shrink-0 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto">
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3.5 py-2.5 mb-3">
              {error}
            </div>
          )}

          {isIosBrowser ? (
            <div className="space-y-3 text-xs text-[#c7cdd9]">
              <p className="text-[#8b92a5] leading-relaxed">
                Apple erlaubt Push-Benachrichtigungen für Web-Apps nur, wenn die Seite einmal als App auf deinem Home-Bildschirm liegt:
              </p>
              <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-3.5 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-[#ff5c3e]/15 text-[#ff5c3e] flex items-center justify-center shrink-0">
                    <Share size={13} />
                  </span>
                  <span>
                    <strong className="text-white">1.</strong> Unten in Safari auf <strong className="text-white">Teilen</strong> tippen
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-[#ff5c3e]/15 text-[#ff5c3e] flex items-center justify-center shrink-0">
                    <PlusSquare size={13} />
                  </span>
                  <span>
                    <strong className="text-white">2.</strong> <strong className="text-white">„Zum Home-Bildschirm“</strong> wählen & App von dort öffnen
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-[#626978]">
                Danach erscheint diese Abfrage dort automatisch mit dem Aktivieren-Button.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-[#1a1a1a] border border-[#262626] divide-y divide-[#262626] overflow-hidden">
              {NOTIFICATION_CATEGORIES.map((cat) => (
                <div key={cat.key} className="px-3.5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-100">{cat.title}</div>
                    <div className="text-[11px] text-[#8b92a5] mt-0.5 leading-snug">{cat.description}</div>
                  </div>
                  <Toggle
                    checked={Boolean(draftPrefs[cat.key])}
                    onChange={(val) => setDraftPrefs((prev) => ({ ...prev, [cat.key]: val }))}
                    disabled={busy}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 pt-3 pb-4 border-t border-[#242424] flex flex-col gap-2">
          {!isIosBrowser && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="w-full py-3 rounded-xl bg-[#ff5c3e] text-white text-xs font-black uppercase tracking-widest hover:bg-[#ff5c3e]/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busy
                ? 'Speichere...'
                : alreadyEnabled
                  ? 'Auswahl speichern'
                  : 'Benachrichtigungen aktivieren'}
            </button>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleSnooze}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-[11px] font-bold text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              Später
            </button>
            <button
              type="button"
              onClick={handleDeclinePermanently}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-bold text-[#626978] hover:text-[#8b92a5] transition-colors cursor-pointer"
            >
              Nicht mehr fragen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
