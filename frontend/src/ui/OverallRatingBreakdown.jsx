import { TIER_ACCENT } from './FifaManagerCard';

// Zeigt, wie aus den einzelnen Bonis (Aktivitaet, Profit, Overpay, Punkte,
// Kaderrisiko, Scouting) am Ende der 0-100-Gesamtscore wird, der wiederum die
// Kartenstufe (Bronze/Silber/Gold) bestimmt. Nutzt calculation.overall aus
// calculate-ratings.js 1:1.

const fmtSigned1 = (val) => `${val > 0 ? '+' : ''}${val.toFixed(1).replace('.', ',')}`;

const TIERS = [
  { range: '0–44', name: 'Amateur', tierHint: '(Bronze-Karte)', min: 0, max: 44 },
  { range: '45–59', name: 'Bronze', tierHint: '', min: 45, max: 59 },
  { range: '60–74', name: 'Silber', tierHint: '', min: 60, max: 74 },
  { range: '75–89', name: 'Gold', tierHint: '', min: 75, max: 89 },
  { range: '90–100', name: 'Elite', tierHint: '(Gold-Karte)', min: 90, max: 100 },
];

const Row = ({ label, value, isFinal }) => (
  <div className={`flex items-center justify-between py-1.5 ${isFinal ? 'border-t border-[#2a2a2a] mt-1 pt-2' : ''}`}>
    <span className={`text-[13px] ${isFinal ? 'font-bold text-white' : 'text-gray-400'}`}>{label}</span>
    <span className={`text-[13px] font-mono tabular-nums ${isFinal ? 'font-black text-white text-base' : 'text-gray-200'}`}>{value}</span>
  </div>
);

export default function OverallRatingBreakdown({ rating }) {
  const { calculation, level, cardTier } = rating;
  if (!calculation?.overall) return null;
  const o = calculation.overall;
  const accent = TIER_ACCENT[cardTier] || TIER_ACCENT.bronze;

  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8b92a5] mb-1">Gesamtrating</div>
      <p className="text-[11px] text-gray-500 mb-3">Alle Boni zusammen ergeben deinen Score von 0–100 - der wiederum deine Kartenstufe festlegt.</p>

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-3.5">
        <Row label="Basiswert" value={o.baseScore} />
        <Row label="Aktivität" value={fmtSigned1(o.activityBonus)} />
        <Row label="Profit" value={fmtSigned1(o.profitBonus)} />
        <Row label="Overpay" value={fmtSigned1(o.overpayBonus)} />
        <Row label="Punkte" value={fmtSigned1(o.performanceBonus)} />
        <Row label="Kader-Risiko" value={fmtSigned1(o.squadRiskPenalty)} />
        {o.scoutingBonus > 0 && <Row label="Scouting-Bonus" value={fmtSigned1(o.scoutingBonus)} />}
        <Row label="Gesamtrating" value={o.finalScore} isFinal />
        <p className="text-[10px] text-gray-600 mt-2">Nach Rundung und Begrenzung auf 0–100.</p>
      </div>

      <div className="mt-3 space-y-1">
        {TIERS.map((t) => {
          const isCurrent = t.name === level;
          return (
            <div
              key={t.name}
              className="flex items-center gap-3 px-3 py-2 rounded-lg"
              style={isCurrent ? { backgroundColor: `${accent}1A`, border: `1px solid ${accent}66` } : undefined}
            >
              <span className="text-[11px] font-mono text-gray-500 w-14 shrink-0">{t.range}</span>
              <span className={`text-[12px] flex-1 ${isCurrent ? 'font-bold text-white' : 'text-gray-400'}`}>
                {t.name} {t.tierHint && <span className="text-gray-600">{t.tierHint}</span>}
              </span>
              {isCurrent && <span className="text-[10px] font-black uppercase tracking-widest shrink-0" style={{ color: accent }}>du bist hier</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
