import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Wallet, Zap, Activity,
  Users, Clock, Shuffle, CheckCircle2, Trophy, ShoppingCart
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import StatTile from './ui/StatTile';
import MetricRow from './ui/MetricRow';
import { LEVEL_THEME } from './ManagerRatingBadge';

// Vollbild-Seite (eigene Route /account/manager-rating) statt Bottom-Sheet-
// Modal - gleiche Design-Strategie wie UserDetail/OptimalTeam: sticky Header
// mit Zurueck-Button, Inhalt direkt darunter, kein Card-Rahmen mehr.

const fmtEUR = (val) => `${Math.round(val).toLocaleString('de-DE')} €`;
const fmtSignedEUR = (val) => `${val > 0 ? '+' : ''}${fmtEUR(val)}`;

const SectionLabel = ({ children }) => (
  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8b92a5] mb-2">{children}</div>
);

function tradeTagText(trade) {
  if (!trade || !trade.type) return null;
  const labels = { realized: 'Abgeschlossener Trade', open: 'Noch offene Position', orphan: 'Zugeloster Kaderspieler' };
  const parts = [];
  if (labels[trade.type]) parts.push(labels[trade.type]);
  if (trade.forced) parts.push('Pflichtverkauf');
  return parts.join(' · ') || null;
}

const ManagerRatingPage = () => {
  const { profile } = useAuth();
  const kickbaseId = profile?.kickbaseId;
  const goBack = useBackNavigation('/account');
  const [rating, setRating] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kickbaseId) {
      setLoading(false);
      return;
    }
    fetch('/history/manager-ratings.json')
      .then(res => res.json())
      .then(data => {
        setRating(data[kickbaseId] || null);
        setLoading(false);
      })
      .catch(err => {
        console.error("Could not load ratings", err);
        setLoading(false);
      });
  }, [kickbaseId]);

  if (loading) {
    return <div className="min-h-screen bg-[#000000]"></div>;
  }

  if (!rating) {
    return (
      <div className="min-h-screen bg-[#000000] flex flex-col justify-center items-center gap-6 p-4 text-center">
        <div className="text-gray-400 text-lg font-bold">Noch kein Manager Rating verfügbar</div>
        <button
          onClick={goBack}
          className="bg-[#171717] border border-[#2e2e2e] px-6 py-3 rounded-xl text-gray-300 hover:text-white hover:border-[#ff5c3e] transition-all"
        >
          Zurück zum Account
        </button>
      </div>
    );
  }

  const color = LEVEL_THEME[rating.level] || LEVEL_THEME.Bronze;
  const profitColor = (val) => (val >= 0 ? 'text-green-500' : 'text-red-500');

  return (
    <div className="w-full bg-[#000000] min-h-screen relative flex flex-col pb-10">
      {/* Header mit Zurueck-Button (Page-Look) */}
      <div className="sticky top-0 z-40 bg-[#000000]/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#2e2e2e]/50">
        <BackButton onClick={goBack} />
        <span className="text-xs font-bold uppercase tracking-wider text-[#8b92a5]">Manager Rating</span>
      </div>

      <div className="max-w-[600px] w-full mx-auto pt-6 pb-8 px-4 sm:px-6 flex flex-col gap-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-tight">Manager Rating</h2>
          <p className="text-sm text-[#8b92a5] mt-1">Wie gut managst du deinen Kader?</p>
        </div>

        {/* Score */}
        <div className="flex items-center justify-center py-2">
          <div className="relative w-32 h-32 flex items-center justify-center rounded-full border-4" style={{ borderColor: color }}>
            <div className="text-5xl font-black" style={{ color }}>{rating.score}</div>
            <div className="absolute -bottom-3 bg-[#000] px-3 font-bold text-[10px] tracking-widest uppercase rounded-full border" style={{ borderColor: color, color }}>
              {rating.level}
            </div>
          </div>
        </div>

        {/* Teilscores mit Klartext-Erklärung statt nackter Zahl */}
        <div>
          <SectionLabel>Wie setzt sich der Score zusammen?</SectionLabel>
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatTile icon={Wallet} iconColor="#22c55e" value={rating.financialScore} label="Kauf & Verkauf" />
            <StatTile icon={Zap} iconColor="#eab308" value={rating.performanceScore} label="Pkt. pro Mio." />
            <StatTile icon={Activity} iconColor="#3b82f6" value={rating.rebuildScore} label="Marktaktivität" />
          </div>
        </div>

        {/* Kaderstatus */}
        {typeof rating.squadReadiness === 'number' && (
          <div>
            <SectionLabel>Kaderstatus</SectionLabel>
            <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#2a2a2a]">
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#3b82f61A', color: '#3b82f6' }}>
                  <Users size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">
                    {rating.squadReadiness >= 1 ? 'Startelf-fähig' : `${Math.round(rating.squadReadiness * 100)}% startelf-fähig`}
                  </div>
                  <div className="text-[11px] text-gray-500">{rating.squadTotal} Spieler im Kader</div>
                </div>
                <div className="text-sm font-black text-gray-200 shrink-0 text-right">{fmtEUR(rating.budget)}</div>
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
              {(rating.budget < 0 || rating.squadRiskPenalty < -0.5) && (
                <div className="text-[11px] text-red-400 font-bold mt-2">
                  {rating.budget < 0 ? 'Budget im Minus – ' : ''}
                  Risiko kostet dich {Math.abs(Math.round(rating.squadRiskPenalty))} Punkte im Score
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trades & Verkäufe */}
        <div>
          <SectionLabel>Trades & Verkäufe</SectionLabel>
          <div className="space-y-2">
            <MetricRow
              icon={CheckCircle2}
              iconColor="#22c55e"
              title={`${rating.completedTrades ?? rating.tradesCount} abgeschlossene Trades`}
              description={rating.forcedCompletedTrades > 0 ? `Davon ${rating.forcedCompletedTrades}x Pflichtverkauf (250-Punkte-Regel)` : 'Gekauft und wieder verkauft'}
              value={fmtSignedEUR(rating.realizedProfit)}
              valueColor={profitColor(rating.realizedProfit)}
            />
            {rating.openPositions > 0 && (
              <MetricRow
                icon={Clock}
                iconColor="#3b82f6"
                title={`${rating.openPositions} offene Positionen`}
                description={`Noch nicht verkauft${typeof rating.openPositionsAvgAgeDays === 'number' ? ` · Ø ${rating.openPositionsAvgAgeDays < 1 ? '<1' : Math.round(rating.openPositionsAvgAgeDays)} Tag${rating.openPositionsAvgAgeDays >= 1.5 ? 'e' : ''} gehalten` : ''}`}
                value={fmtSignedEUR(rating.unrealizedProfit)}
                valueColor={profitColor(rating.unrealizedProfit)}
              />
            )}
            {rating.orphanSales > 0 && (
              <MetricRow
                icon={Shuffle}
                iconColor="#8b5cf6"
                title={`${rating.orphanSales} Kaderverkäufe`}
                description={rating.forcedOrphanSales > 0 ? `Zugeloste Spieler · davon ${rating.forcedOrphanSales}x Pflichtverkauf` : 'Zugeloste Spieler ohne Kaufpreis'}
                value={fmtSignedEUR(rating.orphanSaleProfit)}
                valueColor={profitColor(rating.orphanSaleProfit)}
              />
            )}
          </div>
        </div>

        {/* Gesamtbilanz - die wichtigste Zahl, deshalb visuell hervorgehoben */}
        <div
          className="rounded-2xl p-4 flex items-center gap-3 border-2"
          style={{ borderColor: rating.totalProfit >= 0 ? '#22c55e' : '#ef4444', backgroundColor: rating.totalProfit >= 0 ? '#22c55e0D' : '#ef44440D' }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: rating.totalProfit >= 0 ? '#22c55e1A' : '#ef44441A', color: rating.totalProfit >= 0 ? '#22c55e' : '#ef4444' }}
          >
            {rating.totalProfit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Gesamtbilanz</div>
            <div className="text-[11px] text-gray-500">Realisiert + offen + Kaderverkäufe</div>
          </div>
          <div className={`text-xl font-black shrink-0 ${profitColor(rating.totalProfit)}`}>{fmtSignedEUR(rating.totalProfit)}</div>
        </div>

        {/* Verkaufsgespür - bewusst von der Gesamtbilanz getrennt: das ist KEIN
            echtes Geld, sondern eine Was-wäre-wenn-Kennzahl (siehe Erklärtext). */}
        {rating.saleTimingSampleSize > 0 && (
          <div className="rounded-xl p-3 border border-dashed border-[#3a3a3a] bg-[#0a0a0a]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[#06b6d41A] text-[#06b6d4]">
                <TrendingUp size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">
                  {rating.saleTimingProfit >= 0 ? 'Vermiedener Wertverlust' : 'Entgangener Gewinn'}
                </div>
                <div className="text-[11px] text-gray-500">
                  Wenn du deine {rating.saleTimingSampleSize} verkauften Spieler behalten hättest, wären sie heute {rating.saleTimingProfit >= 0 ? 'weniger' : 'mehr'} wert
                </div>
              </div>
              <div className={`text-sm font-black shrink-0 text-right ${profitColor(rating.saleTimingProfit)}`}>{fmtSignedEUR(rating.saleTimingProfit)}</div>
            </div>
            <p className="text-[10px] text-gray-600 mt-2 pl-12">Kein Kontostand-Effekt – zeigt nur, ob der Verkaufszeitpunkt im Nachhinein clever war.</p>
          </div>
        )}

        {/* Kaufverhalten */}
        <div>
          <SectionLabel>Kaufverhalten</SectionLabel>
          <MetricRow
            icon={ShoppingCart}
            iconColor="#f97316"
            title="Ø Aufschlag beim Kauf"
            description={rating.avgOverpayRatio ? `${fmtEUR(rating.totalOverpay)} über Marktwert bezahlt` : 'Noch keine Daten'}
            value={rating.avgOverpayRatio ? `+${(rating.avgOverpayRatio * 100).toFixed(1)}%` : '–'}
            valueColor="text-orange-400"
          />
          <p className="text-[10px] text-gray-500 mt-2 px-1">Underpay ist verboten – ein kleiner Aufschlag ist normal, ein großer bedeutet Bieterkrieg.</p>
        </div>

        {/* Top & Flop */}
        {(rating.bestTrade.profit !== 0 || rating.worstTrade.profit !== 0) && (
          <div>
            <SectionLabel>Bester & schlechtester Trade</SectionLabel>
            <div className="space-y-2">
              {rating.bestTrade.profit > 0 && (
                <MetricRow
                  icon={Trophy}
                  iconColor="#eab308"
                  title={rating.bestTrade.name}
                  description={tradeTagText(rating.bestTrade) || 'Top Trade'}
                  value={fmtSignedEUR(rating.bestTrade.profit)}
                  valueColor="text-green-500"
                />
              )}
              {rating.worstTrade.profit < 0 && (
                <MetricRow
                  icon={TrendingDown}
                  iconColor="#ef4444"
                  title={rating.worstTrade.name}
                  description={tradeTagText(rating.worstTrade) || 'Flop Trade'}
                  value={fmtSignedEUR(rating.worstTrade.profit)}
                  valueColor="text-red-500"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagerRatingPage;
