import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CheckCircle2, AlertTriangle, Link2 } from './ui/icons';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useKickbaseManagers } from './useKickbaseManagers';

// Eingebettetes Formularfeld zum Zuordnen des eigenen Kickbase-Namens - Teil
// der Profilseite (Profile.jsx).
//
// WICHTIG: Der Kickbase-Name darf nur EINMAL frei gewählt werden. Ist er schon
// gesetzt, kann man ihn nicht mehr selbst ändern (siehe firestore.rules) -
// stattdessen kann man eine Änderung BEANTRAGEN, die ein Admin im Admin-Panel
// bestätigen oder ablehnen muss.
export default function KickbaseNameField() {
  const { user, profile } = useAuth();
  const managers = useKickbaseManagers();
  const [status, setStatus] = useState(null);
  const [requestMode, setRequestMode] = useState(false);
  const [requestedId, setRequestedId] = useState('');

  if (!user) return null;

  const isLinked = Boolean(profile?.kickbaseId);
  const pendingRequest = profile?.kickbaseChangeRequest;

  const groupedByLeague = managers.reduce((acc, m) => {
    (acc[m.league] = acc[m.league] || []).push(m);
    return acc;
  }, {});

  const handleInitialChange = async (event) => {
    const id = event.target.value;
    const manager = managers.find((m) => m.id === id);
    setStatus('Speichere…');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        kickbaseId: id || null,
        kickbaseName: manager?.name || null,
      });
      setStatus('Gespeichert');
      setTimeout(() => setStatus(null), 2200);
    } catch (error) {
      setStatus(`Fehler: ${error.message}`);
    }
  };

  const handleSubmitRequest = async () => {
    const manager = managers.find((m) => m.id === requestedId);
    if (!manager) return;
    setStatus('Sende…');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        kickbaseChangeRequest: {
          requestedId: manager.id,
          requestedName: manager.name,
          requestedAt: new Date().toISOString(),
        },
      });
      setStatus('Anfrage gesendet');
      setRequestMode(false);
      setTimeout(() => setStatus(null), 2500);
    } catch (error) {
      setStatus(`Fehler: ${error.message}`);
    }
  };

  const handleCancelRequest = async () => {
    setStatus('Storniere…');
    try {
      await updateDoc(doc(db, 'users', user.uid), { kickbaseChangeRequest: deleteField() });
      setStatus(null);
      setRequestMode(false);
    } catch (error) {
      setStatus(`Fehler: ${error.message}`);
    }
  };

  const isErrorStatus = status?.startsWith('Fehler');

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#788092]">
            Kickbase-Verknüpfung
          </div>
          <div className="text-xs text-[#8b92a5] mt-0.5">
            Verbindet dein Cockpit, Manager Rating & Pokal-Status
          </div>
        </div>
        {status && (
          <span
            className={`oct-pill oct-bd-none inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${
              isErrorStatus ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
            }`}
          >
            {isErrorStatus ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
            <span>{status}</span>
          </span>
        )}
      </div>

      {!isLinked ? (
        <select
          value=""
          onChange={handleInitialChange}
          className="oct-md w-full bg-[#0a0a0d] border border-[#2a2a30] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e] transition-colors"
        >
          <option value="">Manager aus Liga auswählen…</option>
          {Object.entries(groupedByLeague).map(([league, users]) => (
            <optgroup key={league} label={league}>
              {users.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : (
        <>
          <div className="oct-md w-full bg-[#0a0a0d] border border-emerald-500/25 rounded-xl px-3.5 py-3 text-sm text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Link2 size={14} className="text-emerald-400 shrink-0" />
              <span className="font-bold truncate">{profile.kickbaseName}</span>
            </div>
            <span className="oct-pill oct-bd-none bg-emerald-500/15 text-emerald-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0">
              Verknüpft
            </span>
          </div>

          {pendingRequest ? (
            <div className="oct-sm mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
              <p className="text-[11px] text-yellow-300 font-bold mb-2 leading-relaxed">
                Änderungsanfrage zu „{pendingRequest.requestedName}“ wartet auf Bestätigung durch einen Admin.
              </p>
              <button
                type="button"
                onClick={handleCancelRequest}
                className="text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                Anfrage zurückziehen
              </button>
            </div>
          ) : requestMode ? (
            <div className="mt-3 space-y-2.5">
              <select
                value={requestedId}
                onChange={(e) => setRequestedId(e.target.value)}
                className="oct-md w-full bg-[#0a0a0d] border border-[#2a2a30] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e]"
              >
                <option value="">Neuen Namen wählen…</option>
                {Object.entries(groupedByLeague).map(([league, users]) => (
                  <optgroup key={league} label={league}>
                    {users.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSubmitRequest}
                  disabled={!requestedId}
                  className="oct-md oct-bd-none flex-1 bg-[#ff5c3e] hover:bg-[#ff4b2b] text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl disabled:opacity-40 transition-all cursor-pointer"
                >
                  Anfrage senden
                </button>
                <button
                  type="button"
                  onClick={() => setRequestMode(false)}
                  className="oct-md px-4 py-2.5 bg-[#1b1c22] border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white rounded-xl transition-colors cursor-pointer"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-2 mt-3.5 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setRequestMode(true)}
                className="text-[10px] font-bold uppercase tracking-wider text-[#8b92a5] hover:text-white transition-colors cursor-pointer"
              >
                Änderung beantragen
              </button>
              {profile?.kickbaseId && (
                <Link
                  to={`/user/${profile.kickbaseId}`}
                  className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors"
                >
                  <span>Zum Manager-Profil</span>
                  <ChevronRight size={12} strokeWidth={3} />
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
