import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ManagerRatingBadge = ({ kickbaseId }) => {
  const [rating, setRating] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch('/history/manager-ratings.json')
      .then(res => res.json())
      .then(data => {
        if (data[kickbaseId]) setRating(data[kickbaseId]);
      })
      .catch(err => console.error("Could not load ratings", err));
  }, [kickbaseId]);

  if (!rating) return null;

  let color = '#3b82f6'; // Blau (Bronze)
  if (rating.score >= 90) color = '#eab308'; // Gold (Elite)
  else if (rating.score >= 75) color = '#a855f7'; // Lila (Silber)
  else if (rating.score < 50) color = '#ef4444'; // Rot (Grau)

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="relative flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform"
        style={{ width: '42px', height: '46px' }}
      >
        <div 
          className="absolute inset-0" 
          style={{ 
            backgroundColor: color, 
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            opacity: 0.15
          }}
        />
        <div 
          className="absolute inset-[2px] bg-[#1f1f1f] flex flex-col items-center justify-center" 
          style={{ 
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          }}
        >
          <span className="text-[14px] font-black leading-none mt-0.5" style={{ color }}>{rating.score}</span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 sm:p-0"
            onClick={() => setIsOpen(false)}
          >
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-[#171717] border border-[#2e2e2e] rounded-3xl p-6 flex flex-col gap-6"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-black text-white">Manager Rating</h2>
                  <p className="text-sm text-gray-400 mt-1">Trading & Performance Analytics</p>
                </div>
                <button onClick={() => setIsOpen(false)} className="w-8 h-8 bg-[#2a2a2a] rounded-full flex items-center justify-center text-gray-400">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>

              <div className="flex items-center justify-center py-4">
                <div className="relative w-32 h-32 flex items-center justify-center rounded-full border-4" style={{ borderColor: color }}>
                  <div className="text-5xl font-black" style={{ color }}>{rating.score}</div>
                  <div className="absolute -bottom-3 bg-[#171717] px-3 font-bold text-[10px] tracking-widest uppercase rounded-full border" style={{ borderColor: color, color }}>
                    {rating.level}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="bg-[#1f1f1f] rounded-xl p-2 border border-[#2a2a2a]">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Trading</div>
                  <div className="text-sm font-black text-white">{rating.financialScore}</div>
                </div>
                <div className="bg-[#1f1f1f] rounded-xl p-2 border border-[#2a2a2a]">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">PPM</div>
                  <div className="text-sm font-black text-white">{rating.performanceScore}</div>
                </div>
                <div className="bg-[#1f1f1f] rounded-xl p-2 border border-[#2a2a2a]">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Aktivität</div>
                  <div className="text-sm font-black text-white">{rating.rebuildScore}</div>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Abgeschlossene Trades</span>
                  <span className="font-bold text-white">{rating.tradesCount}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Trading-Gewinn</span>
                  <span className={`font-bold ${rating.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {rating.totalProfit > 0 ? '+' : ''}{rating.totalProfit.toLocaleString('de-DE')} €
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Performance (Punkte pro 1M)</span>
                  <span className="font-bold text-white">{rating.ppm.toFixed(1)} Pkt.</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Gesamtes Overpay</span>
                  <span className="font-bold text-red-400">{rating.totalOverpay.toLocaleString('de-DE')} € <span className="text-[10px] text-gray-500 font-normal ml-1">(coming soon)</span></span>
                </div>
              </div>

              <button onClick={() => setIsOpen(false)} className="w-full bg-[#ff5c3e] text-white font-bold py-3.5 rounded-xl mt-2 active:scale-[0.98] transition-transform">
                Schließen
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ManagerRatingBadge;
