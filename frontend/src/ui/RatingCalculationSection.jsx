import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TIER_ACCENT } from './FifaManagerCard';

// "So wird deine Karte berechnet" - sechs Karten, die zu jedem FIFA-Karten-
// Attribut (PRO/OVP/PKT/AKT/KAD/TIM) zeigen, welche Rohdaten aus der
// Trading-Historie einfliessen. Nutzt bewusst dieselben Rohdaten, die das
// Backend tatsaechlich verwendet hat (rating.calculation, siehe
// calculate-ratings.js), statt einer im Frontend nachgebauten Kopie.
//
// Bewusst OHNE die exakte mathematische Formel (zu technisch fuer die
// Kachel-Ansicht) - stattdessen die Einflussfaktoren als kompakte, klar
// lesbare Kacheln statt reinem Fliesstext. Jede Karte faerbt sich in Bronze/
// Silber/Gold je nach IHREM EIGENEN Wert (nicht der Gesamtkarten-Stufe) - so
// sieht man auf einen Blick, welche der 6 Faehigkeiten stark bzw. schwach
// sind. OVP und AKT zeigen zusaetzlich einen Liga-Vergleich (Prozentrang +
// aufklappbare Werteliste aller echten Liga-Kollegen statt eines abstrakten
// Fixwerts).

const fmtEUR = (val) => `${Math.round(val).toLocaleString('de-DE')} €`;
const fmtSignedEUR = (val) => `${val > 0 ? '+' : ''}${fmtEUR(val)}`;
const fmtPct = (val) => `${(val * 100).toFixed(1).replace('.', ',')} %`;
const fmtNum1 = (val) => val.toFixed(1).replace('.', ',');

// Gleiche Bronze/Silber/Gold-Grenzen wie beim Gesamtrating (siehe
// computeCardTier in calculate-ratings.js: <60 Bronze, 60-74 Silber, ab 75
// Gold) - hier auf den EINZELNEN Kartenwert (1-99) angewendet statt auf den
// 0-100-Gesamtscore.
const scoreToTier = (score) => (score >= 75 ? 'gold' : score >= 60 ? 'silver' : 'bronze');

// Kompakte Wert+Label-Kachel fuer einen einzelnen Einflussfaktor - ersetzt
// die vorherigen reinen Textzeilen untereinander. `highlight` spannt die
// Kachel ueber beide Spalten und hebt sie als "die eine wichtige Zahl" hervor.
const FactorChip = ({ value, label, highlight }) => (
  <div className={`rounded-lg px-3 py-2.5 bg-[#0a0a0a] border border-[#242424] ${highlight ? 'col-span-2' : ''}`}>
    <div className={`font-black text-white leading-tight tabular-nums ${highlight ? 'text-lg' : 'text-[15px]'}`}>{value}</div>
    <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-1">{label}</div>
  </div>
);

const FactorGrid = ({ children }) => (
  <div className="grid grid-cols-2 gap-2">{children}</div>
);

// Liga-Vergleich als kleiner Fortschrittsbalken statt Zahlenfriedhof: "besser
// als X% der Liga" + Platzierung, direkt visuell statt nur als Text.
const LeagueCompareBar = ({ percentile, rank, total, accent }) => {
  if (percentile == null) return null;
  return (
    <div className="col-span-2 rounded-lg p-3 bg-[#0a0a0a] border border-[#242424]">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[12px] font-bold text-white">Besser als {Math.round(percentile)}% deiner Liga</span>
        {rank != null && total != null && (
          <span className="text-[10px] font-bold text-gray-500 shrink-0">Platz {rank}/{total}</span>
        )}
      </div>
      <div className="w-full h-2 bg-[#242424] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(4, Math.round(percentile))}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
};

// Aufklappbare Liste ALLER Liga-Kollegen fuer eine Metrik - beantwortet "was
// haben die anderen denn für Werte?" konkret statt nur ueber einen Prozentrang.
const LeaguePeerList = ({ peers, formatValue }) => {
  const [open, setOpen] = useState(false);
  if (!peers || peers.length < 2) return null;
  return (
    <div className="col-span-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-center text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors py-1.5"
      >
        {open ? 'Werte ausblenden ▲' : 'Alle Werte der Liga anzeigen ▼'}
      </button>
      {open && (
        <div className="mt-1 rounded-lg border border-[#242424] overflow-hidden">
          {peers.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              className={`flex items-center justify-between px-3 py-2 text-[12px] ${i > 0 ? 'border-t border-[#242424]' : ''} ${p.isYou ? 'bg-[#ffffff0d]' : ''}`}
            >
              <span className={`flex items-center gap-2 min-w-0 ${p.isYou ? 'font-bold text-white' : 'text-gray-400'}`}>
                <span className="text-gray-600 w-4 shrink-0">{i + 1}.</span>
                <span className="truncate">{p.name}</span>
                {p.isYou && <span className="text-[9px] font-black uppercase text-gray-500 shrink-0">Du</span>}
              </span>
              <span className={`font-bold shrink-0 ${p.isYou ? 'text-white' : 'text-gray-300'}`}>{formatValue(p.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ children }) => (
  <div className="text-[12px] text-gray-500 leading-snug bg-[#0a0a0a] border border-dashed border-[#2a2a2a] rounded-lg p-3">
    {children}
  </div>
);

function StatCalcCard({ label, title, score, isOpen, onToggle, factors, emptyNote }) {
  const accent = TIER_ACCENT[scoreToTier(score)];
  return (
    <div
      className="bg-[#141414] border border-[#2a2a2a] rounded-xl overflow-hidden"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3.5 text-left"
      >
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 font-black text-[13px]"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          {label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">{title}</div>
          {emptyNote && !isOpen && <div className="text-[11px] text-gray-500 truncate">{emptyNote}</div>}
        </div>
        <div className="text-xl font-black shrink-0" style={{ color: accent }}>{score}</div>
        <ChevronDown size={16} className={`text-gray-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-3.5 pb-3.5 -mt-1">{factors}</div>}
    </div>
  );
}

export default function RatingCalculationSection({ calculation, ovpLeaguePeers, aktLeaguePeers }) {
  const [openKey, setOpenKey] = useState(null);
  if (!calculation) return null;
  const toggle = (key) => setOpenKey((cur) => (cur === key ? null : key));

  const { pro, ovp, pkt, akt, kad, tim } = calculation;
  const ovpAccent = TIER_ACCENT[scoreToTier(ovp.score)];
  const aktAccent = TIER_ACCENT[scoreToTier(akt.score)];

  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8b92a5] mb-1">So wird deine Karte berechnet</div>
      <p className="text-[11px] text-gray-500 mb-3">Die Einflussfaktoren aus deiner Trading-Historie hinter jedem Kartenwert (1–99) - eingefärbt wie eine eigene Bronze-/Silber-/Gold-Bewertung.</p>

      <div className="space-y-2">
        {/* PRO */}
        <StatCalcCard
          label="PRO" title="Profit" score={pro.score}
          isOpen={openKey === 'pro'} onToggle={() => toggle('pro')}
          emptyNote={pro.weightedAverageProfit == null ? 'Noch keine Trades' : undefined}
          factors={pro.weightedAverageProfit == null ? (
            <EmptyState>Noch keine bewerteten Trades vorhanden – Wert bleibt neutral bei 50.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip value={fmtSignedEUR(pro.weightedAverageProfit)} label="Gewichteter Ø-Gewinn" highlight />
              <FactorChip value={pro.completedTrades} label="Abgeschl. Trades" />
              <FactorChip value={pro.openPositions} label="Offene Positionen" />
              <FactorChip value={pro.orphanSales} label="Kaderverkäufe" />
              {pro.saleTimingSampleSize > 0 && <FactorChip value={pro.saleTimingSampleSize} label="Verkaufszeitpunkte" />}
            </FactorGrid>
          )}
        />

        {/* OVP */}
        <StatCalcCard
          label="OVP" title="Overpay-Disziplin" score={ovp.score}
          isOpen={openKey === 'ovp'} onToggle={() => toggle('ovp')}
          emptyNote={ovp.averageOverpayRatio == null ? 'Noch keine Käufe' : undefined}
          factors={ovp.averageOverpayRatio == null ? (
            <EmptyState>Noch keine Käufe mit bekanntem Marktwert – Wert bleibt neutral bei 50.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip value={fmtPct(ovp.averageOverpayRatio)} label="Ø Aufschlag beim Kauf" highlight />
              <FactorChip value={ovp.purchaseCount} label="Analysierte Käufe" highlight />
              <LeagueCompareBar percentile={ovp.leaguePercentile} rank={ovp.leagueRank} total={ovp.leagueSize} accent={ovpAccent} />
              <LeaguePeerList peers={ovpLeaguePeers} formatValue={fmtPct} />
            </FactorGrid>
          )}
        />

        {/* PKT */}
        <StatCalcCard
          label="PKT" title="Punkte pro Million" score={pkt.score}
          isOpen={openKey === 'pkt'} onToggle={() => toggle('pkt')}
          emptyNote={pkt.ppm == null ? 'Noch keine Punktedaten' : undefined}
          factors={pkt.ppm == null ? (
            <EmptyState>Noch keine Punktedaten vorhanden – Wert bleibt neutral bei 50, sobald die Saison Punkte liefert wird er live berechnet.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip value={fmtNum1(pkt.ppm)} label="Punkte pro Million" highlight />
              <FactorChip value={pkt.points.toLocaleString('de-DE')} label="Liga-Punkte" />
              <FactorChip value={fmtEUR(pkt.totalSpent)} label="Investierte Summe" />
            </FactorGrid>
          )}
        />

        {/* AKT */}
        <StatCalcCard
          label="AKT" title="Marktaktivität" score={akt.score}
          isOpen={openKey === 'akt'} onToggle={() => toggle('akt')}
          factors={(
            <FactorGrid>
              <FactorChip value={akt.totalTransactions} label="Transaktionen gesamt" highlight />
              <FactorChip value={akt.buys} label="Käufe" />
              <FactorChip value={akt.sells} label="Verkäufe" />
              <LeagueCompareBar percentile={akt.leaguePercentile} rank={akt.leagueRank} total={akt.leagueSize} accent={aktAccent} />
              <LeaguePeerList peers={aktLeaguePeers} formatValue={(v) => `${v}`} />
            </FactorGrid>
          )}
        />

        {/* KAD */}
        <StatCalcCard
          label="KAD" title="Kaderstärke & Risiko" score={kad.score}
          isOpen={openKey === 'kad'} onToggle={() => toggle('kad')}
          emptyNote={kad.squadReadiness == null ? 'Keine Kaderdaten' : undefined}
          factors={kad.squadReadiness == null ? (
            <EmptyState>Keine Kaderdaten verfügbar – Wert bleibt neutral bei 50.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip value={`${Math.round(kad.squadReadiness * 100)} %`} label="Ø Startelf-Wahrscheinlichkeit" highlight />
              <FactorChip value={kad.squadTotal} label="Spieler im Kader" />
              {kad.squadHeadcountReadiness != null && (
                <FactorChip value={`${Math.round(kad.squadHeadcountReadiness * 100)} %`} label="Nur nach Kopfzahl" />
              )}
              <FactorChip value={fmtEUR(kad.budget)} label="Budget" />
              <FactorChip value={`${fmtNum1(Math.abs(kad.squadRiskPenalty))} / 20`} label="Kader-Risiko" />
            </FactorGrid>
          )}
        />

        {/* TIM */}
        <StatCalcCard
          label="TIM" title="Verkaufstiming" score={tim.score}
          isOpen={openKey === 'tim'} onToggle={() => toggle('tim')}
          emptyNote={tim.sampleSize === 0 ? 'Noch keine bewertbaren Verkäufe' : undefined}
          factors={tim.sampleSize === 0 ? (
            <EmptyState>Noch keine bewertbaren Verkäufe – Wert bleibt neutral bei 50.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip
                value={fmtSignedEUR(tim.averageTimingProfit)}
                label={tim.averageTimingProfit >= 0 ? 'Ø vermiedener Wertverlust' : 'Ø entgangener Gewinn'}
                highlight
              />
              <FactorChip value={tim.sampleSize} label="Bewertete Verkäufe" />
            </FactorGrid>
          )}
        />
      </div>
    </div>
  );
}
