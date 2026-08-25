import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const tradeTag = (trade) => {
  if (!trade || !trade.type) return null;
  const labels = { realized: null, open: 'offen', orphan: 'zugelost' };
  const parts = [];
  if (labels[trade.type]) parts.push(labels[trade.type]);
  if (trade.forced) parts.push('Zwangsverkauf');
  if (parts.length === 0) return null;
  return <span className="text-gray-500"> ({parts.join(', ')})</span>;
};

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
              className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-[#171717] border border-[#2e2e2e] rounded-3xl p-6 flex flex-col gap-6"
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

              {typeof rating.squadReadiness === 'number' && (
                <div className="bg-[#1f1f1f] rounded-xl p-3 border border-[#2a2a2a]">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Kaderstatus</span>
                    <span className="text-[10px] font-bold text-gray-300">{rating.squadTotal} Spieler · {rating.budget.toLocaleString('de-DE')} € Budget</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(rating.squadReadiness * 100)}%`,
                        backgroundColor: rating.squadReadiness >= 1 ? '#22c55e' : rating.squadReadiness >= 0.7 ? '#eab308' : '#ef4444'
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-[10px] text-gray-500">
                      {rating.squadReadiness >= 1 ? 'Startelf-fähig' : `${Math.round(rating.squadReadiness * 100)}% startelf-fähig`}
                      {rating.budget < 0 && <span className="text-red-400 font-bold"> · Budget im Minus</span>}
                    </span>
                    {rating.squadRiskPenalty < -0.5 && (
                      <span className="text-[10px] font-bold text-red-400">{rating.squadRiskPenalty.toFixed(0)} Pkt. Risiko</span>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-4 pt-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">
                    Abgeschlossene Trades
                    {rating.forcedCompletedTrades > 0 && (
                      <span className="text-gray-500"> ({rating.forcedCompletedTrades}x Zwangsverkauf)</span>
                    )}
                  </span>
                  <span className="font-bold text-white">{rating.completedTrades ?? rating.tradesCount}</span>
                </div>
                {rating.openPositions > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">
                      Offene Positionen (unrealisiert)
                      {typeof rating.openPositionsAvgAgeDays === 'number' && (
                        <span className="text-gray-500"> · Ø {rating.openPositionsAvgAgeDays < 1 ? '<1' : Math.round(rating.openPositionsAvgAgeDays)} Tag{rating.openPositionsAvgAgeDays >= 1.5 ? 'e' : ''} gehalten</span>
                      )}
                    </span>
                    <span className={`font-bold ${rating.unrealizedProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {rating.openPositions}x · {rating.unrealizedProfit > 0 ? '+' : ''}{rating.unrealizedProfit.toLocaleString('de-DE')} €
                    </span>
                  </div>
                )}
                {rating.orphanSales > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">
                      Kaderverkäufe (zugelost)
                      {rating.forcedOrphanSales > 0 && (
                        <span className="text-gray-500"> ({rating.forcedOrphanSales}x Zwangsverkauf)</span>
                      )}
                    </span>
                    <span className={`font-bold ${rating.orphanSaleProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {rating.orphanSales}x · {rating.orphanSaleProfit > 0 ? '+' : ''}{rating.orphanSaleProfit.toLocaleString('de-DE')} €
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm border-t border-[#2a2a2a] pt-3">
                  <span className="text-gray-400">Trading-Gewinn (gesamt)</span>
                  <span className={`font-bold ${rating.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {rating.totalProfit > 0 ? '+' : ''}{rating.totalProfit.toLocaleString('de-DE')} €
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Performance (Punkte pro 1M)</span>
                  <span className="font-bold text-white">{rating.ppm.toFixed(1)} Pkt.</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Ø Aufschlag über Marktwert</span>
                  <span className="font-bold text-red-400">
                    {rating.avgOverpayRatio ? `+${(rating.avgOverpayRatio * 100).toFixed(1)}%` : '–'}
                    {' · '}{rating.totalOverpay.toLocaleString('de-DE')} €
                  </span>
                </div>
                {rating.saleTimingSampleSize > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">
                      Verkaufs-Timing
                      <span className="text-gray-500"> · {rating.saleTimingSampleSize}x ausgewertet</span>
                    </span>
                    <span className={`font-bold ${rating.saleTimingProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {rating.saleTimingProfit > 0 ? '+' : ''}{Math.round(rating.saleTimingProfit).toLocaleString('de-DE')} €
                    </span>
                  </div>
                )}
              </div>

              {/* Top & Flop */}
              {(rating.bestTrade.profit !== 0 || rating.worstTrade.profit !== 0) && (
                <div className="mt-2 bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl p-3 space-y-2 text-xs">
                  {rating.bestTrade.profit > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">🏆 Top Trade: <span className="text-white font-medium">{rating.bestTrade.name}</span>{tradeTag(rating.bestTrade)}</span>
                      <span className="font-bold text-green-500">+{rating.bestTrade.profit.toLocaleString('de-DE')} €</span>
                    </div>
                  )}
                  {rating.worstTrade.profit < 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">📉 Flop Trade: <span className="text-white font-medium">{rating.worstTrade.name}</span>{tradeTag(rating.worstTrade)}</span>
                      <span className="font-bold text-red-500">{rating.worstTrade.profit.toLocaleString('de-DE')} €</span>
                    </div>
                  )}
                </div>
              )}

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
