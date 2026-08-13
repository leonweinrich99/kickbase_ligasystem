import { useEffect, useState } from 'react';

// Laedt alle Kickbase-Manager-Namen aus den aktuellen Ligadaten (data.json),
// damit Nutzer ihren echten Kickbase-Namen aus einer Liste auswaehlen statt
// frei eintippen - so gibt es keine Tippfehler/Schreibweisen-Mismatches
// gegenueber den Namen, die im Ligasystem/Pokal angezeigt werden.
// Eigene Datei (statt in KickbaseNameCard.jsx), da Vite/React-Fast-Refresh
// Dateien mit gemischten Component-/Hook-Exports nicht sauber unterstuetzt.
export const useKickbaseManagers = () => {
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
