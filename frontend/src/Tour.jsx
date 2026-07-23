import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Jeder Schritt zeigt auf ein echtes Element in der App (per data-tour="...").
// selector: null => zentrierte Karte ohne Spotlight (Intro/Outro).
export const TOUR_STEPS = [
  {
    path: '/',
    selector: null,
    title: 'Willkommen! 👋',
    text: 'Diese kurze Tour zeigt dir direkt in der echten App, wo du was findest. Tippe auf die markierten Bereiche, um weiterzugehen.'
  },
  {
    path: '/',
    selector: '[data-tour="matchday-switcher"]',
    title: 'Spieltag wechseln',
    text: 'Mit den Pfeilen wechselst du zwischen der Gesamtwertung und einzelnen Spieltagen. Tippe hier, um weiterzumachen.'
  },
  {
    path: '/',
    selector: '[data-tour="user-row"]',
    title: 'Spielerdetails',
    text: 'Tippe auf einen Namen für Punkteverlauf & Formkurve - von dort kannst du auch zwei Spieler vergleichen.'
  },
  {
    path: '/',
    selector: '[data-tour="optimal-team-button"]',
    title: 'Die optimale Elf',
    text: 'Zeigt dir die stärkste mögliche Elf des Spieltags über alle Spieler hinweg.'
  },
  {
    path: '/',
    selector: '[data-tour="tab-pokal"]',
    title: 'Zum Pokal',
    text: 'Tippe auf "Pokal" in der Tabbar, um weiterzugehen.'
  },
  {
    path: '/pokal',
    selector: '[data-tour="pokal-bracket"]',
    title: 'Pokal-Baum',
    text: 'K.-o.-System vom Sechzehntelfinale bis zum Finale, ausgelost aus der Qualifikationsrunde.'
  },
  {
    path: '/pokal',
    selector: '[data-tour="tab-account"]',
    title: 'Zum Account',
    text: 'Tippe auf "Account" in der Tabbar, um weiterzugehen.'
  },
  {
    path: '/account',
    selector: '[data-tour="account-menu"]',
    title: 'Account-Menü',
    text: 'Regelkatalog, Pokal-Regeln, das Quali-Archiv und (für Admins) das Admin Panel findest du hier.'
  },
  {
    path: '/account',
    selector: null,
    title: 'Fertig! 🎉',
    text: 'Das war\'s schon. Viel Erfolg in deiner Liga!'
  }
];

const TourContext = createContext(null);

export const TourProvider = ({ children }) => {
  const [stepIndex, setStepIndex] = useState(-1);
  const isActive = stepIndex >= 0;
  const navigate = useNavigate();
  const location = useLocation();

  const start = useCallback(() => setStepIndex(0), []);
  const stop = useCallback(() => setStepIndex(-1), []);

  const step = isActive ? TOUR_STEPS[stepIndex] : null;

  // Bei Schrittwechsel ggf. zur passenden Seite navigieren
  useEffect(() => {
    if (!step) return;
    if (location.pathname !== step.path) {
      navigate(step.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= TOUR_STEPS.length) return -1;
      return i + 1;
    });
  }, []);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const value = { isActive, stepIndex, step, start, stop, next, prev, totalSteps: TOUR_STEPS.length };

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay key={stepIndex} />
    </TourContext.Provider>
  );
};

export const useTour = () => useContext(TourContext);

const TourOverlay = () => {
  const tour = useContext(TourContext);
  const [rect, setRect] = useState(null);
  const attemptsRef = useRef(0);

  const step = tour?.step;

  useEffect(() => {
    if (!step) return undefined;
    if (!step.selector) return undefined;

    let cancelled = false;

    const locate = () => {
      if (cancelled) return;
      const candidates = document.querySelectorAll(step.selector);
      let found = null;
      candidates.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!found && r.width > 0 && r.height > 0) found = r;
      });

      if (found) {
        setRect({ top: found.top, left: found.left, width: found.width, height: found.height });
      } else if (attemptsRef.current < 40) {
        attemptsRef.current += 1;
        setTimeout(locate, 100);
      }
    };

    locate();

    const onRecalc = () => locate();
    window.addEventListener('resize', onRecalc);
    window.addEventListener('scroll', onRecalc, true);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onRecalc);
      window.removeEventListener('scroll', onRecalc, true);
    };
  }, [step]);

  if (!tour?.isActive || !step) return null;

  const pad = 8;
  const hasSpotlight = Boolean(step.selector) && Boolean(rect);
  const isWaitingForTarget = Boolean(step.selector) && !rect;

  // Tooltip-Position bestimmen (unter dem Element, sonst darüber, sonst Mitte)
  let tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  if (rect) {
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const preferBelow = spaceBelow > 220;
    if (preferBelow) {
      tooltipStyle = { top: rect.top + rect.height + pad + 16, left: '50%', transform: 'translateX(-50%)' };
    } else {
      tooltipStyle = { top: Math.max(16, rect.top - pad - 16), left: '50%', transform: 'translate(-50%, -100%)' };
    }
  }

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Abdunkelnder Hintergrund - blockiert Klicks außerhalb des markierten Bereichs */}
      <div
        className="absolute inset-0 bg-black/80"
        onClick={(e) => e.stopPropagation()}
      ></div>

      {/* Spotlight-Ausschnitt */}
      {hasSpotlight && (
        <div
          className="absolute rounded-2xl ring-2 ring-[#ff5c3e] transition-all duration-300 cursor-pointer"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.8)',
            background: 'transparent'
          }}
          onClick={tour.next}
          title="Zum Fortfahren tippen"
        ></div>
      )}

      {/* Tooltip */}
      {!isWaitingForTarget && (
        <div
          className="absolute w-[90vw] max-w-xs bg-[#1a1d24] border border-[#2a2e37] rounded-2xl shadow-2xl p-5 pointer-events-auto"
          style={tooltipStyle}
        >
          <button
            onClick={tour.stop}
            className="absolute top-3 right-3 text-[#8b92a5] hover:text-white transition-colors"
            aria-label="Tour beenden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div className="text-[9px] font-black uppercase tracking-widest text-[#ff5c3e] mb-2">
            Schritt {tour.stepIndex + 1} / {tour.totalSteps}
          </div>
          <h3 className="text-sm font-black uppercase text-white mb-2 pr-4">{step.title}</h3>
          <p className="text-xs text-[#8b92a5] leading-relaxed mb-4">{step.text}</p>

          <div className="flex items-center gap-2">
            {tour.stepIndex > 0 && (
              <button
                onClick={tour.prev}
                className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors px-3 py-2"
              >
                Zurück
              </button>
            )}
            <button
              onClick={tour.next}
              className="ml-auto text-[10px] font-black uppercase tracking-widest text-white bg-[#ff5c3e] hover:bg-[#ff5c3e]/90 transition-colors px-4 py-2 rounded-lg"
            >
              {tour.stepIndex === tour.totalSteps - 1 ? 'Fertig' : 'Weiter'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
