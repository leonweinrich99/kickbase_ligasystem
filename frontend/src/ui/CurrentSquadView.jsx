import React, { useMemo, useState } from 'react';
import { Info, ExternalLink } from 'lucide-react';
import { buildLineupWithDummies } from '../liveLineupUtils';
import { normalizeStartProbCode } from '../startProbMeta';
import StartProbBadge, { StartProbLegend } from './StartProbBadge';

// Offizieller Kickbase Universal Link (verifiziert fuer iOS apple-app-site-association
// & Android assetlinks.json) - oeffnet die installierte Kickbase-App direkt.
const KICKBASE_APP_URL = 'https://kickbase.go.link/?adj_t=1obst5s';

const IMAGE_BASE = 'https://kickbase.b-cdn.net/';
const POS_CODE_TO_LABEL = { 1: 'TW', 2: 'ABW', 3: 'MF', 4: 'ST' };
const POS_CODE_TO_FULL = { 1: 'Torwart', 2: 'Abwehr', 3: 'Mittelfeld', 4: 'Sturm' };
const POS_LABEL_TO_CODE = { TW: 1, ABW: 2, MF: 3, ST: 4 };
const POSITION_COLORS = { 1: '#eab308', 2: '#3b82f6', 3: '#22c55e', 4: '#ef4444' };
const MIN_SLOTS = { 1: 1, 2: 3, 3: 3, 4: 2 };
const MAX_SLOTS = { 1: 1, 2: 5, 3: 5, 4: 3 };

const STATUS_LABELS = {
  1: 'Verletzt',
  2: 'Angeschlagen',
  4: 'Aufbautraining',
  8: 'Rote Karte',
  16: 'Gelb-Rot',
  32: 'Gelbsperre',
};

const isDummyImage = (url) =>
  Boolean(url && (url.includes('dummy') || url.includes('placeholder') || url.includes('default') || url.includes('silhouet')));

const formatCompactMoney = (val) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '–';
  const num = Number(val);
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  return `${Math.round(num / 1000)}k €`;
};

const formatSignedCompactMoney = (val) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return null;
  const num = Number(val);
  if (num === 0) return '±0 €';
  const sign = num > 0 ? '+' : '-';
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2).replace('.', ',')} Mio €`;
  return `${sign}${Math.round(abs / 1000)}k €`;
};

const toPosCode = (pos) => {
  if (typeof pos === 'number' && pos >= 1 && pos <= 4) return pos;
  return POS_LABEL_TO_CODE[String(pos || '').toUpperCase()] || 3;
};

// Waehlt eine gueltige Startelf (bis zu 11 Spieler) und trennt die
// Auswechselspieler (Bank) sauber ab.
const splitStartersAndBench = (players, liveStartingIds) => {
  if (!Array.isArray(players) || players.length === 0) {
    return { starters: [], bench: [], starterIds: new Set() };
  }

  // 1) Falls Kickbase explizite lineupOrder (`lo`) liefert, direkt nutzen.
  const explicitStarters = players.filter((p) => typeof p.lineupOrder === 'number' && p.lineupOrder >= 0);
  if (explicitStarters.length > 0) {
    const starterSet = new Set(explicitStarters.slice(0, 11).map((p) => String(p.id)));
    return {
      starters: players.filter((p) => starterSet.has(String(p.id))),
      bench: players.filter((p) => !starterSet.has(String(p.id))),
      starterIds: starterSet,
    };
  }

  // 2) Sonst: Spieler aus der aktuellen Spieltagself priorisieren, danach
  //    fit > beste Startelf-Prognose (1..5) > hoechster Marktwert.
  const rankScore = (p) => {
    const inLive = liveStartingIds?.has(String(p.id)) ? 1 : 0;
    const fit = !p.status || p.status === 0 ? 1 : 0;
    const probCode = normalizeStartProbCode(p.prob);
    const probRank = probCode != null ? 6 - probCode : 2.5;
    const mv = p.marketValue || 0;
    return [inLive, fit, probRank, mv];
  };

  const comparePlayers = (a, b) => {
    const sa = rankScore(a);
    const sb = rankScore(b);
    for (let i = 0; i < sa.length; i += 1) {
      if (sa[i] !== sb[i]) return sb[i] - sa[i];
    }
    return 0;
  };

  const byPos = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of players) {
    const pos = toPosCode(p.position);
    byPos[pos].push(p);
  }
  for (const pos of [1, 2, 3, 4]) {
    byPos[pos].sort(comparePlayers);
  }

  const chosen = [];
  const chosenIds = new Set();
  const countByPos = { 1: 0, 2: 0, 3: 0, 4: 0 };

  const pick = (p) => {
    const pos = toPosCode(p.position);
    chosen.push(p);
    chosenIds.add(String(p.id));
    countByPos[pos] += 1;
  };

  // Pflicht-Slots (1 TW, 3 ABW, 3 MF, 2 ST)
  for (const pos of [1, 2, 3, 4]) {
    for (const p of byPos[pos].slice(0, MIN_SLOTS[pos])) {
      if (chosen.length < 11) pick(p);
    }
  }

  // Restliche 2 Feldspieler-Slots (unter Beachtung der Positions-Obergrenzen)
  const remaining = players
    .filter((p) => !chosenIds.has(String(p.id)) && toPosCode(p.position) !== 1)
    .sort(comparePlayers);

  for (const p of remaining) {
    if (chosen.length >= 11) break;
    const pos = toPosCode(p.position);
    if (countByPos[pos] < MAX_SLOTS[pos]) {
      pick(p);
    }
  }

  const bench = players.filter((p) => !chosenIds.has(String(p.id)));
  return { starters: chosen, bench, starterIds: chosenIds };
};

const MarketTrendBadge = ({ amount, dir }) => {
  const hasAmount = typeof amount === 'number' && !Number.isNaN(amount);
  const isRising = hasAmount ? amount > 0 : dir === 1;
  const isFalling = hasAmount ? amount < 0 : dir === 2;

  if (!hasAmount && dir == null) return null;

  const colorClass = isRising
    ? 'text-green-400'
    : isFalling
      ? 'text-red-400'
      : 'text-[#626978]';

  const arrow = isRising ? '▲' : isFalling ? '▼' : '▬';
  const label = hasAmount
    ? formatSignedCompactMoney(amount)
    : isRising
      ? 'Steigend'
      : isFalling
        ? 'Fallend'
        : 'Stabil';

  return (
    <div className={`text-[10px] sm:text-[11px] font-bold tabular-nums leading-none mt-1 ${colorClass}`}>
      {arrow} {label}
    </div>
  );
};

const SquadPitchCircle = ({ player, size, containerSize }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fullImgUrl = player.imagePath ? `${IMAGE_BASE}${player.imagePath}` : null;
  const showPhoto = !player.isDummy && fullImgUrl && !isDummyImage(fullImgUrl) && !imgFailed;

  return (
    <div className={`flex flex-col items-center ${containerSize} select-none`}>
      <div className={`relative ${size}`}>
        <div
          className={`w-full h-full rounded-full overflow-hidden shadow-lg bg-[#171717] flex items-center justify-center ${
            player.isDummy ? 'border border-dashed border-[#333333] opacity-40' : 'ring-1 ring-white/20'
          }`}
        >
          {showPhoto ? (
            <img
              src={fullImgUrl}
              alt={player.lastName || player.name}
              className="w-full h-full object-cover object-top"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="text-[11px] font-bold text-[#626978] uppercase">
              {player.isDummy ? '–' : (player.lastName || player.name || '?').substring(0, 2)}
            </span>
          )}
        </div>

        {/* Kickbase 5-stufiges Startelf-Prognose-Icon unten rechts am Avatar */}
        {!player.isDummy && player.prob != null && (
          <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-black p-[1.5px] shadow">
            <StartProbBadge prob={player.prob} variant="icon" size={16} />
          </div>
        )}
      </div>

      <span className={`mt-1 text-[10px] sm:text-[11px] font-semibold truncate max-w-full text-center leading-tight ${player.isDummy ? 'text-[#525866]' : 'text-gray-100'}`}>
        {player.isDummy ? 'Frei' : (player.lastName || player.name)}
      </span>

      <span className="text-[9px] sm:text-[10px] font-bold text-[#8b92a5] tabular-nums leading-tight mt-0.5">
        {player.isDummy ? '–' : formatCompactMoney(player.marketValue)}
      </span>
    </div>
  );
};

const SquadPitchRow = ({ players }) => {
  if (!players || players.length === 0) return null;
  const itemCount = players.length;
  const size = itemCount > 4 ? 'w-12 h-12 sm:w-14 sm:h-14' : 'w-14 h-14 sm:w-16 sm:h-16';
  const containerSize = itemCount > 4 ? 'w-[62px] sm:w-[76px]' : 'w-[72px] sm:w-[86px]';
  return (
    <div className="flex justify-center items-start flex-nowrap gap-1 sm:gap-4 w-full px-2 mb-4 last:mb-0">
      {players.map((p) => (
        <SquadPitchCircle key={p.id} player={p} size={size} containerSize={containerSize} />
      ))}
    </div>
  );
};

const SquadListRow = ({ player, isBench }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const posCode = toPosCode(player.position);
  const posLabel = POS_CODE_TO_LABEL[posCode] || 'MF';
  const posColor = POSITION_COLORS[posCode] || '#8b92a5';
  const fullImgUrl = player.imagePath ? `${IMAGE_BASE}${player.imagePath}` : null;
  const showPhoto = fullImgUrl && !isDummyImage(fullImgUrl) && !imgFailed;
  const isInjured = typeof player.status === 'number' && player.status !== 0;
  const statusText = isInjured ? (STATUS_LABELS[player.status] || `Status ${player.status}`) : null;

  return (
    <div className="relative overflow-hidden w-full flex items-center gap-3 px-3 py-2.5 card-surface rounded-xl">
      {/* Avatar + Club Crest */}
      <div className="relative w-10 h-10 shrink-0">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-[#171717] ring-1 ring-white/15 flex items-center justify-center">
          {showPhoto ? (
            <img
              src={fullImgUrl}
              alt={player.name}
              className="w-full h-full object-cover object-top"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="text-xs font-bold text-[#626978] uppercase">
              {(player.lastName || player.name || '?').substring(0, 2)}
            </span>
          )}
        </div>
        {player.teamLogo && (
          <img
            src={player.teamLogo}
            alt=""
            className="w-4 h-4 object-contain absolute -bottom-0.5 -right-0.5 bg-black/80 rounded-full p-[1px]"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
      </div>

      {/* Name, Position, Startelf-Prognose */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-black shrink-0" style={{ color: posColor }}>
            {posLabel}
          </span>
          <span className="text-[13px] sm:text-sm font-bold text-white truncate">
            {player.name}
          </span>
          {isBench && (
            <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06] text-[#8b92a5] border border-white/10 shrink-0">
              Bank
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <StartProbBadge prob={player.prob} variant="compact" />
          {statusText && (
            <span className="text-[8px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded px-1.5 py-0.5 shrink-0">
              {statusText}
            </span>
          )}
          {player.teamName && (
            <span className="text-[10px] text-[#626978] truncate">{player.teamName}</span>
          )}
        </div>
      </div>

      {/* Marktwert + 24h Marktwert-Tendenz */}
      <div className="text-right shrink-0">
        <div className="text-[13px] sm:text-sm font-bold text-gray-100 tabular-nums leading-none">
          {formatCompactMoney(player.marketValue)}
        </div>
        <MarketTrendBadge amount={player.mvTrendAmount} dir={player.mvTrendDir} />
      </div>
    </div>
  );
};

const CurrentSquadView = ({ players, liveStartingIds, loading }) => {
  const [showLegend, setShowLegend] = useState(false);

  const {
    pitchLineup,
    startersCount,
    benchCount,
    starterIds,
    groupedByPosition,
    totalValue,
    totalTrend,
    hasAnyTrend,
    formationLabel,
  } = useMemo(() => {
    const normalized = (players || []).map((p) => ({
      ...p,
      position: toPosCode(p.position),
    }));
    const { starters: stList, bench: bnList, starterIds: stIds } = splitStartersAndBench(normalized, liveStartingIds);
    const padded = buildLineupWithDummies(stList);
    const awCount = stList.filter((p) => p.position === 2).length;
    const mfCount = stList.filter((p) => p.position === 3).length;
    const stCount = stList.filter((p) => p.position === 4).length;
    const sumMv = normalized.reduce((sum, p) => sum + (p.marketValue || 0), 0);

    let sumTrend = 0;
    let trendFound = false;
    for (const p of normalized) {
      if (typeof p.mvTrendAmount === 'number' && !Number.isNaN(p.mvTrendAmount)) {
        sumTrend += p.mvTrendAmount;
        trendFound = true;
      }
    }

    const groups = [1, 2, 3, 4]
      .map((posCode) => {
        const list = normalized
          .filter((p) => p.position === posCode)
          .sort((a, b) => {
            const aStart = stIds.has(String(a.id)) ? 1 : 0;
            const bStart = stIds.has(String(b.id)) ? 1 : 0;
            if (aStart !== bStart) return bStart - aStart;
            return (b.marketValue || 0) - (a.marketValue || 0);
          });
        return {
          posCode,
          label: POS_CODE_TO_FULL[posCode],
          color: POSITION_COLORS[posCode],
          players: list,
        };
      })
      .filter((g) => g.players.length > 0);

    return {
      pitchLineup: padded,
      startersCount: stList.length,
      benchCount: bnList.length,
      starterIds: stIds,
      groupedByPosition: groups,
      totalValue: sumMv,
      totalTrend: sumTrend,
      hasAnyTrend: trendFound,
      formationLabel: stList.length > 0 ? `${awCount}-${mfCount}-${stCount}` : null,
    };
  }, [players, liveStartingIds]);

  if (loading && (!players || players.length === 0)) {
    return <div className="text-center text-[#8b92a5] text-sm py-10">Lade aktuellen Kader…</div>;
  }

  if (!players || players.length === 0) {
    return (
      <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#8b92a5]">
        Kein aktueller Kader gefunden.
      </div>
    );
  }

  const st = pitchLineup.filter((p) => p.position === 4);
  const mf = pitchLineup.filter((p) => p.position === 3 || p.position === 0);
  const aw = pitchLineup.filter((p) => p.position === 2);
  const tw = pitchLineup.filter((p) => p.position === 1);

  return (
    <div>
      {/* Fussballfeld mit Startelf, Marktwert & Startelf-Prognose-Icon */}
      <div
        className="rounded-2xl overflow-hidden relative min-h-[480px] sm:min-h-[560px] flex flex-col justify-between py-6 sm:py-8 shadow-2xl"
        style={{ backgroundImage: 'radial-gradient(circle at center, #1a1a1a 0%, #050505 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none opacity-5 border border-white rounded-lg m-4 sm:m-6">
          <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-32 sm:h-32 border border-white rounded-full" />
        </div>

        {formationLabel && (
          <div className="absolute top-3.5 right-4 sm:top-5 sm:right-6 z-20 px-2.5 py-1 rounded-full bg-black/45 border border-white/10 text-[11px] font-black text-gray-200 tabular-nums backdrop-blur-md">
            {formationLabel}
          </div>
        )}

        <div className="relative z-10 w-full px-2 sm:px-4 flex flex-col pt-3 sm:pt-2">
          <SquadPitchRow players={st} />
          <SquadPitchRow players={mf} />
          <SquadPitchRow players={aw} />
          <SquadPitchRow players={tw} />
        </div>

        <div className="relative z-10 flex items-end justify-between px-4 sm:px-8 mt-4">
          <div className="text-left">
            <div className="text-xs font-bold text-gray-200 tabular-nums">
              {players.length} Spieler
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8b92a5] mt-0.5 tabular-nums">
              {startersCount} Startelf · {benchCount} Bank
            </div>
          </div>

          <div className="text-right">
            <div className="text-xl sm:text-2xl font-extrabold text-white leading-none tabular-nums">
              {formatCompactMoney(totalValue)}
            </div>
            {hasAnyTrend ? (
              <MarketTrendBadge amount={totalTrend} dir={null} />
            ) : (
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8b92a5] mt-1">
                Kaderwert
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Direktlink in die installierte Kickbase-App (Universal Link / App Link) */}
      <a
        href={KICKBASE_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#ff5c3e]/15 border border-[#ff5c3e]/45 text-xs sm:text-sm font-bold text-white hover:bg-[#ff5c3e]/25 hover:border-[#ff5c3e] transition-all active:scale-[0.99]"
      >
        <span>In der Kickbase App öffnen</span>
        <ExternalLink size={14} className="text-[#ff5c3e] shrink-0" />
      </a>

      {/* Liste unterhalb des Fussballfelds: nach Positionen gruppiert mit Marktwert, Tendenz & Startelf-Prognose */}
      <div className="mt-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-200">
            Kader nach Position
          </h3>
          <button
            type="button"
            onClick={() => setShowLegend((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              showLegend
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                : 'bg-white/[0.04] border-white/15 text-[#8b92a5] hover:text-white'
            }`}
          >
            <Info size={11} />
            <span>Legende</span>
          </button>
        </div>

        {showLegend && <StartProbLegend className="mb-3.5" />}

        <div className="flex flex-col gap-4">
          {groupedByPosition.map((group) => (
            <div key={group.posCode}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#8b92a5]">
                  {group.label} ({group.players.length})
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.players.map((player) => (
                  <SquadListRow
                    key={player.id}
                    player={player}
                    isBench={!starterIds.has(String(player.id))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CurrentSquadView;
