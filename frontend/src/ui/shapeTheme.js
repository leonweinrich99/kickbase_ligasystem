/**
 * Zentrale Form-Steuerung für das Kickbase Ligasystem UI-Design:
 *  - 'octagon': Subtile abgeschrägte Oktagon-Boxen/Buttons/TabBar + scharfe Hexagone
 *               für runde Elemente (Kader-Spielfeld, Avatare, Startelf-Badges, Regeln)
 *  - 'rounded': Klassische abgerundete Ecken & Kreise (bisheriger Standard)
 *
 * ZURÜCKSWITCHEN:
 *  1. Entweder hier `DEFAULT_UI_SHAPE = 'rounded'` setzen,
 *  2. oder per Environment-Variable `VITE_UI_SHAPE=rounded` (ohne Code-Änderung in Vercel / .env).
 *
 * FEINTUNING (Kantengrößen, Rahmenfarben):
 *  Alle Oktagon-Werte liegen gebündelt am Anfang von `frontend/src/index.css`
 *  unter `html[data-ui-shape="octagon"]` (--oct-card, --oct-md, --oct-sm, --oct-pill, --oct-tabbar).
 */
const DEFAULT_UI_SHAPE = 'octagon'; // 'octagon' | 'rounded'

export const UI_SHAPE =
  import.meta.env?.VITE_UI_SHAPE === 'rounded'
    ? 'rounded'
    : import.meta.env?.VITE_UI_SHAPE === 'octagon'
      ? 'octagon'
      : DEFAULT_UI_SHAPE;

export const isOctagonUI = UI_SHAPE === 'octagon';

export function applyUiShape() {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-ui-shape', UI_SHAPE);
  }
}
