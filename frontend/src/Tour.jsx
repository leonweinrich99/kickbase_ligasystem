import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Offizielle SVG Marken-Logos & Echte Browser-Icons
const AppleIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 384 512" fill="currentColor">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-92.1zm-56.3-157.9c21.1-25.5 35.3-61.1 31.4-96.8-30.4 1.2-67.4 20.3-89.2 45.8-19.6 22.8-36.8 59-32.2 93.9 33.9 2.6 68.9-17.4 90-42.9z"/>
  </svg>
);

const AndroidIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.523 15.3414c-.5511 0-.998.4469-.998.998 0 .551.4469.998.998.998.551 0 .998-.447.998-.998 0-.5511-.447-.998-.998-.998zm-11.046 0c-.5511 0-.998.4469-.998.998 0 .551.4469.998.998.998.5511 0 .998-.447.998-.998 0-.5511-.4469-.998-.998-.998zM6.16 7.5022l-1.674-2.899c-.1446-.2504-.0587-.571.1917-.7157.2505-.1446.5711-.0587.7157.1917l1.7062 2.9547c1.4704-.6721 3.1258-1.0491 4.9004-1.0491 1.7746 0 3.43.377 4.9004 1.0491l1.7062-2.9547c.1446-.2504.4652-.3363.7157-.1917.2504.1446.3363.4653.1917.7157l-1.674 2.899C20.6133 9.0768 22 11.3853 22 14.0204H2C2 11.3853 3.3867 9.0768 6.16 7.5022zM12 21.02c-4.9706 0-4.0294-9-9-9 0-.34.0205-.675.0592-1.004h17.8816c.0387.329.0592.664.0592 1.004 0 4.9706-4.0294 9-9 9z"/>
  </svg>
);

const SafariIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
  </svg>
);

const SafariShareIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
    <polyline points="16 6 12 2 8 6"/>
    <line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
);

const ChromeIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="4"/>
    <line x1="21.17" y1="8" x2="12" y2="8"/>
    <line x1="3.95" y1="6.06" x2="8.54" y2="14"/>
    <line x1="10.88" y1="21.94" x2="15.46" y2="14"/>
  </svg>
);

export const TOUR_STEPS = [
  {
    path: '/archiv',
    selector: null,
    title: 'App-Tutorial & PWA Setup 📲',
    text: 'Willkommen! Installiere das Ligasystem als App auf deinem Home-Bildschirm oder starte direkt die interaktive Feature-Tour.'
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
    path: '/archiv/optimale-elf',
    selector: '[data-tour="optimal-team-pitch"]',
    title: 'Die optimale Elf',
    text: 'Hier siehst du die stärkste mögliche Formation inklusive Gesamtpunkten und verbleibendem Budget.'
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

const MAX_ATTEMPTS = 70;
const OPTIONAL_MAX_ATTEMPTS = 8;

const TourContext = createContext(null);

export const TourProvider = ({ children }) => {
  const [stepIndex, setStepIndex] = useState(-1);
  const [dynamicPaths, setDynamicPaths] = useState({});
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const isActive = stepIndex >= 0;
  const navigate = useNavigate();
  const location = useLocation();

  // Native Chrome/Android install event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

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

  // Robust path navigation resolution (mit DYNAMIC_USER Fallback!)
  useEffect(() => {
    if (!step) return;
    let targetPath = dynamicPaths[step.path] || step.path;
    
    // Fallback if DYNAMIC_USER wasn't captured yet
    if (targetPath === 'DYNAMIC_USER') {
      const userEl = document.querySelector('[data-tour="user-row"]');
      const fallbackHref = userEl?.getAttribute('href') || '/archiv';
      targetPath = fallbackHref;
    }

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

  const value = {
    isActive,
    stepIndex,
    step,
    start,
    stop,
    next,
    prev,
    skipUnreachable,
    captureHref,
    totalSteps: TOUR_STEPS.length,
    deferredPrompt
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay key={stepIndex} />
    </TourContext.Provider>
  );
};

export const useTour = () => useContext(TourContext);

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

  const [selectedOS, setSelectedOS] = useState(null); // null | 'ios' | 'android'
  const [pwaStep, setPwaStep] = useState(0); // 0, 1, 2, 3

  const step = tour?.step;

  // Striktes Zurücksetzen bei jedem Schrittwechsel
  useEffect(() => {
    setSelectedOS(null);
    setPwaStep(0);
    setRect(null);
    setNotFound(false);
    attemptsRef.current = 0;
    scrolledRef.current = false;
    autoAdvanceRef.current = false;
  }, [tour?.stepIndex]);

  useEffect(() => {
    if (!step) return undefined;

    window.scrollTo({ top: 0, behavior: 'auto' });

    if (!step.selector) return undefined;

    let cancelled = false;

    const finalize = (foundEl) => {
      if (cancelled) return;
      const r = foundEl.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });

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

      const stepAnimation = (now) => {
        if (cancelled) return;
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        window.scrollTo(0, startY + distance * eased);

        const r = foundEl.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });

        if (t < 1) {
          requestAnimationFrame(stepAnimation);
        } else {
          onDone();
        }
      };
      requestAnimationFrame(stepAnimation);
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
          setTimeout(() => {
            if (cancelled) return;
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
        tour.skipUnreachable();
      } else {
        setNotFound(true);
      }
    };

    locate();

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

  const { safeTop, safeBottom } = getSafeBounds();
  const isIntroStep = tour.stepIndex === 0;

  const hasSpotlight = Boolean(rect);
  const isSearching = Boolean(step.selector) && !rect && !notFound;

  const advance = () => {
    if (step.simulateClick) {
      const el = document.querySelector(step.selector) || targetElRef.current;
      if (el) el.click();
    }
    tour.next();
  };

  const advanceToFeatureTour = () => {
    setSelectedOS(null);
    setPwaStep(0);
    tour.next();
  };

  const skip = () => {
    setNotFound(false);
    tour.skipUnreachable();
  };

  const absorbClick = (e) => e.stopPropagation();

  const tooltipWidth = isIntroStep ? 380 : 320;
  const safeMargin = 16;

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
      tooltipStyle = {
        top: safeBottom - safeMargin,
        left: Math.min(Math.max(viewportW / 2, tooltipWidth / 2 + 12), viewportW - tooltipWidth / 2 - 12),
        transform: 'translate(-50%, -100%)',
        maxHeight: Math.max(120, safeBottom - safeTop - safeMargin * 2)
      };
    }
  } else {
    const midY = safeTop + (safeBottom - safeTop) / 2;
    tooltipStyle = {
      top: midY,
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxHeight: Math.max(200, safeBottom - safeTop - safeMargin * 2)
    };
  }

  // IOS Tutorial Content definition (unter Nutzung der echten Screenshots aus Downloads)
  const iosSteps = [
    {
      title: '1. Safari Menü ( ... ) öffnen',
      text: 'Tippe unten in der Adressleiste von Safari auf die drei Punkte ( ... ) auf der rechten Seite.',
      renderGraphic: () => (
        <div className="w-full bg-[#111] border border-[#2e2e2e] rounded-xl p-2 my-2 text-center shadow-inner">
          <img src="/tutorial/ios_1.jpg" alt="Safari Menü" className="w-full max-h-[160px] object-contain mx-auto rounded-lg mb-2" />
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (navigator.share) {
                try {
                  await navigator.share({
                    title: 'Kickbase Ligasystem',
                    text: 'Ligasystem App auf Home-Bildschirm speichern',
                    url: window.location.href
                  });
                  setPwaStep(2);
                } catch (err) {
                  setPwaStep(1);
                }
              } else {
                setPwaStep(1);
              }
            }}
            className="w-full py-2 px-3 bg-sky-500 hover:bg-sky-400 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 cursor-pointer"
          >
            <SafariShareIcon className="w-4 h-4 text-white" /> Teilen-Menü direkt öffnen [↑]
          </button>
        </div>
      )
    },
    {
      title: '2. Auf "Teilen" tippen',
      text: 'Tippe ganz oben im aufstappenden Safari-Menü auf "Teilen" mit dem Quadrat-Symbol [↑].',
      renderGraphic: () => (
        <div className="w-full bg-[#111] border border-[#2e2e2e] rounded-xl p-2 my-2 text-center shadow-inner">
          <img src="/tutorial/ios_2.jpg" alt="Teilen wählen" className="w-full max-h-[180px] object-contain mx-auto rounded-lg" />
        </div>
      )
    },
    {
      title: '3. "Zum Home-Bildschirm" wählen',
      text: 'Scrolle im iOS-Freigabefenster nach unten und tippe auf den Menüeintrag "Zum Home-Bildschirm" mit dem Plus-Icon (+).',
      renderGraphic: () => (
        <div className="w-full bg-[#111] border border-[#2e2e2e] rounded-xl p-2 my-2 text-center shadow-inner">
          <img src="/tutorial/ios_3.jpg" alt="Zum Home-Bildschirm" className="w-full max-h-[190px] object-contain mx-auto rounded-lg" />
        </div>
      )
    },
    {
      title: '4. "Als Web-App öffnen" prüfen & Hinzufügen 🚀',
      text: 'Achte darauf, dass der Schalter "Als Web-App öffnen" GRÜN ist, und tippe oben rechts auf "Hinzufügen".',
      renderGraphic: () => (
        <div className="w-full bg-[#111] border border-[#2e2e2e] rounded-xl p-2 my-2 text-center shadow-inner">
          <img src="/tutorial/ios_4.jpg" alt="Als Web-App öffnen & Hinzufügen" className="w-full max-h-[180px] object-contain mx-auto rounded-lg" />
        </div>
      )
    }
  ];

  // Android Tutorial Content definition
  const androidSteps = [
    {
      title: '1. Chrome 3-Punkte-Menü & Auto-Install',
      text: 'Nutze den Button für die automatische 1-Klick Installation oder tippe oben rechts auf das Drei-Punkte-Menü ( ⋮ ).',
      renderGraphic: () => (
        <div className="w-full bg-[#111] border border-[#2e2e2e] rounded-xl p-3 my-2 text-left shadow-inner">
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (tour.deferredPrompt) {
                tour.deferredPrompt.prompt();
                const { outcome } = await tour.deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                  advanceToFeatureTour();
                }
              } else {
                setPwaStep(1);
              }
            }}
            className="w-full py-2.5 px-3 bg-[#ff5c3e] hover:bg-[#ff5c3e]/90 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 mb-2 cursor-pointer"
          >
            <AndroidIcon className="w-4 h-4 text-white" /> Jetzt automatisch installieren 📲
          </button>
          <div className="text-[10px] text-gray-400 text-center font-semibold">
            Oder manuell oben rechts in Chrome auf ( ⋮ ) tippen
          </div>
        </div>
      )
    },
    {
      title: '2. "App installieren" wählen',
      text: 'Suche im geöffneten Menü nach der Option "App installieren" 📲 oder "Zum Startbildschirm hinzufügen".',
      renderGraphic: () => (
        <div className="w-full bg-[#111] border border-[#2e2e2e] rounded-xl p-3 my-2 text-left">
          <div className="space-y-1.5 text-xs text-gray-300">
            <div className="px-3 py-1.5 text-gray-500">Neuer Tab</div>
            <div className="px-3 py-1.5 text-gray-500">Lesezeichen</div>
            <div className="flex items-center justify-between px-3 py-2 bg-[#ff5c3e]/20 border border-[#ff5c3e] rounded-lg text-white font-bold animate-pulse">
              <span className="flex items-center gap-2">
                <AndroidIcon className="w-4 h-4 text-emerald-400" /> App installieren
              </span>
              <span className="text-[10px] bg-[#ff5c3e] px-2 py-0.5 rounded text-white font-black">HIER TIPPEN</span>
            </div>
            <div className="px-3 py-1.5 text-gray-500">Zum Startbildschirm...</div>
          </div>
        </div>
      )
    },
    {
      title: '3. Bestätigen & Schnellzugriff nutzen 🚀',
      text: 'Tippe im Bestätigungs-Popup auf "Installieren". Die App wird direkt auf deinem Home-Bildschirm abgelegt!',
      renderGraphic: () => (
        <div className="w-full bg-[#111] border border-[#2e2e2e] rounded-xl p-4 my-2 text-center">
          <div className="w-12 h-12 mx-auto mb-2 bg-[#1f1f1f] border border-[#333] rounded-2xl flex items-center justify-center text-emerald-400 shadow-lg">
            <AndroidIcon className="w-7 h-7" />
          </div>
          <div className="text-xs font-bold text-white mb-1">Ligasystem App installieren?</div>
          <div className="inline-block bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-black uppercase px-3 py-1 rounded-full">
            ✓ Bereit zur Installation
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="fixed inset-0 z-[200]">
      {hasSpotlight ? (
        <>
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

          {/* Animierter Spotlight-Rahmen auf das ECHTE DOM-Element */}
          <div
            className="absolute rounded-2xl ring-2 ring-[#ff5c3e] cursor-pointer animate-pulse z-[205]"
            style={{
              top: rect.top - pad,
              left: rect.left - pad,
              width: rect.width + pad * 2,
              height: rect.height + pad * 2
            }}
            onClick={(e) => {
              e.stopPropagation();
              advance();
            }}
            title="Zum Fortfahren tippen"
          ></div>
        </>
      ) : (
        <div className="absolute inset-0 bg-black/55 backdrop-blur-xs" onClick={absorbClick}></div>
      )}

      {/* Tour beenden button */}
      <button
        onClick={tour.stop}
        className="fixed text-[#8b92a5] hover:text-white transition-colors bg-[#171717] border border-[#2e2e2e] rounded-full w-8 h-8 flex items-center justify-center pointer-events-auto shadow-lg z-[210] cursor-pointer"
        style={{ top: safeTop + 16, right: 16 }}
        aria-label="Tour beenden"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      {/* Tooltip & PWA Setup Card */}
      {!isSearching && (
        <div
          className="absolute overflow-y-auto card-surface rounded-2xl shadow-2xl p-5 pointer-events-auto z-[215]"
          style={{ ...tooltipStyle, width: tooltipWidth, maxWidth: '92vw' }}
        >
          {notFound ? (
            <>
              <h3 className="text-sm font-black uppercase text-white mb-2 pr-4">Hoppla</h3>
              <p className="text-xs text-[#8b92a5] leading-relaxed mb-4">Dieser Bereich konnte gerade nicht gefunden werden. Wir machen einfach weiter.</p>
              <button
                onClick={skip}
                className="w-full text-[10px] font-black uppercase tracking-widest text-white bg-[#ff5c3e] hover:bg-[#ff5c3e]/90 transition-colors px-4 py-2 rounded-lg cursor-pointer"
              >
                Weiter
              </button>
            </>
          ) : isIntroStep ? (
            /* STEP 0: PWA INSTALLATION TUTORIAL & OS SELECTION */
            <div>
              {selectedOS === null && (
                <div className="text-center">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] mb-1">
                    Kickbase Ligasystem 📲
                  </div>
                  <h3 className="text-base font-black uppercase text-white mb-2">
                    App auf Home-Bildschirm speichern
                  </h3>
                  <p className="text-xs text-[#8b92a5] leading-relaxed mb-5">
                    Für schnellen Zugriff und echtes App-Feeling kannst du das Ligasystem als App speichern. Welches Betriebssystem nutzt du?
                  </p>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setSelectedOS('ios');
                        setPwaStep(0);
                        if (navigator.share) {
                          try {
                            await navigator.share({
                              title: 'Kickbase Ligasystem',
                              text: 'Kickbase Ligasystem App auf Home-Bildschirm speichern',
                              url: window.location.href
                            });
                          } catch (err) {}
                        }
                      }}
                      className="flex flex-col items-center justify-center p-4 bg-[#222222] hover:bg-[#2e2e2e] border border-[#3a3a3a] hover:border-[#ff5c3e]/60 rounded-xl transition-all group cursor-pointer"
                    >
                      <div className="w-10 h-10 mb-2 rounded-xl bg-white/10 flex items-center justify-center text-white group-hover:scale-110 group-hover:bg-white/20 transition-all">
                        <AppleIcon className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-xs font-black text-white uppercase tracking-wider">Apple (iOS)</span>
                      <span className="text-[10px] text-sky-400 font-bold mt-1 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/30">
                        ⚡ Teilen öffnen [↑]
                      </span>
                    </button>

                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setSelectedOS('android');
                        setPwaStep(0);
                        if (tour.deferredPrompt) {
                          tour.deferredPrompt.prompt();
                        }
                      }}
                      className="flex flex-col items-center justify-center p-4 bg-[#222222] hover:bg-[#2e2e2e] border border-[#3a3a3a] hover:border-[#ff5c3e]/60 rounded-xl transition-all group cursor-pointer"
                    >
                      <div className="w-10 h-10 mb-2 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all">
                        <AndroidIcon className="w-6 h-6 text-emerald-400" />
                      </div>
                      <span className="text-xs font-black text-white uppercase tracking-wider">Android</span>
                      <span className="text-[10px] text-emerald-400 font-bold mt-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                        📲 Auto-Install
                      </span>
                    </button>
                  </div>

                  <button
                    onClick={advanceToFeatureTour}
                    className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white bg-[#1a1a1a] hover:bg-[#262626] border border-[#2e2e2e] rounded-xl transition-colors cursor-pointer"
                  >
                    Direkt zur App Feature-Tour 🚀
                  </button>
                </div>
              )}

              {selectedOS === 'ios' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[9px] font-black uppercase tracking-widest text-[#ff5c3e] flex items-center gap-1.5">
                      <AppleIcon className="w-3.5 h-3.5 text-white" /> Apple iOS • Schritt {pwaStep + 1} / {iosSteps.length}
                    </div>
                    <button
                      onClick={() => setSelectedOS(null)}
                      className="text-[9px] font-bold text-[#8b92a5] hover:text-white underline cursor-pointer"
                    >
                      System wechseln
                    </button>
                  </div>

                  <h3 className="text-sm font-black uppercase text-white mb-1 flex items-center gap-1.5">
                    {iosSteps[pwaStep].title}
                  </h3>
                  <p className="text-xs text-[#8b92a5] leading-relaxed mb-2">
                    {iosSteps[pwaStep].text}
                  </p>

                  {/* Render Screenshot Graphic */}
                  {iosSteps[pwaStep].renderGraphic()}

                  <div className="flex items-center gap-2 mt-4">
                    {pwaStep > 0 ? (
                      <button
                        onClick={() => setPwaStep((s) => s - 1)}
                        className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors px-3 py-2 cursor-pointer"
                      >
                        Zurück
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedOS(null)}
                        className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors px-2 py-2 cursor-pointer"
                      >
                        Abbrechen
                      </button>
                    )}

                    {pwaStep < iosSteps.length - 1 ? (
                      <button
                        onClick={() => setPwaStep((s) => s + 1)}
                        className="ml-auto text-[10px] font-black uppercase tracking-widest text-white bg-[#ff5c3e] hover:bg-[#ff5c3e]/90 transition-colors px-4 py-2 rounded-lg cursor-pointer"
                      >
                        Weiter ({pwaStep + 1}/{iosSteps.length})
                      </button>
                    ) : (
                      <button
                        onClick={advanceToFeatureTour}
                        className="ml-auto text-[10px] font-black uppercase tracking-widest text-white bg-emerald-500 hover:bg-emerald-600 transition-colors px-4 py-2 rounded-lg cursor-pointer"
                      >
                        Zur Feature-Tour 🚀
                      </button>
                    )}
                  </div>
                </div>
              )}

              {selectedOS === 'android' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[9px] font-black uppercase tracking-widest text-[#ff5c3e] flex items-center gap-1.5">
                      <AndroidIcon className="w-3.5 h-3.5 text-emerald-400" /> Android • Schritt {pwaStep + 1} / {androidSteps.length}
                    </div>
                    <button
                      onClick={() => setSelectedOS(null)}
                      className="text-[9px] font-bold text-[#8b92a5] hover:text-white underline cursor-pointer"
                    >
                      System wechseln
                    </button>
                  </div>

                  <h3 className="text-sm font-black uppercase text-white mb-1 flex items-center gap-1.5">
                    {androidSteps[pwaStep].title}
                  </h3>
                  <p className="text-xs text-[#8b92a5] leading-relaxed mb-2">
                    {androidSteps[pwaStep].text}
                  </p>

                  {androidSteps[pwaStep].renderGraphic()}

                  <div className="flex items-center gap-2 mt-4">
                    {pwaStep > 0 ? (
                      <button
                        onClick={() => setPwaStep((s) => s - 1)}
                        className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors px-3 py-2 cursor-pointer"
                      >
                        Zurück
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedOS(null)}
                        className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors px-2 py-2 cursor-pointer"
                      >
                        Abbrechen
                      </button>
                    )}

                    {pwaStep < androidSteps.length - 1 ? (
                      <button
                        onClick={() => setPwaStep((s) => s + 1)}
                        className="ml-auto text-[10px] font-black uppercase tracking-widest text-white bg-[#ff5c3e] hover:bg-[#ff5c3e]/90 transition-colors px-4 py-2 rounded-lg cursor-pointer"
                      >
                        Weiter ({pwaStep + 1}/{androidSteps.length})
                      </button>
                    ) : (
                      <button
                        onClick={advanceToFeatureTour}
                        className="ml-auto text-[10px] font-black uppercase tracking-widest text-white bg-emerald-500 hover:bg-emerald-600 transition-colors px-4 py-2 rounded-lg cursor-pointer"
                      >
                        Zur Feature-Tour 🚀
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* REGULAR FEATURE TOUR STEPS */
            <>
              <div className="text-[9px] font-black uppercase tracking-widest text-[#ff5c3e] mb-2 pr-8">
                Feature-Tour • Schritt {tour.stepIndex} / {tour.totalSteps - 1}
              </div>
              <h3 className="text-sm font-black uppercase text-white mb-2 pr-4">{step.title}</h3>
              <p className="text-xs text-[#8b92a5] leading-relaxed mb-4">{step.text}</p>

              <div className="flex items-center gap-2">
                {tour.stepIndex > 0 && (
                  <button
                    onClick={tour.prev}
                    className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors px-3 py-2 cursor-pointer"
                  >
                    Zurück
                  </button>
                )}
                <button
                  onClick={advance}
                  className="ml-auto text-[10px] font-black uppercase tracking-widest text-white bg-[#ff5c3e] hover:bg-[#ff5c3e]/90 transition-colors px-4 py-2 rounded-lg cursor-pointer"
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
