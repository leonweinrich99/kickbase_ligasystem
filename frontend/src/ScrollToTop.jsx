import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Setzt die Scroll-Position bei jedem Seiten-/Tab-Wechsel zurück auf oben.
// React Router macht das von sich aus NICHT automatisch - ohne das würde man
// z.B. beim Wechsel von Liga zu Pokal an der Stelle landen, an der man auf
// der vorherigen Seite gescrollt war.
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
