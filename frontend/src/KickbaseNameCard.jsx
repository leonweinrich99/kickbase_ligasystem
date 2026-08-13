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

// Modal zum Zuordnen des eigenen Kickbase-Namens - wird durch Klick auf die
// Profilkachel in Account.jsx geoeffnet, statt dauerhaft als eigene Karte auf
// der Account-Seite zu stehen (die meiste Zeit ist der Name ja schon gesetzt
// und muss nicht staendig sichtbar sein).
export default function KickbaseNameModal({ onClose }) {
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
    <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="max-w-sm w-full bg-[#171717] border border-[#2e2e2e] rounded-3xl p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8b92a5] hover:text-white transition-colors"
          aria-label="Schließen"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="flex items-start justify-between gap-3 mb-4 pr-8">
          <div>
            <h2 className="text-base font-black uppercase text-white">Kickbase-Name</h2>
            <p className="text-xs text-[#8b92a5] mt-1">Ordne deinen echten Kickbase-Manager-Namen deinem Account zu.</p>
          </div>
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

        {status && (
          <div className={`text-[10px] font-black uppercase tracking-widest mt-3 ${status.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{status}</div>
        )}

        {profile?.kickbaseId && (
          <Link
            to={`/user/${profile.kickbaseId}`}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 mt-4 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors"
          >
            Mein Kickbase-Profil ansehen
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </Link>
        )}
      </div>
    </div>
  );
}
