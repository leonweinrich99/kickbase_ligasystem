import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import logo from './assets/logo.png';

const FEATURES = [
  'Drei unabhängige Ligen im Vergleich',
  'Pokal im K.-o.-System',
  'Die Top Elf des Spieltags',
  'Punkteverlauf & Formkurve im Detail',
  'Spieler direkt miteinander vergleichen'
];

// Markanter Splash-Screen für Ladezustände (App-Start, Datenabruf), damit die
// Wartezeit nicht als leerer, toter Bildschirm wirkt, sondern gleich ein paar
// Features der App zeigt.
const LoadingScreen = () => {
  const [featureIndex, setFeatureIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFeatureIndex((i) => (i + 1) % FEATURES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="flex flex-col items-center"
      >
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="w-32 h-32 sm:w-40 sm:h-40 mb-6 drop-shadow-[0_0_40px_rgba(255,92,62,0.3)]"
        >
          <img src={logo} alt="Kickbase Liga Logo" className="w-full h-full object-contain" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center"
        >
          <div className="text-xs font-bold tracking-[0.25em] text-[#ff5c3e] mb-2">SAISON 26/27</div>
          <div className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">Ligasystem</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          className="mt-8 h-[3px] w-32 rounded-full bg-[#171717] overflow-hidden"
        >
          <motion.div
            className="h-full w-1/3 rounded-full bg-[#ff5c3e]"
            animate={{ x: ['-100%', '350%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        <div className="h-10 mt-6 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={featureIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35 }}
              className="text-xs sm:text-sm text-[#8b92a5] font-medium text-center max-w-xs"
            >
              {FEATURES[featureIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default LoadingScreen;
