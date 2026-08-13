import { useEffect, useState } from 'react';

// Sucht den Eintrag eines Kickbase-Managers in den aktuellen Liga-Daten -
// eigene Datei (statt in AccountStats.jsx gemischt mit Komponenten), da
// Vite/React-Fast-Refresh Dateien mit gemischten Component-/Hook-Exports
// nicht sauber unterstuetzt.
export const useLeagueEntry = (kickbaseId) => {
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    if (!kickbaseId) return;

    let cancelled = false;
    fetch(`/data.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        for (const league of json.leagues || []) {
          const found = (league.users || []).find((u) => u.id === kickbaseId);
          if (found) {
            setEntry({ ...found, leagueName: league.name, leagueColor: league.color });
            return;
          }
        }
        setEntry(null);
      })
      .catch(() => {
        if (!cancelled) setEntry(null);
      });

    return () => {
      cancelled = true;
    };
  }, [kickbaseId]);

  return kickbaseId ? entry : null;
};
