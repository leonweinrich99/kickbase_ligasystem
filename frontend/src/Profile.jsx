import { useRef, useState } from 'react';
import {
  updateProfile as updateAuthProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from './firebase';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import KickbaseNameField from './KickbaseNameCard';

const mapPasswordError = (error) => {
  const code = error?.code || '';
  const map = {
    'auth/wrong-password': 'Aktuelles Passwort ist falsch.',
    'auth/invalid-credential': 'Aktuelles Passwort ist falsch.',
    'auth/weak-password': 'Das neue Passwort muss mindestens 6 Zeichen lang sein.',
    'auth/requires-recent-login': 'Bitte melde dich erneut an und versuche es dann noch einmal.',
    'auth/too-many-requests': 'Zu viele Versuche. Bitte kurz warten.',
  };
  return map[code] || error.message;
};

const CameraIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
    <circle cx="12" cy="13" r="4"></circle>
  </svg>
);

export default function Profile() {
  const { user, profile } = useAuth();
  const goBack = useBackNavigation('/account');
  const fileInputRef = useRef(null);

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [nameStatus, setNameStatus] = useState(null);
  const [savingName, setSavingName] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [photoStatus, setPhotoStatus] = useState(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState(null);
  const [changingPassword, setChangingPassword] = useState(false);

  if (!user) return null;

  const isPasswordProvider = user.providerData?.some((p) => p.providerId === 'password');
  const nameChanged = displayName.trim() && displayName.trim() !== (profile?.displayName || '');

  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !storage) return;

    if (!file.type.startsWith('image/')) {
      setPhotoStatus('Fehler: Bitte ein Bild auswählen.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoStatus('Fehler: Bild darf max. 5 MB groß sein.');
      return;
    }

    setUploading(true);
    setPhotoStatus(null);
    try {
      const avatarRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(avatarRef, file);
      const url = await getDownloadURL(avatarRef);
      await updateAuthProfile(auth.currentUser, { photoURL: url });
      await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
      setPhotoStatus('Gespeichert');
      setTimeout(() => setPhotoStatus(null), 2000);
    } catch (error) {
      setPhotoStatus(`Fehler: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleNameSave = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    setSavingName(true);
    setNameStatus(null);
    try {
      await updateAuthProfile(auth.currentUser, { displayName: trimmed });
      await updateDoc(doc(db, 'users', user.uid), { displayName: trimmed });
      setNameStatus('Gespeichert');
      setTimeout(() => setNameStatus(null), 2000);
    } catch (error) {
      setNameStatus(`Fehler: ${error.message}`);
    } finally {
      setSavingName(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordStatus(null);
    if (newPassword.length < 6) {
      setPasswordStatus('Fehler: Neues Passwort muss mindestens 6 Zeichen haben.');
      return;
    }
    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setPasswordStatus('Passwort geändert');
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPasswordStatus(null), 3000);
    } catch (error) {
      setPasswordStatus(`Fehler: ${mapPasswordError(error)}`);
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl sm:text-2xl font-black uppercase text-white">Profil</h1>
          <button
            onClick={goBack}
            aria-label="Schließen"
            className="w-10 h-10 shrink-0 flex items-center justify-center bg-[#171717] border border-[#2e2e2e] rounded-xl text-[#8b92a5] hover:text-white hover:border-[#404040] transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Profilbild */}
        <div className="flex flex-col items-center mb-6">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative w-24 h-24 rounded-full bg-[#1f1f1f] border border-[#2e2e2e] flex items-center justify-center overflow-hidden group disabled:opacity-60"
          >
            {user.photoURL ? (
              <img src={user.photoURL} alt={profile?.displayName || 'Avatar'} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-black text-[#ff5c3e]">{(profile?.displayName || user.email || '?').charAt(0).toUpperCase()}</span>
            )}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
              {uploading ? <span className="text-[10px] font-bold uppercase">...</span> : CameraIcon}
            </div>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors mt-3"
          >
            {uploading ? 'Lädt hoch...' : 'Profilbild ändern'}
          </button>
          {photoStatus && (
            <span className={`text-[10px] font-black uppercase tracking-widest mt-1 ${photoStatus.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{photoStatus}</span>
          )}
        </div>

        {/* Alle Einstellungen in EINER Karte mit Trennlinien statt drei
            separaten Kacheln - weniger visuelle Wiederholung. */}
        <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl divide-y divide-[#2a2a2a] overflow-hidden mb-4">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-gray-100 flex-1">Name</span>
              {nameStatus && (
                <span className={`text-[10px] font-black uppercase tracking-widest shrink-0 ${nameStatus.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{nameStatus}</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="flex-1 bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e]"
              />
              <button
                onClick={handleNameSave}
                disabled={!nameChanged || savingName}
                className="text-[10px] font-black uppercase tracking-widest bg-[#ff5c3e]/10 text-[#ff5c3e] border border-[#ff5c3e]/30 px-4 rounded-xl hover:bg-[#ff5c3e]/20 transition-colors disabled:opacity-40"
              >
                {savingName ? '...' : 'Speichern'}
              </button>
            </div>
          </div>

          <KickbaseNameField />

          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-gray-100 flex-1">Passwort</span>
              {passwordStatus && (
                <span className={`text-[10px] font-black uppercase tracking-widest shrink-0 text-right ${passwordStatus.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{passwordStatus}</span>
              )}
            </div>
            {isPasswordProvider ? (
              <div className="space-y-2.5">
                <input
                  type="password"
                  placeholder="Aktuelles Passwort"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e]"
                />
                <input
                  type="password"
                  placeholder="Neues Passwort (mind. 6 Zeichen)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e]"
                />
                <button
                  onClick={handlePasswordChange}
                  disabled={changingPassword || !currentPassword || !newPassword}
                  className="w-full text-[10px] font-black uppercase tracking-widest bg-[#171717] border border-[#2e2e2e] text-gray-200 px-4 py-3 rounded-xl hover:border-[#404040] transition-colors disabled:opacity-40"
                >
                  {changingPassword ? 'Ändere...' : 'Passwort ändern'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#8b92a5]">Du bist über Google angemeldet - dein Passwort wird dort verwaltet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
