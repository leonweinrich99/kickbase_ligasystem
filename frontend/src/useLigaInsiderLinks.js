import { useEffect, useState } from 'react';

const LIGAINSIDER_BASE = 'https://www.ligainsider.de';

// Kickbase-playerId -> LigaInsider-Profilpfad (z.B. "/manuel-neuer_114/"),
// erzeugt von backend/scripts/fetch-ligainsider-links.js in
// frontend/public/history/ligainsider-links.json. Modul-weiter Cache wie bei
// useManagerImages.js und useManagerRatings.js.
let cache = null;
let pending = null;

const loadLigaInsiderLinks = () => {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('/history/ligainsider-links.json')
      .then((res) => (res.ok ? res.json() : { links: {} }))
      .then((json) => {
        cache = json?.links && typeof json.links === 'object' ? json.links : {};
        return cache;
      })
      .catch(() => {
        cache = {};
        return cache;
      });
  }
  return pending;
};

export const useLigaInsiderLinks = () => {
  const [links, setLinks] = useState(cache || {});

  useEffect(() => {
    let cancelled = false;
    loadLigaInsiderLinks().then((data) => {
      if (!cancelled) setLinks(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return links;
};

export const resolveLigaInsiderUrl = (links, playerId, fallbackName = '') => {
  const idKey = playerId != null ? String(playerId) : '';
  const relPath = idKey && links ? links[idKey] : null;
  if (relPath) {
    const url = relPath.startsWith('http') ? relPath : `${LIGAINSIDER_BASE}${relPath}`;
    return { url, isDirect: true };
  }
  const cleanName = String(fallbackName || '').trim();
  if (cleanName) {
    return {
      url: `${LIGAINSIDER_BASE}/suche/?q=${encodeURIComponent(cleanName)}`,
      isDirect: false,
    };
  }
  return { url: `${LIGAINSIDER_BASE}/`, isDirect: false };
};

export const useLigaInsiderUrl = (playerId, fallbackName = '') => {
  const links = useLigaInsiderLinks();
  return resolveLigaInsiderUrl(links, playerId, fallbackName);
};
