import { useEffect, useState } from 'react';

// Manager-Ratings fuer alle Teilnehmer (kickbaseId -> Rating-Objekt),
// generiert von backend/scripts/calculate-ratings.js in
// frontend/public/history/manager-ratings.json. Modul-weiter Cache wie bei
// useManagerImages.js, damit Dashboard, UserDetail und ManagerRatingPage
// dieselben Daten ohne doppelte Requests teilen.
let cache = null;
let pending = null;

const loadRatings = () => {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('/history/manager-ratings.json')
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        cache = json && typeof json === 'object' ? json : {};
        return cache;
      })
      .catch(() => {
        cache = {};
        return cache;
      });
  }
  return pending;
};

export const useManagerRatings = () => {
  const [ratings, setRatings] = useState(cache || null);

  useEffect(() => {
    let cancelled = false;
    loadRatings().then((data) => {
      if (!cancelled) setRatings(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ratings;
};
