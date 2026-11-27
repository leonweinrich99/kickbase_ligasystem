import { useRef, useState } from 'react';
import { Camera, CheckCircle2, AlertTriangle, ShieldCheck } from './ui/icons';
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
import { IconBackButton } from './ui/CloseButton';
import HexFrame from './ui/HexFrame';

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

const StatusBadge = ({ status }) => {
  if (!status) return null;
  const isError = status.startsWith('Fehler');
  return (
    <span
      className={`oct-pill oct-bd-none inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${
        isError ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
      }`}
    >
      {isError ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
      <span>{status}</span>
    </span>
  );
};

export default function Profile() {
  const { user, profile, isAdmin } = useAuth();
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
      setTimeout(() => setPhotoStatus(null), 2200);
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
      setTimeout(() => setNameStatus(null), 2200);
    } catch (error) {
      setNameStatus(`Fehler: ${error.message}`);
    } finally {
      setSavingName(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordStatus(null);
    if (newPassword.length < 6) {
      setPasswordStatus('Fehler: Mind. 6 Zeichen nötig.');
      return;
    }
    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setPasswordStatus('Geändert');
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
    <div className="min-h-screen bg-[#000000] pb-12">
      <div className="max-w-lg mx-auto px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between gap-2">
        <IconBackButton onClick={goBack} />
        {isAdmin && (
          <span className="oct-pill oct-bd-none inline-flex items-center gap-1 bg-purple-500/15 text-purple-300 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
            <ShieldCheck size={11} />
            Admin
          </span>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 sm:px-6 pt-2">
        <div className="mb-5">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff5c3e] mb-1">
            Account · Einstellungen
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white leading-none">
            Mein Profil
          </h1>
        </div>

        {/* Hero Profilbild-Karte im scharfen Hexagon-Look */}
        <div
          className="card-surface oct-box rounded-2xl p-5 mb-4 flex items-center gap-4"
          style={{
            backgroundImage: 'linear-gradient(145deg, rgba(28,30,38,0.9) 0%, rgba(16,17,22,0.96) 100%)',
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Profilbild ändern"
            className="relative shrink-0 group cursor-pointer disabled:opacity-60"
          >
            <HexFrame
              style={{ width: 84, height: 84 }}
              innerClassName="bg-[#1b1c22]"
              ringColor="#ff5c3e"
              ringWidth={1.5}
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={profile?.displayName || 'Avatar'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl font-black text-[#ff5c3e]">
                  {(profile?.displayName || user.email || '?').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="absolute inset-0 bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                <Camera size={18} strokeWidth={2.3} />
              </div>
            </HexFrame>
            <span className="hex-beacon absolute -bottom-0.5 -right-0.5 w-7 h-7 bg-[#ff5c3e] text-white flex items-center justify-center border-2 border-black shadow-lg">
              <Camera size={12} strokeWidth={2.5} />
            </span>
          </button>

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />

          <div className="min-w-0 flex-1">
            <div className="text-base font-extrabold text-white truncate">
              {profile?.displayName || 'Dein Account'}
            </div>
            <div className="text-xs text-[#8b92a5] truncate mt-0.5">{user.email}</div>
            <div className="flex items-center flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="oct-pill oct-bd-accent inline-flex items-center gap-1.5 bg-[#ff5c3e]/12 hover:bg-[#ff5c3e]/20 border border-[#ff5c3e]/35 text-[#ff846d] text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-colors cursor-pointer disabled:opacity-50"
              >
                <Camera size={11} />
                {uploading ? 'Lädt hoch…' : 'Foto ändern'}
              </button>
              <StatusBadge status={photoStatus} />
            </div>
          </div>
        </div>

        {/* Anzeigename */}
        <div className="card-surface oct-box rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#788092]">Anzeigename</div>
              <div className="text-xs text-[#8b92a5] mt-0.5">Für Begrüßung, Kommentare & App-Anzeige</div>
            </div>
            <StatusBadge status={nameStatus} />
          </div>
          <div className="flex gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Dein Name"
              className="oct-md flex-1 min-w-0 bg-[#0a0a0d] border border-[#2a2a30] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e] transition-colors"
            />
            <button
              type="button"
              onClick={handleNameSave}
              disabled={!nameChanged || savingName}
              className="oct-md oct-bd-accent shrink-0 text-[10px] font-black uppercase tracking-widest bg-[#ff5c3e] hover:bg-[#ff4b2b] text-white px-4 rounded-xl transition-all disabled:opacity-35 cursor-pointer"
            >
              {savingName ? '…' : 'Speichern'}
            </button>
          </div>
        </div>

        {/* Kickbase-Verknüpfung */}
        <div className="card-surface oct-box rounded-2xl mb-4 overflow-hidden">
          <KickbaseNameField />
        </div>

        {/* Passwort & Sicherheit */}
        <div className="card-surface oct-box rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#788092]">Passwort & Sicherheit</div>
              <div className="text-xs text-[#8b92a5] mt-0.5">Zugang zu deinem Konto verwalten</div>
            </div>
            <StatusBadge status={passwordStatus} />
          </div>

          {isPasswordProvider ? (
            <div className="space-y-2.5">
              <input
                type="password"
                placeholder="Aktuelles Passwort"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="oct-md w-full bg-[#0a0a0d] border border-[#2a2a30] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e] transition-colors"
              />
              <input
                type="password"
                placeholder="Neues Passwort (mind. 6 Zeichen)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="oct-md w-full bg-[#0a0a0d] border border-[#2a2a30] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e] transition-colors"
              />
              <button
                type="button"
                onClick={handlePasswordChange}
                disabled={changingPassword || !currentPassword || !newPassword}
                className="oct-md w-full text-[10px] font-black uppercase tracking-widest bg-[#1b1c22] border border-white/15 text-gray-100 px-4 py-3 rounded-xl hover:border-[#ff5c3e]/60 hover:text-white transition-all disabled:opacity-40 cursor-pointer"
              >
                {changingPassword ? 'Ändere…' : 'Passwort ändern'}
              </button>
            </div>
          ) : (
            <div className="oct-sm bg-[#0a0a0d] border border-white/[0.07] rounded-xl px-3.5 py-3 text-xs text-[#8b92a5] leading-relaxed">
              Du bist über <span className="text-white font-semibold">Google</span> angemeldet – dein Passwort wird direkt in deinem Google-Konto verwaltet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
