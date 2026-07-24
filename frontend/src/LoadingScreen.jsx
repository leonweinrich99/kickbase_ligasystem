import React from 'react';
import { motion } from 'framer-motion';
import logo from './assets/logo.png';

// Markanter Splash-Screen für Ladezustände (App-Start, Datenabruf), damit die
// kurze Wartezeit nicht als leerer, toter Bildschirm wirkt.
const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0f1115] flex flex-col items-center justify-center">
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center"
    >
      <motion.div
        animate={{ scale: [1, 1.07, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className="w-20 h-20 sm:w-24 sm:h-24 mb-5 drop-shadow-[0_0_25px_rgba(255,92,62,0.25)]"
      >
        <img src={logo} alt="Kickbase Liga Logo" className="w-full h-full object-contain" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="text-center"
      >
        <div className="text-[10px] font-bold tracking-[0.2em] text-[#ff5c3e] mb-1.5">SAISON 26/27</div>
        <div className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">Ligasystem</div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="mt-6 h-[3px] w-24 rounded-full bg-[#1a1d24] overflow-hidden"
      >
        <motion.div
          className="h-full w-1/3 rounded-full bg-[#ff5c3e]"
          animate={{ x: ['-100%', '250%'] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.div>
  </div>
);

export default LoadingScreen;
