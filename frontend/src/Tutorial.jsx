import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const Icon = {
  wave: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"></path>
      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"></path>
      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"></path>
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6.29-2.71l-4.3-5a2 2 0 1 1 3-2.5l2.59 3"></path>
    </svg>
  ),
  liga: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 3l9 6.5"></path>
      <path d="M5 8.5V21h14V8.5"></path>
      <path d="M10 21v-6h4v6"></path>
    </svg>
  ),
  compare: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3 4 7l4 4"></path>
      <path d="M4 7h16"></path>
      <path d="M16 21l4-4-4-4"></path>
      <path d="M20 17H4"></path>
    </svg>
  ),
  star: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  ),
  pokal: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
      <path d="M4 22h16"></path>
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
      <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z"></path>
    </svg>
  ),
  account: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"></circle>
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"></path>
    </svg>
  ),
  check: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  )
};

const STEPS = [
  {
    icon: Icon.wave,
    color: '#ff5c3e',
    title: 'Willkommen im Ligasystem! 👋',
    text: 'Diese kurze Tour zeigt dir in 1 Minute, wo du was findest. Du kannst sie dir jederzeit im Account-Bereich erneut ansehen.'
  },
  {
    icon: Icon.liga,
    color: '#ff5c3e',
    title: 'Liga',
    text: 'Drei komplett unabhängige Ligen mit eigener Tabelle. Mit den Pfeilen oben wechselst du zwischen "Gesamt" und einzelnen Spieltagen.'
  },
  {
    icon: Icon.compare,
    color: '#4ba6ff',
    title: 'Spielerdetails & Vergleich',
    text: 'Tippe auf einen Namen in der Tabelle für Punkteverlauf & Formkurve. Von dort aus kannst du zwei Spieler direkt miteinander vergleichen.'
  },
  {
    icon: Icon.star,
    color: '#ff5c3e',
    title: 'Die optimale Elf',
    text: 'Unten in der Liga-Ansicht zeigt dir dieser Button die stärkste mögliche Elf des jeweiligen Spieltags – über alle Spieler hinweg.'
  },
  {
    icon: Icon.pokal,
    color: '#8b5cf6',
    title: 'Pokal',
    text: 'K.-o.-System vom Sechzehntelfinale bis zum Finale, ausgelost aus der Qualifikationsrunde. Auf dem Handy wischen, am Desktop reinzoomen.'
  },
  {
    icon: Icon.account,
    color: '#8b92a5',
    title: 'Account',
    text: 'Hier findest du den Regelkatalog, die Pokal-Regeln, das Archiv der Qualifikationsrunde 25/26 und die Abmelden-Funktion.'
  },
  {
    icon: Icon.check,
    color: '#22c55e',
    title: 'Los geht\'s!',
    text: 'Das war\'s schon. Viel Erfolg in deiner Liga!'
  }
];

const Tutorial = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  const next = () => {
    if (isLast) {
      handleClose();
    } else {
      setStep((s) => s + 1);
    }
  };

  const prev = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1a1d24] border border-[#2a2e37] rounded-3xl shadow-2xl overflow-hidden relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-[#8b92a5] hover:text-white transition-colors z-10"
          aria-label="Tutorial schließen"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="p-8 pt-12 min-h-[320px] flex flex-col items-center text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center flex-1"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: `${current.color}1A`, color: current.color }}
              >
                {current.icon}
              </div>
              <h2 className="text-lg font-black uppercase tracking-tight text-white mb-3">{current.title}</h2>
              <p className="text-sm text-[#8b92a5] leading-relaxed">{current.text}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-center gap-1.5 pb-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-[#ff5c3e]' : 'w-1.5 bg-[#2a2e37]'}`}
            ></div>
          ))}
        </div>

        <div className="flex border-t border-[#2a2e37]">
          {step > 0 ? (
            <button
              onClick={prev}
              className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors border-r border-[#2a2e37]"
            >
              Zurück
            </button>
          ) : (
            <button
              onClick={handleClose}
              className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors border-r border-[#2a2e37]"
            >
              Überspringen
            </button>
          )}
          <button
            onClick={next}
            className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-[#ff5c3e] hover:text-white transition-colors"
          >
            {isLast ? 'Los geht\'s' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
