import { useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useKickbaseManagers } from './useKickbaseManagers';

// Eingebettetes Formularfeld zum Zuordnen des eigenen Kickbase-Namens - Teil
// der "echten" Profilseite (Profile.jsx), nicht mehr als eigenstaendiges
// Modal/Karte auf der Account-Uebersicht.
export default function KickbaseNameField() {
  const { user, profile } = useAuth();
  const managers = useKickbaseManagers();
  const [status, setStatus] = useState(null);

  if (!user) return null;

  // Kein lokaler State fuer die Auswahl noetig: `profile` kommt bereits live
  // per onSnapshot aus Firestore (siehe AuthContext) und aktualisiert sich
  // nach dem Speichern automatisch selbst.
  const selectedId = profile?.kickbaseId || '';

  const groupedByLeague = managers.reduce((acc, m) => {
    (acc[m.league] = acc[m.league] || []).push(m);
    return acc;
  }, {});

  const handleChange = async (event) => {
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

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold text-gray-100 flex-1">Kickbase-Name</span>
        {status && <span className={`text-[10px] font-black uppercase tracking-widest shrink-0 ${status.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{status}</span>}
      </div>

      <select
        value={selectedId}
        onChange={handleChange}
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

      {profile?.kickbaseId && (
        <Link
          to={`/user/${profile.kickbaseId}`}
          className="inline-flex items-center gap-1.5 mt-3 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors"
        >
          Mein Kickbase-Profil ansehen
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </Link>
      )}
    </div>
  );
}
