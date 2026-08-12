import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';

// Laedt alle Kickbase-Manager-Namen aus den aktuellen Ligadaten (data.json),
// damit Nutzer ihren echten Kickbase-Namen aus einer Liste auswaehlen statt
// frei eintippen - so gibt es keine Tippfehler/Schreibweisen-Mismatches
// gegenueber den Namen, die im Ligasystem/Pokal angezeigt werden.
const useKickbaseManagers = () => {
  const [managers, setManagers] = useState([]);

  useEffect(() => {
    fetch('/data.json')
      .then((res) => res.json())
      .then((json) => {
        const list = [];
        (json.leagues || []).forEach((league) => {
          (league.users || []).forEach((u) => {
            list.push({ id: u.id, name: u.name, league: league.name });
          });
        });
        list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
        setManagers(list);
      })
      .catch(() => setManagers([]));
  }, []);

  return managers;
};

export default function KickbaseNameCard() {
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
      setTimeout(() => setStatus(null), 2500);
    } catch (error) {
      setStatus(`Fehler: ${error.message}`);
    }
  };

  return (
    <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-4 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-bold text-gray-100">Kickbase-Name</div>
          <div className="text-xs text-[#8b92a5]">Ordne deinen echten Kickbase-Manager-Namen deinem Account zu.</div>
        </div>
        {status && <span className={`text-[10px] font-black uppercase tracking-widest shrink-0 mt-1 ${status.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{status}</span>}
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
