import { useEffect, useState } from 'react';

// Kickbase-Manager-Profilbilder (Name -> Bild-URL), siehe
// backend/scripts/fetch-manager-images.js. Ändert sich höchstens ein paar
// Mal am Tag (Cron-Lauf) - Modul-weiter Cache statt Re-Fetch pro Komponente.
let cache = null;
let pending = null;

const loadImages = () => {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('/history/manager-images.json')
      .then((res) => (res.ok ? res.json() : { images: {} }))
      .then((json) => {
        cache = json.images || {};
        return cache;
      })
      .catch(() => {
        cache = {};
        return cache;
      });
  }
  return pending;
};

// Liefert die Name -> Bild-URL-Zuordnung. Solange sie noch laedt, wird ein
// leeres Objekt zurueckgegeben (ManagerAvatar faellt dann auf den
// Buchstaben-Fallback zurueck, bis die Daten da sind).
export const useManagerImages = () => {
  const [images, setImages] = useState(cache || {});

  useEffect(() => {
    let cancelled = false;
    loadImages().then((imgs) => {
      if (!cancelled) setImages(imgs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return images;
};
