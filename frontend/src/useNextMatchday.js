import { useEffect, useState } from 'react';

// Naechster (oder aktuell laufender) Bundesliga-Spieltag laut
// bundesliga-spielplan.json - eigene Datei aus demselben Grund wie
// useLeagueEntry.js (Fast-Refresh mag keine gemischten Component-/Hook-
// Exports). Genutzt auf der Account-Seite (Kopfzeile) und im Pokal-Tab.
export const useNextMatchday = () => {
  const [matchday, setMatchday] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/bundesliga-spielplan.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((plan) => {
        if (cancelled) return;
        const todayKey = new Date().toISOString().slice(0, 10);
        const next = plan.matchdays.find((md) => md.endDate >= todayKey) || plan.matchdays[plan.matchdays.length - 1];
        setMatchday(next || null);
      })
      .catch(() => {
        if (!cancelled) setMatchday(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return matchday;
};
