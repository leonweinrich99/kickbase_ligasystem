import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// --- Mini-Mockups im echten App-Look, damit man schon vor dem Login/der
// Freischaltung eine echte Vorstellung vom Aussehen der App bekommt. ---

const MockUserRow = ({ rank, name, points, color, trophy }) => (
  <div className="flex items-center p-2.5 mb-2 bg-[#1a1d24] border border-[#2a2e37] rounded-[12px] shadow-sm">
    <div className="w-6 flex justify-center items-center text-[10px] font-bold text-[#8b92a5]">
      {trophy ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z"></path>
        </svg>
      ) : rank}
    </div>
    <div className="w-8 h-8 rounded-full bg-[#20242d] ml-2 flex items-center justify-center border border-[#2a2e37] text-[10px] font-black text-[#ff5c3e] uppercase">
      {name.charAt(0)}
    </div>
    <div className="ml-2.5 flex-1 min-w-0">
      <div className="text-[12px] font-bold text-gray-100 truncate">{name}</div>
      <div className="text-[8px] font-bold text-[#8b92a5] opacity-70">Budget: 12,4 Mio €</div>
    </div>
    <div className="text-right mr-1">
      <div className="text-[13px] font-bold" style={{ color }}>{points}</div>
      <div className="text-[7px] font-bold text-[#626978] uppercase tracking-wider">Punkte</div>
    </div>
  </div>
);

const LigaMockup = () => (
  <div className="w-full">
    <div className="flex items-center gap-2 mb-3">
      <div className="w-1 h-3.5 rounded-full bg-[#3b82f6]"></div>
      <span className="text-[10px] font-black tracking-wider uppercase text-gray-300">Liga 1</span>
    </div>
    <MockUserRow rank={1} name="Justin" points="2.184" color="#3b82f6" trophy />
    <MockUserRow rank={2} name="Vinnie JR" points="2.011" color="#3b82f6" />
  </div>
);

const CompareMockup = () => (
  <div className="w-full flex items-center gap-2">
    <div className="flex-1 bg-[#1a1d24] border border-[#4ba6ff]/40 rounded-xl p-3 text-center">
      <div className="w-8 h-8 rounded-full bg-[#20242d] mx-auto mb-1.5 flex items-center justify-center text-[11px] font-black text-[#4ba6ff]">J</div>
      <div className="text-[10px] font-bold text-gray-200 truncate">Justin</div>
      <div className="text-[13px] font-black text-[#4ba6ff] mt-1">2.184</div>
    </div>
    <div className="text-[10px] font-black text-[#8b92a5] uppercase">vs</div>
    <div className="flex-1 bg-[#1a1d24] border border-[#ff5c3e]/40 rounded-xl p-3 text-center">
      <div className="w-8 h-8 rounded-full bg-[#20242d] mx-auto mb-1.5 flex items-center justify-center text-[11px] font-black text-[#ff5c3e]">V</div>
      <div className="text-[10px] font-bold text-gray-200 truncate">Vinnie JR</div>
      <div className="text-[13px] font-black text-[#ff5c3e] mt-1">2.011</div>
    </div>
  </div>
);

const OptimalTeamMockup = () => (
  <div className="w-full flex flex-col items-center gap-3">
    <div className="w-full bg-[#0f1115] border border-[#2a2e37] rounded-xl p-3">
      <div className="flex justify-around mb-2">
        {['TW', 'IV', 'IV'].map((p, i) => (
          <div key={i} className="w-6 h-6 rounded-full bg-[#20242d] border border-[#ff5c3e]/40 flex items-center justify-center text-[7px] font-black text-[#ff5c3e]">{p}</div>
        ))}
      </div>
      <div className="flex justify-around mb-2">
        {['ST', 'ST'].map((p, i) => (
          <div key={i} className="w-6 h-6 rounded-full bg-[#20242d] border border-[#ff5c3e]/40 flex items-center justify-center text-[7px] font-black text-[#ff5c3e]">{p}</div>
        ))}
      </div>
    </div>
    <div className="flex items-center gap-2 bg-[#1a1d24] text-[#ff5c3e] border border-[#ff5c3e]/30 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
      Die optimale Elf
    </div>
  </div>
);

const PokalMockup = () => (
  <div className="w-full flex items-center justify-center gap-2">
    <div className="flex flex-col gap-2">
      <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-lg px-2.5 py-1.5 w-24">
        <div className="text-[9px] font-bold text-white truncate">Justin</div>
        <div className="text-[9px] font-bold text-gray-500 truncate">Curl3z</div>
      </div>
      <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-lg px-2.5 py-1.5 w-24">
        <div className="text-[9px] font-bold text-gray-500 truncate">Blake</div>
        <div className="text-[9px] font-bold text-white truncate">Esel</div>
      </div>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a3f4a" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>
    <div className="bg-[#1a1d24] border-2 border-[#8b5cf6] rounded-lg px-2.5 py-1.5 w-24 shadow-[0_0_12px_rgba(139,92,246,0.3)]">
      <div className="text-[9px] font-bold text-white truncate">Justin</div>
      <div className="text-[9px] font-bold text-gray-500 truncate">Blake</div>
    </div>
  </div>
);

const AccountMockup = () => (
  <div className="w-full flex flex-col gap-1.5">
    {[
      { label: 'Regelkatalog', color: '#ff5c3e' },
      { label: 'Quali-Daten (Archiv)', color: '#8b92a5' },
      { label: 'Admin Panel', color: '#a855f7' }
    ].map((item) => (
      <div key={item.label} className="flex items-center gap-3 bg-[#1a1d24] border border-[#2a2e37] rounded-xl px-3 py-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${item.color}1A`, color: item.color }}>
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
        </div>
        <span className="text-[10px] font-bold text-gray-200 flex-1">{item.label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    ))}
  </div>
);

const CheckIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);

const WaveIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"></path>
    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"></path>
    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"></path>
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6.29-2.71l-4.3-5a2 2 0 1 1 3-2.5l2.59 3"></path>
  </svg>
);

const STEPS = [
  {
    icon: WaveIcon,
    color: '#ff5c3e',
    title: 'Willkommen im Ligasystem! 👋',
    text: 'Diese kurze Tour zeigt dir schon jetzt, wie die App aussieht und wo du später was findest.'
  },
  {
    color: '#3b82f6',
    title: 'Liga',
    text: 'Drei komplett unabhängige Ligen mit eigener Tabelle. Mit den Pfeilen oben wechselst du zwischen "Gesamt" und einzelnen Spieltagen.',
    visual: <LigaMockup />
  },
  {
    color: '#4ba6ff',
    title: 'Spielerdetails & Vergleich',
    text: 'Tippe auf einen Namen für Punkteverlauf & Formkurve - von dort aus kannst du zwei Spieler direkt miteinander vergleichen.',
    visual: <CompareMockup />
  },
  {
    color: '#ff5c3e',
    title: 'Die optimale Elf',
    text: 'Unten in der Liga-Ansicht zeigt dir dieser Button die stärkste mögliche Elf des jeweiligen Spieltags – über alle Spieler hinweg.',
    visual: <OptimalTeamMockup />
  },
  {
    color: '#8b5cf6',
    title: 'Pokal',
    text: 'K.-o.-System vom Sechzehntelfinale bis zum Finale, ausgelost aus der Qualifikationsrunde. Auf dem Handy wischen, am Desktop reinzoomen.',
    visual: <PokalMockup />
  },
  {
    color: '#8b92a5',
    title: 'Account',
    text: 'Hier findest du den Regelkatalog, die Pokal-Regeln, das Archiv der Qualifikationsrunde 25/26 und (für Admins) das Admin Panel.',
    visual: <AccountMockup />
  },
  {
    icon: CheckIcon,
    color: '#22c55e',
    title: 'Los geht\'s!',
    text: 'Das war\'s schon. Sobald du freigeschaltet bist, kannst du dir das Ganze auch nochmal live und interaktiv in der App ansehen. Viel Erfolg in deiner Liga!'
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

        <div className="p-6 pt-12 min-h-[400px] flex flex-col items-center text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center flex-1 w-full"
            >
              {current.visual ? (
                <div className="w-full bg-[#0f1115] border border-[#2a2e37] rounded-2xl p-4 mb-5">
                  {current.visual}
                </div>
              ) : (
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                  style={{ backgroundColor: `${current.color}1A`, color: current.color }}
                >
                  {current.icon}
                </div>
              )}
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
