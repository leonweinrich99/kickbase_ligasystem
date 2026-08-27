import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useKickbaseManagers } from './useKickbaseManagers';

// Eingebettetes Formularfeld zum Zuordnen des eigenen Kickbase-Namens - Teil
// der "echten" Profilseite (Profile.jsx), nicht mehr als eigenstaendiges
// Modal/Karte auf der Account-Uebersicht.
//
// WICHTIG: Der Kickbase-Name darf nur EINMAL frei gewählt werden. Ist er schon
// gesetzt, kann man ihn nicht mehr selbst ändern (siehe firestore.rules) -
// stattdessen kann man eine Änderung BEANTRAGEN, die ein Admin im Admin-Panel
// bestätigen oder ablehnen muss (z.B. falls man sich verklickt hat).
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

  // Erstauswahl: noch nie zugeordnet -> frei wählbar, direkt gespeichert.
  const handleInitialChange = async (event) => {
    const id = event.target.value;
    const manager = managers.find((m) => m.id === id);
    setStatus('Speichere...');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        kickbaseId: id || null,
        kickbaseName: manager?.name || null,
      });
      setStatus('Gespeichert');
      setTimeout(() => setStatus(null), 2000);
    } catch (error) {
      setStatus(`Fehler: ${error.message}`);
    }
  };

  // Bereits zugeordnet: nur noch eine Änderungsanfrage stellen, kein direktes Setzen mehr.
  const handleSubmitRequest = async () => {
    const manager = managers.find((m) => m.id === requestedId);
    if (!manager) return;
    setStatus('Sende Anfrage...');
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
    setStatus('Storniere...');
    try {
      await updateDoc(doc(db, 'users', user.uid), { kickbaseChangeRequest: deleteField() });
      setStatus(null);
      setRequestMode(false);
    } catch (error) {
      setStatus(`Fehler: ${error.message}`);
    }
  };

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold text-gray-100 flex-1">Kickbase-Name</span>
        {status && <span className={`text-[10px] font-black uppercase tracking-widest shrink-0 ${status.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{status}</span>}
      </div>

      {!isLinked ? (
        // Erstauswahl: frei wählbar
        <select
          value=""
          onChange={handleInitialChange}
          className="w-full bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e]"
        >
          <option value="">Nicht zugeordnet</option>
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
          {/* Schon zugeordnet: nur noch Anzeige, kein direktes Umschalten mehr */}
          <div className="w-full bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2.5 text-sm text-white flex items-center justify-between">
            <span className="font-bold">{profile.kickbaseName}</span>
            <span className="text-[9px] text-gray-500 uppercase tracking-widest">Verknüpft</span>
          </div>

          {pendingRequest ? (
            <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
              <p className="text-[11px] text-yellow-400 font-bold mb-2">
                Änderungsanfrage zu "{pendingRequest.requestedName}" wartet auf Bestätigung durch einen Admin.
              </p>
              <button
                onClick={handleCancelRequest}
                className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors"
              >
                Anfrage zurückziehen
              </button>
            </div>
          ) : requestMode ? (
            <div className="mt-3 space-y-2">
              <select
                value={requestedId}
                onChange={(e) => setRequestedId(e.target.value)}
                className="w-full bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e]"
              >
                <option value="">Neuen Namen wählen...</option>
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
                  onClick={handleSubmitRequest}
                  disabled={!requestedId}
                  className="flex-1 bg-[#ff5c3e] text-white text-xs font-bold uppercase tracking-widest py-2.5 rounded-xl disabled:opacity-40 transition-opacity"
                >
                  Anfrage senden
                </button>
                <button
                  onClick={() => setRequestMode(false)}
                  className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-white transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setRequestMode(true)}
              className="mt-3 text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors"
            >
              Falsch verknüpft? Änderung beantragen
            </button>
          )}
        </>
      )}

      {profile?.kickbaseId && (
        <Link
          to={`/user/${profile.kickbaseId}`}
          className="inline-flex items-center gap-1.5 mt-3 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors"
        >
          Mein Kickbase-Profil ansehen
          <ChevronRight size={12} strokeWidth={3} />
        </Link>
      )}
    </div>
  );
}
