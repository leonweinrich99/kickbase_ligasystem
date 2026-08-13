import { useNavigate } from 'react-router-dom';

// Einheitliches "Zurück"-Verhalten für die ganze App: navigiert per
// Browser-/Router-Historie dahin zurück, wo man herkam, statt fix zu einer
// Startseite zu springen. `fallbackPath` greift nur, wenn keine Historie
// vorhanden ist (z.B. Seite wurde direkt per URL/Deep-Link geöffnet - das
// ist besonders in der PWA relevant, da man dort nicht immer über einen
// Browser-Verlauf "von außen" kommt).
export const useBackNavigation = (fallbackPath = '/') => {
  const navigate = useNavigate();
  return () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallbackPath);
  };
};
