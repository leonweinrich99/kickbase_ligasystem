import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Jeder Schritt zeigt auf ein echtes Element in der App (per data-tour="...").
// selector: null => zentrierte Karte ohne Spotlight (Intro/Outro).
// path: entweder eine feste Route ODER ein Platzhalter-Key (z.B. "DYNAMIC_USER"),
//   dessen echte Route erst zur Laufzeit aus einem vorherigen Schritt ermittelt wird.
// captureHrefAs: merkt sich den href des gefundenen Elements unter diesem Key.
// simulateClick: löst beim Weitergehen einen ECHTEN Klick auf dem Element aus
//   (z.B. um ein Modal wirklich zu öffnen, nicht nur zu markieren).
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
    text: 'Tippe auf einen Namen für Punkteverlauf & Formkurve - schauen wir uns das gleich mal live an.',
    captureHrefAs: 'DYNAMIC_USER'
  },
  {
    path: 'DYNAMIC_USER',
    selector: '[data-tour="user-stats"]',
    title: 'Analyse-Features',
    text: 'Gesamtpunkte, Schnitt pro Spieltag, bester Spieltag und Performance Index - darunter findest du außerdem Charts zu Platzierungsverlauf und Formkurve.'
  },
  {
    path: '/',
    selector: '[data-tour="optimal-team-button"]',
    title: 'Die optimale Elf',
    text: 'Tippe hier, um dir die stärkste mögliche Elf des Spieltags live anzuzeigen.',
    simulateClick: true
  },
  {
    path: '/',
    selector: '[data-tour="optimal-team-pitch"]',
    title: 'Die optimale Elf',
    text: 'Hier siehst du die stärkste mögliche Formation inklusive Gesamtpunkten und verbleibendem Budget.'
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
  const [dynamicPaths, setDynamicPaths] = useState({});
  const isActive = stepIndex >= 0;
  const navigate = useNavigate();
  const location = useLocation();

  const start = useCallback(() => {
    setDynamicPaths({});
    setStepIndex(0);
  }, []);
  const stop = useCallback(() => setStepIndex(-1), []);

  const step = isActive ? TOUR_STEPS[stepIndex] : null;

  const captureHref = useCallback((key, href) => {
    if (!key || !href) return;
    setDynamicPaths((prev) => (prev[key] === href ? prev : { ...prev, [key]: href }));
  }, []);

  // Bei Schrittwechsel ggf. zur passenden Seite navigieren (inkl. dynamischer Pfade)
  useEffect(() => {
    if (!step) return;
    const targetPath = dynamicPaths[step.path] || step.path;
    if (targetPath && location.pathname !== targetPath) {
      navigate(targetPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, dynamicPaths[step?.path]]);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= TOUR_STEPS.length) return -1;
      return i + 1;
    });
  }, []);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const value = { isActive, stepIndex, step, start, stop, next, prev, captureHref, totalSteps: TOUR_STEPS.length };

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
  const scrolledRef = useRef(false);
  const targetElRef = useRef(null);

  const step = tour?.step;

  useEffect(() => {
    if (!step) return undefined;

    // Bei jedem Schritt zunächst sauber nach oben springen, damit alte
    // Scroll-Positionen der vorherigen Seite nicht "durchschlagen".
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (!step.selector) return undefined;

    let cancelled = false;

    const locate = () => {
      if (cancelled) return;
      const candidates = document.querySelectorAll(step.selector);
      let foundEl = null;
      candidates.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!foundEl && r.width > 0 && r.height > 0) foundEl = el;
      });

      if (foundEl) {
        targetElRef.current = foundEl;

        if (step.captureHrefAs) {
          const href = foundEl.getAttribute('href');
          if (href) tour.captureHref(step.captureHrefAs, href);
        }

        if (!scrolledRef.current) {
          scrolledRef.current = true;
          foundEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          setTimeout(() => {
            if (cancelled) return;
            const r2 = foundEl.getBoundingClientRect();
            setRect({ top: r2.top, left: r2.left, width: r2.width, height: r2.height });
          }, 400);
        }

        const r = foundEl.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (attemptsRef.current < 50) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!tour?.isActive || !step) return null;

  const pad = 8;
  const gap = 20;
  const hasSpotlight = Boolean(step.selector) && Boolean(rect);
  const isWaitingForTarget = Boolean(step.selector) && !rect;
  const tooltipWidth = 320;

  const advance = () => {
    if (step.simulateClick && targetElRef.current) {
      targetElRef.current.click();
    }
    tour.next();
  };

  const absorbClick = (e) => e.stopPropagation();

  // Sichere Grenzen ermitteln: oben = Safe-Area (Notch), unten = Oberkante der Tabbar
  const bodyStyle = typeof window !== 'undefined' ? window.getComputedStyle(document.body) : null;
  const safeTop = bodyStyle ? parseFloat(bodyStyle.paddingTop) || 0 : 0;
  const tabBarEl = typeof document !== 'undefined' ? document.querySelector('[data-tabbar]') : null;
  const safeBottomLimit = tabBarEl ? tabBarEl.getBoundingClientRect().top : window.innerHeight;

  // Tooltip-Position bestimmen: bevorzugt unter/über dem Element (mit Abstand,
  // damit es sich NIE mit dem markierten Bereich überschneidet), horizontal
  // am Element ausgerichtet statt starr mittig auf dem Screen, und niemals
  // in der Notch- bzw. Tabbar-Zone.
  let tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  if (rect) {
    const viewportW = window.innerWidth;
    const spaceBelow = safeBottomLimit - (rect.top + rect.height + pad);
    const spaceAbove = rect.top - pad - safeTop;
    const estimatedTooltipHeight = 200;

    const centerX = rect.left + rect.width / 2;
    const clampedLeft = Math.min(Math.max(centerX, tooltipWidth / 2 + 12), viewportW - tooltipWidth / 2 - 12);

    if (spaceBelow >= estimatedTooltipHeight || spaceBelow >= spaceAbove) {
      tooltipStyle = {
        top: rect.top + rect.height + pad + gap,
        left: clampedLeft,
        transform: 'translateX(-50%)',
        maxHeight: Math.max(140, spaceBelow - gap)
      };
    } else {
      tooltipStyle = {
        top: Math.max(safeTop + 16, rect.top - pad - gap),
        left: clampedLeft,
        transform: 'translate(-50%, -100%)',
        maxHeight: Math.max(140, spaceAbove - gap)
      };
    }
  }

  return (
    <div className="fixed inset-0 z-[200]">
      {hasSpotlight ? (
        <>
          {/* 4 dimmende Bereiche RUND UM das Element - blockieren Klicks, lassen
              das markierte Element selbst aber komplett unberührt/normal */}
          <div
            className="absolute bg-black/45"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - pad) }}
            onClick={absorbClick}
          ></div>
          <div
            className="absolute bg-black/45"
            style={{ top: rect.top + rect.height + pad, left: 0, right: 0, bottom: 0 }}
            onClick={absorbClick}
          ></div>
          <div
            className="absolute bg-black/45"
            style={{ top: rect.top - pad, left: 0, width: Math.max(0, rect.left - pad), height: rect.height + pad * 2 }}
            onClick={absorbClick}
          ></div>
          <div
            className="absolute bg-black/45"
            style={{ top: rect.top - pad, left: rect.left + rect.width + pad, right: 0, height: rect.height + pad * 2 }}
            onClick={absorbClick}
          ></div>

          {/* Markierungsrahmen - komplett transparent, keine Verdunkelung des Elements selbst */}
          <div
            className="absolute rounded-2xl ring-2 ring-[#ff5c3e] transition-all duration-300 cursor-pointer"
            style={{
              top: rect.top - pad,
              left: rect.left - pad,
              width: rect.width + pad * 2,
              height: rect.height + pad * 2
            }}
            onClick={advance}
            title="Zum Fortfahren tippen"
          ></div>
        </>
      ) : (
        <div className="absolute inset-0 bg-black/45" onClick={absorbClick}></div>
      )}

      {/* Tooltip */}
      {!isWaitingForTarget && (
        <div
          className="absolute overflow-y-auto bg-[#1a1d24] border border-[#2a2e37] rounded-2xl shadow-2xl p-5 pointer-events-auto"
          style={{ ...tooltipStyle, width: tooltipWidth, maxWidth: '85vw' }}
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
              onClick={advance}
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
