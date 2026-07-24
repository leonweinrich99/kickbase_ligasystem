import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Jeder Schritt zeigt auf ein echtes Element in der App (per data-tour="...").
// selector: null => zentrierte Karte ohne Spotlight (Intro/Outro).
// path: entweder eine feste Route ODER ein Platzhalter-Key (z.B. "DYNAMIC_USER"),
//   dessen echte Route erst zur Laufzeit aus einem vorherigen Schritt ermittelt wird.
// captureHrefAs: merkt sich den href des gefundenen Elements unter diesem Key.
// simulateClick: löst beim Weitergehen einen ECHTEN Klick auf dem Element aus
//   (z.B. um ein Modal wirklich zu öffnen, nicht nur zu markieren).
//
// Die Liga-Schritte laufen bewusst über /archiv (Qualifikationsrunde 25/26),
// weil dort echte, reichhaltige Statistiken vorhanden sind - im neuen Live-
// Modus stehen aktuell nur Platzhalter-Nullen, das wäre für die Tour witzlos.
export const TOUR_STEPS = [
  {
    path: '/archiv',
    selector: null,
    title: 'Willkommen! 👋',
    text: 'Diese kurze Tour zeigt dir direkt in der echten App, wo du was findest. Tippe auf die markierten Bereiche, um weiterzugehen. (Zur Anschauung nutzen wir hier die Daten der Qualifikationsrunde 25/26.)'
  },
  {
    path: '/archiv',
    selector: '[data-tour="matchday-switcher"]',
    title: 'Spieltag wechseln',
    text: 'Mit den Pfeilen wechselst du zwischen der Gesamtwertung und einzelnen Spieltagen. Tippe hier, um weiterzumachen.'
  },
  {
    path: '/archiv',
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
    path: '/archiv',
    selector: '[data-tour="optimal-team-button"]',
    title: 'Die optimale Elf',
    text: 'Tippe hier, um dir die stärkste mögliche Elf des Spieltags live anzuzeigen.'
  },
  {
    path: '/archiv',
    selector: '[data-tour="optimal-team-pitch"]',
    title: 'Die optimale Elf',
    text: 'Hier siehst du die stärkste mögliche Formation inklusive Gesamtpunkten und verbleibendem Budget.',
    forceOptimalTeamOpen: true
  },
  {
    path: '/archiv',
    selector: '[data-tour="tab-pokal"]',
    title: 'Zum Pokal',
    text: 'Tippe auf "Pokal" in der Tabbar, um weiterzugehen.'
  },
  {
    path: '/pokal',
    selector: '[data-tour="pokal-first-match"]',
    title: 'Pokal-Baum',
    text: 'K.-o.-System vom Sechzehntelfinale bis zum Finale, ausgelost aus der Qualifikationsrunde. Auf dem Handy wechselst du per Tab durch die Runden, am Desktop siehst du alles auf einen Blick.',
    noAutoScroll: true
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

const MAX_ATTEMPTS = 70; // ~7s, Archiv-Seiten laden mehrere History-Dateien
const OPTIONAL_MAX_ATTEMPTS = 8; // ~0.8s - fuer Schritte, die nur mobil existieren (z.B. Runden-Tabs)

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

  const skipUnreachable = useCallback(() => {
    setStepIndex((i) => (i + 1 >= TOUR_STEPS.length ? -1 : i + 1));
  }, []);

  // Manche Features (z.B. das Optimale-Elf-Modal) werden nicht per simuliertem
  // Klick geöffnet, sondern rein deklarativ: der jeweilige Screen liest
  // tour.step?.forceOptimalTeamOpen selbst aus und öffnet/schließt sich
  // dadurch automatisch mit dem Tour-Schritt - kein Timing-Risiko mehr.
  const value = { isActive, stepIndex, step, start, stop, next, prev, skipUnreachable, captureHref, totalSteps: TOUR_STEPS.length };

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay key={stepIndex} />
    </TourContext.Provider>
  );
};

export const useTour = () => useContext(TourContext);

// Sichere Grenzen ermitteln: oben = Safe-Area (Notch), unten = Oberkante der Tabbar
const getSafeBounds = () => {
  const bodyStyle = window.getComputedStyle(document.body);
  const safeTop = parseFloat(bodyStyle.paddingTop) || 0;
  const tabBarEl = document.querySelector('[data-tabbar]');
  const safeBottom = tabBarEl ? tabBarEl.getBoundingClientRect().top : window.innerHeight;
  return { safeTop, safeBottom };
};

const TourOverlay = () => {
  const tour = useContext(TourContext);
  const [rect, setRect] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const attemptsRef = useRef(0);
  const scrolledRef = useRef(false);
  const targetElRef = useRef(null);
  const autoAdvanceRef = useRef(false);

  const step = tour?.step;

  useEffect(() => {
    if (!step) return undefined;

    // Bei jedem Schritt zunächst sauber nach oben springen, damit alte
    // Scroll-Positionen der vorherigen Seite nicht "durchschlagen".
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (!step.selector) return undefined;

    let cancelled = false;

    const finalize = (foundEl) => {
      if (cancelled) return;
      const r = foundEl.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });

      // Manche Schritte (z.B. Pokal-Runden-Tabs) sollen automatisch
      // weitergehen, ohne dass man selbst tippen/bestätigen muss.
      if (step.autoAdvance && !autoAdvanceRef.current) {
        autoAdvanceRef.current = true;
        setTimeout(() => {
          if (cancelled) return;
          if (step.simulateClick) {
            const el = document.querySelector(step.selector) || foundEl;
            if (el) el.click();
          }
          tour.next();
        }, step.autoAdvance);
      }
    };

    // Eigene, selbst gesteuerte Scroll-Animation statt scrollIntoView():
    // dadurch bleibt die Markierung waehrend des Scrollens sichtbar und
    // gleitet sanft mit, ohne dass (wie beim nativen scrollIntoView) ein
    // externer 'scroll'-Listener die Animation unterbrechen muss/kann -
    // wir kontrollieren scrollY hier selbst, Frame für Frame.
    const animateScrollTo = (foundEl, block, onDone) => {
      const startY = window.scrollY;
      const r0 = foundEl.getBoundingClientRect();
      const viewportH = window.innerHeight;

      let targetY;
      if (block === 'end') {
        targetY = startY + r0.bottom - viewportH + 24;
      } else if (block === 'start') {
        targetY = startY + r0.top - 24;
      } else {
        targetY = startY + r0.top - (viewportH - r0.height) / 2;
      }
      const maxScroll = document.documentElement.scrollHeight - viewportH;
      targetY = Math.max(0, Math.min(targetY, maxScroll));

      const distance = targetY - startY;
      if (Math.abs(distance) < 2) {
        onDone();
        return;
      }

      const duration = Math.min(900, Math.max(350, Math.abs(distance) * 0.5));
      const startTime = performance.now();

      const step = (now) => {
        if (cancelled) return;
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        window.scrollTo(0, startY + distance * eased);

        // Markierung während der Animation live mitziehen
        const r = foundEl.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          onDone();
        }
      };
      requestAnimationFrame(step);
    };

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

        const isFixed = window.getComputedStyle(foundEl).position === 'fixed' || Boolean(foundEl.closest('[data-tabbar]'));

        if (!scrolledRef.current) {
          scrolledRef.current = true;

          // Kurze Verzögerung, bevor Position gemessen/gescrollt wird: manche
          // Bereiche haben eine Eintritts-Animation (z.B. Framer Motion beim
          // Pokal-Rundenwechsel, die mit einem Transform startet und erst zu
          // x:0 animiert). Würden wir sofort messen, könnten wir mitten in
          // dieser Animation eine falsche (verschobene) Position erwischen.
          setTimeout(() => {
            if (cancelled) return;

            // Manche Bereiche (z.B. der Pokal-Baum am Desktop) liegen in einem
            // eigenen horizontal scrollbaren Container, der standardmäßig auf
            // die Mitte des Baums (Finale) zentriert ist. Das reicht ein
            // normaler vertikaler Scroll nicht ab - hier zusätzlich horizontal
            // korrigieren, falls das Element seitlich außerhalb des sichtbaren
            // Bereichs liegt.
            const r0 = foundEl.getBoundingClientRect();
            if (r0.left < 0 || r0.right > window.innerWidth) {
              foundEl.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
            }

            if (!isFixed && !step.noAutoScroll) {
              animateScrollTo(foundEl, step.scrollBlock || 'center', () => finalize(foundEl));
            } else {
              finalize(foundEl);
            }
          }, 220);
          return;
        }

        finalize(foundEl);
      } else if (attemptsRef.current < (step.optional ? OPTIONAL_MAX_ATTEMPTS : MAX_ATTEMPTS)) {
        attemptsRef.current += 1;
        setTimeout(locate, 100);
      } else if (step.optional) {
        // Optionale Schritte (z.B. mobile Runden-Tabs) existieren auf manchen
        // Bildschirmgrößen nicht - dann leise überspringen statt "Hoppla" zu zeigen.
        tour.skipUnreachable();
      } else {
        setNotFound(true);
      }
    };

    locate();

    // Nur bei Größenänderung (z.B. Rotation) neu einmessen. Ein 'scroll'-Listener
    // wurde hier bewusst NICHT eingebaut: die dadurch ausgelösten Re-Renders haben
    // die scrollIntoView-Animation selbst unterbrochen, sodass der Zielbereich
    // teils nie vollständig ins Bild gescrollt wurde.
    const onResize = () => locate();
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!tour?.isActive || !step) return null;

  const pad = 8;
  const gap = 20;
  const hasSpotlight = Boolean(step.selector) && Boolean(rect);
  const isSearching = Boolean(step.selector) && !rect && !notFound;

  const advance = () => {
    if (step.simulateClick) {
      const el = document.querySelector(step.selector) || targetElRef.current;
      if (el) el.click();
    }
    tour.next();
  };

  const skip = () => {
    setNotFound(false);
    tour.skipUnreachable();
  };

  const absorbClick = (e) => e.stopPropagation();

  const { safeTop, safeBottom } = getSafeBounds();
  const tooltipWidth = 320;
  const safeMargin = 16;

  // Tooltip-Position bestimmen: bevorzugt unter/über dem Element (mit Abstand,
  // damit es sich NIE mit dem markierten Bereich überschneidet), horizontal
  // am Element ausgerichtet statt starr mittig auf dem Screen, und niemals
  // in der Notch- bzw. Tabbar-Zone. Reicht der Platz weder oben noch unten
  // (z.B. bei sehr großen markierten Bereichen), wird das Tooltip stattdessen
  // fest oberhalb der Tabbar "angedockt" statt irgendwo zu überlappen.
  let tooltipStyle;
  if (rect) {
    const viewportW = window.innerWidth;
    const spaceBelow = safeBottom - (rect.top + rect.height + pad) - gap;
    const spaceAbove = rect.top - pad - safeTop - gap;
    const estimatedTooltipHeight = 190;

    const centerX = rect.left + rect.width / 2;
    const clampedLeft = Math.min(Math.max(centerX, tooltipWidth / 2 + 12), viewportW - tooltipWidth / 2 - 12);

    if (spaceBelow >= estimatedTooltipHeight) {
      tooltipStyle = {
        top: rect.top + rect.height + pad + gap,
        left: clampedLeft,
        transform: 'translateX(-50%)',
        maxHeight: Math.max(120, spaceBelow)
      };
    } else if (spaceAbove >= estimatedTooltipHeight) {
      tooltipStyle = {
        top: rect.top - pad - gap,
        left: clampedLeft,
        transform: 'translate(-50%, -100%)',
        maxHeight: Math.max(120, spaceAbove)
      };
    } else {
      // Weder oben noch unten genug Platz -> fest über der Tabbar andocken
      tooltipStyle = {
        top: safeBottom - safeMargin,
        left: Math.min(Math.max(viewportW / 2, tooltipWidth / 2 + 12), viewportW - tooltipWidth / 2 - 12),
        transform: 'translate(-50%, -100%)',
        maxHeight: Math.max(120, safeBottom - safeTop - safeMargin * 2)
      };
    }
  } else {
    // Zentrierte Karte (Intro/Outro/Suche), aber innerhalb der Safe-Area geclampt
    const midY = safeTop + (safeBottom - safeTop) / 2;
    tooltipStyle = {
      top: midY,
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxHeight: Math.max(160, safeBottom - safeTop - safeMargin * 2)
    };
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
            className="absolute rounded-2xl ring-2 ring-[#ff5c3e] cursor-pointer"
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

      {/* Tour jederzeit beenden - immer sichtbar, auch während gesucht wird */}
      <button
        onClick={tour.stop}
        className="fixed text-[#8b92a5] hover:text-white transition-colors bg-[#171717] border border-[#2e2e2e] rounded-full w-8 h-8 flex items-center justify-center pointer-events-auto shadow-lg"
        style={{ top: safeTop + 16, right: 16 }}
        aria-label="Tour beenden"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      {/* Tooltip - erst anzeigen, wenn der Bereich gefunden wurde (oder nicht gefunden werden konnte) */}
      {!isSearching && (
        <div
          className="absolute overflow-y-auto bg-[#171717] border border-[#2e2e2e] rounded-2xl shadow-2xl p-5 pointer-events-auto"
          style={{ ...tooltipStyle, width: tooltipWidth, maxWidth: '85vw' }}
        >
          {notFound ? (
            <>
              <h3 className="text-sm font-black uppercase text-white mb-2 pr-4">Hoppla</h3>
              <p className="text-xs text-[#8b92a5] leading-relaxed mb-4">Dieser Bereich konnte gerade nicht gefunden werden. Wir machen einfach weiter.</p>
              <button
                onClick={skip}
                className="w-full text-[10px] font-black uppercase tracking-widest text-white bg-[#ff5c3e] hover:bg-[#ff5c3e]/90 transition-colors px-4 py-2 rounded-lg"
              >
                Weiter
              </button>
            </>
          ) : (
            <>
              <div className="text-[9px] font-black uppercase tracking-widest text-[#ff5c3e] mb-2 pr-8">
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
            </>
          )}
        </div>
      )}
    </div>
  );
};
