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
const fmtPts = (val) => `${Math.round(val).toLocaleString('de-DE')} Pkt`;

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

function StatCalcCard({ label, title, weightPct, score, isOpen, onToggle, factors, emptyNote }) {
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white truncate">{title}</span>
            {weightPct != null && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#222222] text-gray-400 shrink-0 tabular-nums">
                {weightPct} %
              </span>
            )}
          </div>
          {emptyNote && !isOpen && <div className="text-[11px] text-gray-500 truncate">{emptyNote}</div>}
        </div>
        <div className="text-xl font-black shrink-0" style={{ color: accent }}>{score}</div>
        <ChevronDown size={16} className={`text-gray-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-3.5 pb-3.5 -mt-1">{factors}</div>}
    </div>
  );
}

export default function RatingCalculationSection({
  calculation,
  kadLeaguePeers,
  pktLeaguePeers,
  proLeaguePeers,
  disLeaguePeers,
  konLeaguePeers,
  effLeaguePeers,
}) {
  const [openKey, setOpenKey] = useState(null);
  if (!calculation) return null;
  const toggle = (key) => setOpenKey((cur) => (cur === key ? null : key));

  const { kad, pkt, pro, dis, kon, eff } = calculation;
  if (!kad || !pkt || !pro || !dis || !kon || !eff) return null;

  const kadAccent = TIER_ACCENT[scoreToTier(kad.score)];
  const pktAccent = TIER_ACCENT[scoreToTier(pkt.score)];
  const proAccent = TIER_ACCENT[scoreToTier(pro.score)];
  const disAccent = TIER_ACCENT[scoreToTier(dis.score)];
  const konAccent = TIER_ACCENT[scoreToTier(kon.score)];
  const effAccent = TIER_ACCENT[scoreToTier(eff.score)];

  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8b92a5] mb-1">So wird deine Karte berechnet</div>
      <p className="text-[11px] text-gray-500 mb-3">
        Dein Gesamtscore ist der gewichtete Durchschnitt der 6 wichtigsten Erfolgsfaktoren im Liga-Vergleich (Auf dem Platz 45 %, Transfermarkt 30 %, Kaderführung 25 %).
      </p>

      <div className="space-y-2">
        {/* KAD (25 %) */}
        <StatCalcCard
          label="KAD" title="Startelf-Qualität (xP)" weightPct={25} score={kad.score}
          isOpen={openKey === 'kad'} onToggle={() => toggle('kad')}
          emptyNote={kad.expectedLineupPoints == null ? 'Keine Startelf-Daten' : undefined}
          factors={kad.expectedLineupPoints == null ? (
            <EmptyState>Noch keine historischen Startelf-Daten verfügbar – Wert bleibt neutral bei 50.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip
                value={fmtPts(kad.expectedLineupPoints)}
                label={`Ø Erwartete Punkte / ST (${kad.matchdaysEvaluated || 0} ST)`}
                highlight
              />
              <FactorChip
                value={`${Math.round((kad.avgStartProbability ?? kad.squadReadiness ?? 0) * 100)} %`}
                label="Ø Startelf-Chance (11er)"
              />
              <FactorChip
                value={`+${Math.round(kad.jokerExpectedPoints || 0)} Pkt`}
                label="Ø Joker-Potenzial / ST"
              />
              {kad.avgActualPoints != null && (
                <FactorChip
                  value={fmtPts(kad.avgActualPoints)}
                  label="Ø echte Punkte (Vergleich)"
                  highlight
                />
              )}
              <LeagueCompareBar percentile={kad.leaguePercentile} rank={kad.leagueRank} total={kad.leagueSize} accent={kadAccent} />
              <LeaguePeerList peers={kadLeaguePeers} formatValue={fmtPts} />
            </FactorGrid>
          )}
        />

        {/* PKT (20 %) */}
        <StatCalcCard
          label="PKT" title="Punkte-Output" weightPct={20} score={pkt.score}
          isOpen={openKey === 'pkt'} onToggle={() => toggle('pkt')}
          emptyNote={!(pkt.points > 0) ? 'Noch keine Punktedaten' : undefined}
          factors={!(pkt.points > 0) ? (
            <EmptyState>Noch keine Punktedaten vorhanden – Wert bleibt neutral bei 50.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip value={fmtPts(pkt.points)} label="Saisonpunkte gesamt" highlight />
              <FactorChip
                value={pkt.avgPoints != null ? fmtPts(pkt.avgPoints) : '–'}
                label={`Ø pro Spieltag (${pkt.matchdaysCount || 0} ST)`}
              />
              <FactorChip
                value={pkt.leagueMeanPoints != null ? fmtPts(pkt.leagueMeanPoints) : '–'}
                label="Ø der Liga"
              />
              {pkt.ppm != null && (
                <FactorChip
                  value={`${fmtNum1(pkt.ppm)} Pkt/Mio`}
                  label="Kader-Effizienz (nur Info)"
                  highlight
                />
              )}
              <LeagueCompareBar percentile={pkt.leaguePercentile} rank={pkt.leagueRank} total={pkt.leagueSize} accent={pktAccent} />
              <LeaguePeerList peers={pktLeaguePeers} formatValue={fmtPts} />
            </FactorGrid>
          )}
        />

        {/* PRO (20 %) */}
        <StatCalcCard
          label="PRO" title="Trading-Gewinn" weightPct={20} score={pro.score}
          isOpen={openKey === 'pro'} onToggle={() => toggle('pro')}
          emptyNote={pro.weightedTotalProfit == null ? 'Noch keine Trades' : undefined}
          factors={pro.weightedTotalProfit == null ? (
            <EmptyState>Noch keine bewerteten Trades vorhanden – Wert bleibt neutral bei 50.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip value={fmtSignedEUR(pro.weightedTotalProfit)} label="Gewichteter Profit" highlight />
              <FactorChip value={pro.completedTrades} label="Abgeschlossene Trades" highlight />
              <LeagueCompareBar percentile={pro.leaguePercentile} rank={pro.leagueRank} total={pro.leagueSize} accent={proAccent} />
              <LeaguePeerList peers={proLeaguePeers} formatValue={fmtSignedEUR} />
            </FactorGrid>
          )}
        />

        {/* DIS (15 %) */}
        <StatCalcCard
          label="DIS" title="Aufstellungs-Disziplin" weightPct={15} score={dis.score}
          isOpen={openKey === 'dis'} onToggle={() => toggle('dis')}
          emptyNote={dis.disciplineRaw == null ? 'Keine Startelf-Daten' : undefined}
          factors={dis.disciplineRaw == null ? (
            <EmptyState>Noch keine Startelf-Daten für die Disziplin-Wertung vorhanden.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip
                value={`${Math.round((dis.avgStartProbability ?? 0) * 100)} %`}
                label="Ø Startelf-Sicherheit"
              />
              <FactorChip
                value={dis.avgLikelyStarters != null ? `${fmtNum1(dis.avgLikelyStarters)} / 11` : '–'}
                label="Ø sichere Starter"
              />
              <FactorChip
                value={dis.negativeBudgetDays ?? 0}
                label="Spieltage im Minus"
              />
              <FactorChip
                value={dis.totalMissingSlots ?? 0}
                label="Leere Startelf-Plätze"
              />
              <LeagueCompareBar percentile={dis.leaguePercentile} rank={dis.leagueRank} total={dis.leagueSize} accent={disAccent} />
              <LeaguePeerList peers={disLeaguePeers} formatValue={(v) => `${Math.round(v)} Pkt`} />
            </FactorGrid>
          )}
        />

        {/* KON (10 %) */}
        <StatCalcCard
          label="KON" title="Konstanz" weightPct={10} score={kon.score}
          isOpen={openKey === 'kon'} onToggle={() => toggle('kon')}
          emptyNote={kon.floor3 == null ? 'Zu wenige Spieltage' : undefined}
          factors={kon.floor3 == null ? (
            <EmptyState>Erst ab 2 gespielten Spieltagen berechenbar.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip
                value={fmtPts(kon.floor3)}
                label="Ø der 3 schwächsten Spieltage (Floor)"
                highlight
              />
              <FactorChip
                value={kon.stdPoints != null ? `±${kon.stdPoints} Pkt` : '–'}
                label="Spieltags-Schwankung"
              />
              <FactorChip
                value={`${kon.minPoints ?? '–'} / ${kon.maxPoints ?? '–'}`}
                label="Min / Max Spieltag"
              />
              <LeagueCompareBar percentile={kon.leaguePercentile} rank={kon.leagueRank} total={kon.leagueSize} accent={konAccent} />
              <LeaguePeerList peers={konLeaguePeers} formatValue={fmtPts} />
            </FactorGrid>
          )}
        />

        {/* EFF (10 %) */}
        <StatCalcCard
          label="EFF" title="Trading-Effizienz" weightPct={10} score={eff.score}
          isOpen={openKey === 'eff'} onToggle={() => toggle('eff')}
          emptyNote={eff.profitPerTrade == null ? 'Noch keine Trades' : undefined}
          factors={eff.profitPerTrade == null ? (
            <EmptyState>Noch keine abgeschlossenen Trades vorhanden – Wert bleibt neutral bei 50.</EmptyState>
          ) : (
            <FactorGrid>
              <FactorChip value={fmtSignedEUR(eff.profitPerTrade)} label="Ø Profit pro Trade" highlight />
              <FactorChip
                value={eff.winRate != null ? fmtPct(eff.winRate) : '–'}
                label="Trefferquote (Win-Rate)"
              />
              <FactorChip
                value={`${eff.profitableTrades ?? 0} / ${eff.completedTrades ?? 0}`}
                label="Profitable Deals"
              />
              <LeagueCompareBar percentile={eff.leaguePercentile} rank={eff.leagueRank} total={eff.leagueSize} accent={effAccent} />
              <LeaguePeerList peers={effLeaguePeers} formatValue={fmtSignedEUR} />
            </FactorGrid>
          )}
        />
      </div>
    </div>
  );
}
