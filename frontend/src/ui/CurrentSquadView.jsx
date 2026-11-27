import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ExternalLink, RotateCcw, X } from './icons';
import { buildLineupWithDummies } from '../liveLineupUtils';
import { normalizeStartProbCode } from '../startProbMeta';
import { loadPlayerCatalogBundle } from '../playerDetailData';
import StartProbBadge from './StartProbBadge';
import PlayerRowCard from './PlayerRowCard';
import HexFrame from './HexFrame';

// Nutzt die kompakte ~170-KB players-lite.json (statt 40 MB all_players.json)
const loadSquadXpMap = () => loadPlayerCatalogBundle().then((b) => b.xpMap || new Map());

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

// Alle 10 offiziellen Kickbase-Formationen (ABW-MF-ST bei 1 TW + 10 Feldspielern)
const VALID_KICKBASE_FORMATIONS = new Set([
  '3-4-3', '3-5-2', '3-6-1',
  '4-2-4', '4-3-3', '4-4-2', '4-5-1',
  '5-2-3', '5-3-2', '5-4-1',
]);

const getPlayerXpValue = (xpById, playerId) => {
  const info = xpById?.get(String(playerId));
  if (typeof info?.xpNext === 'number') return Math.round(info.xpNext);
  if (typeof info?.xpSeason === 'number') return Math.round(info.xpSeason);
  return null;
};

// Prueft, welche Bankspieler fuer den angeklickten Startelf-Spieler (oder freien Slot)
// eingewechselt werden duerfen (gleiche Position immer; andere Feldposition, sofern
// eine gueltige Kickbase-Formation entsteht).
const getSwapOptionsForTarget = (target, starters, bench, xpById) => {
  if (!target || !Array.isArray(bench) || bench.length === 0) return [];
  const targetPos = toPosCode(target.position);
  const isDummy = Boolean(target.isDummy);

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const s of starters) {
    counts[toPosCode(s.position)] += 1;
  }

  const options = [];
  for (const candidate of bench) {
    const candPos = toPosCode(candidate.position);
    let nextFormation = null;

    if (isDummy) {
      if (targetPos === 1) {
        if (candPos !== 1) continue;
      } else {
        if (candPos === 1) continue;
        const nextCounts = { ...counts, [candPos]: counts[candPos] + 1 };
        const outfieldTotal = nextCounts[2] + nextCounts[3] + nextCounts[4];
        if (outfieldTotal === 10) {
          const f = `${nextCounts[2]}-${nextCounts[3]}-${nextCounts[4]}`;
          if (!VALID_KICKBASE_FORMATIONS.has(f)) continue;
          nextFormation = f;
        } else if (nextCounts[2] > 5 || nextCounts[3] > 6 || nextCounts[4] > 4) {
          continue;
        }
      }
    } else if (targetPos === 1) {
      if (candPos !== 1) continue;
    } else {
      if (candPos === 1) continue;
      if (candPos !== targetPos) {
        const nextCounts = {
          ...counts,
          [targetPos]: Math.max(0, counts[targetPos] - 1),
          [candPos]: counts[candPos] + 1,
        };
        const outfieldTotal = nextCounts[2] + nextCounts[3] + nextCounts[4];
        if (outfieldTotal === 10) {
          const f = `${nextCounts[2]}-${nextCounts[3]}-${nextCounts[4]}`;
          if (!VALID_KICKBASE_FORMATIONS.has(f)) continue;
          nextFormation = f;
        } else if (nextCounts[2] > 5 || nextCounts[3] > 6 || nextCounts[4] > 4) {
          continue;
        }
      }
    }

    options.push({
      player: candidate,
      samePosition: candPos === targetPos,
      nextFormation,
      xp: getPlayerXpValue(xpById, candidate.id),
    });
  }

  options.sort((a, b) => {
    if (a.samePosition !== b.samePosition) return a.samePosition ? -1 : 1;
    const ax = a.xp ?? -1;
    const bx = b.xp ?? -1;
    if (ax !== bx) return bx - ax;
    return (b.player.marketValue || 0) - (a.player.marketValue || 0);
  });

  return options;
};

// Berechnet kreisfoermige (rand-sichere) Positionen fuer alle Tausch-Optionen
// rund um das ausgewaehlte Spieler-Avatar-Zentrum (cx, cy) im Spielfeld.
const computeOrbitalPositions = (cx, cy, count, pitchW, pitchH) => {
  if (!count || !pitchW || !pitchH) return [];
  const isCompact = pitchW < 480;
  const padX = isCompact ? 38 : 48;
  const padTop = isCompact ? 48 : 54;
  const padBottom = isCompact ? 64 : 74;
  const minX = padX;
  const maxX = Math.max(minX, pitchW - padX);
  const minY = padTop;
  const maxY = Math.max(minY, pitchH - padBottom);
  const minDist = isCompact ? 62 : 76;

  const findLongestValidArc = (radius) => {
    const steps = 360;
    const valid = new Array(steps);
    let validCount = 0;
    for (let i = 0; i < steps; i += 1) {
      const a = (i * Math.PI * 2) / steps;
      const x = cx + radius * Math.cos(a);
      const y = cy + radius * Math.sin(a);
      const ok = x >= minX && x <= maxX && y >= minY && y <= maxY;
      valid[i] = ok;
      if (ok) validCount += 1;
    }
    if (validCount === 0) return null;
    if (validCount === steps) {
      return { fullCircle: true, startRad: 0, span: Math.PI * 2 };
    }
    // Erstes ungueltiges Element suchen, damit Wrap-Around-Boegen nicht zerschnitten werden
    let firstFalse = valid.indexOf(false);
    if (firstFalse === -1) firstFalse = 0;

    let bestStart = 0;
    let bestLen = 0;
    let curStart = 0;
    let curLen = 0;
    for (let offset = 0; offset < steps; offset += 1) {
      const idx = (firstFalse + offset) % steps;
      if (valid[idx]) {
        if (curLen === 0) curStart = idx;
        curLen += 1;
        if (curLen > bestLen) {
          bestLen = curLen;
          bestStart = curStart;
        }
      } else {
        curLen = 0;
      }
    }
    if (bestLen === 0) return null;
    return {
      fullCircle: false,
      startRad: (bestStart * Math.PI * 2) / steps,
      span: ((bestLen - 1) * Math.PI * 2) / steps,
    };
  };

  const placeOnRing = (radius, itemsCount) => {
    const arc = findLongestValidArc(radius);
    if (!arc) return [];
    const results = [];

    if (arc.fullCircle) {
      const cap = Math.max(1, Math.floor((Math.PI * 2 * radius) / minDist));
      const take = Math.min(itemsCount, cap);
      // 6-Uhr-Position (Name des ausgewaehlten Spielers) immer frei halten
      const startAngle = take % 2 === 1 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / take;
      for (let i = 0; i < take; i += 1) {
        const angle = startAngle + (i * Math.PI * 2) / take;
        results.push({
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle),
        });
      }
      return results;
    }

    const cap = Math.max(1, Math.floor((arc.span * radius) / minDist) + 1);
    const take = Math.min(itemsCount, cap);
    const mid = arc.startRad + arc.span / 2;

    if (take === 1) {
      results.push({
        x: cx + radius * Math.cos(mid),
        y: cy + radius * Math.sin(mid),
      });
      return results;
    }

    const niceStep = Math.min(Math.PI / 2.3, (minDist * 1.18) / radius);
    const step = Math.min(niceStep, arc.span / (take - 1));
    const totalArc = step * (take - 1);
    const begin = mid - totalArc / 2;

    for (let i = 0; i < take; i += 1) {
      const angle = begin + i * step;
      results.push({
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    }
    return results;
  };

  const positions = [];
  const radii = isCompact ? [78, 140, 198] : [94, 166, 232];
  let remaining = count;

  for (const r of radii) {
    if (remaining <= 0) break;
    const placed = placeOnRing(r, remaining);
    positions.push(...placed);
    remaining -= placed.length;
  }

  // Fallback fuer extreme Konstellationen: clamped um das Zentrum verteilen
  while (positions.length < count) {
    const idx = positions.length;
    const angle = -Math.PI / 2 + (idx * Math.PI * 2) / count;
    const r = radii[0];
    positions.push({
      x: Math.max(minX, Math.min(maxX, cx + r * Math.cos(angle))),
      y: Math.max(minY, Math.min(maxY, cy + r * Math.sin(angle))),
    });
  }

  return positions;
};

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
    <span className={`inline-flex items-center gap-0.5 text-[10px] sm:text-[11px] font-bold tabular-nums leading-none whitespace-nowrap ${colorClass}`}>
      <span aria-hidden="true">{arrow}</span>
      <span>{label}</span>
    </span>
  );
};

const SquadPitchCircle = ({
  player,
  size,
  containerSize,
  onPlayerClick,
  registerAvatarRef,
  dimmed,
  isSelected,
  justSwapped,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fullImgUrl = player.imagePath ? `${IMAGE_BASE}${player.imagePath}` : null;
  const showPhoto = !player.isDummy && fullImgUrl && !isDummyImage(fullImgUrl) && !imgFailed;
  const clickable = Boolean(onPlayerClick);

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable && !dimmed ? 0 : undefined}
      onClick={clickable && !dimmed ? () => onPlayerClick(player) : undefined}
      onKeyDown={clickable && !dimmed ? (e) => (e.key === 'Enter' || e.key === ' ') && onPlayerClick(player) : undefined}
      className={`flex flex-col items-center ${containerSize} select-none transition-all duration-200 ${
        dimmed
          ? 'opacity-20 grayscale scale-95 pointer-events-none'
          : isSelected
            ? 'opacity-0 pointer-events-none'
            : clickable
              ? 'cursor-pointer hover:scale-105 active:scale-95'
              : ''
      }`}
    >
      <div
        ref={registerAvatarRef ? (el) => registerAvatarRef(String(player.id), el) : null}
        className={`relative ${size}`}
      >
        <HexFrame
          className={`w-full h-full transition-all duration-300 ${player.isDummy ? 'opacity-55' : ''}`}
          innerClassName="bg-[#171717]"
          ringColor={
            player.isDummy
              ? '#555555'
              : justSwapped
                ? '#34d399'
                : 'rgba(255, 255, 255, 0.24)'
          }
          ringWidth={justSwapped ? 1.8 : 1.2}
          dashed={Boolean(player.isDummy)}
          glowColor={justSwapped ? 'rgba(52, 211, 153, 0.7)' : null}
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
              {player.isDummy ? '+' : (player.lastName || player.name || '?').substring(0, 2)}
            </span>
          )}
        </HexFrame>

        {/* Kickbase 5-stufiges Startelf-Prognose-Icon unten rechts am Avatar */}
        {!player.isDummy && player.prob != null && (
          <div className="absolute -bottom-0.5 right-0 pointer-events-none">
            <StartProbBadge prob={player.prob} variant="icon" size={18} backdrop />
          </div>
        )}
      </div>

      <span className={`mt-1.5 text-[10px] sm:text-[11px] font-semibold truncate max-w-full text-center leading-tight ${player.isDummy ? 'text-[#525866]' : 'text-gray-100'}`}>
        {player.isDummy ? 'Frei' : (player.lastName || player.name)}
      </span>
    </div>
  );
};

const SquadPitchRow = ({
  players,
  onPlayerClick,
  registerAvatarRef,
  activeSwapId,
  justSwappedId,
}) => {
  if (!players || players.length === 0) return null;
  const itemCount = players.length;
  const size = itemCount > 5
    ? 'w-10 h-10 sm:w-12 sm:h-12'
    : itemCount > 4
      ? 'w-12 h-12 sm:w-14 sm:h-14'
      : 'w-14 h-14 sm:w-16 sm:h-16';
  const containerSize = itemCount > 5
    ? 'w-[50px] sm:w-[68px]'
    : itemCount > 4
      ? 'w-[62px] sm:w-[76px]'
      : 'w-[72px] sm:w-[86px]';
  const gapClass = itemCount > 5 ? 'gap-0.5 sm:gap-3' : 'gap-1 sm:gap-4';

  return (
    <div className={`flex justify-center items-start flex-nowrap ${gapClass} w-full px-2 mb-4 last:mb-0`}>
      {players.map((p) => {
        const pid = String(p.id);
        const isSelected = activeSwapId != null && activeSwapId === pid;
        const dimmed = activeSwapId != null && !isSelected;
        return (
          <SquadPitchCircle
            key={p.id}
            player={p}
            size={size}
            containerSize={containerSize}
            onPlayerClick={onPlayerClick}
            registerAvatarRef={registerAvatarRef}
            dimmed={dimmed}
            isSelected={isSelected}
            justSwapped={justSwappedId != null && justSwappedId === pid}
          />
        );
      })}
    </div>
  );
};

const OrbitalOptionCircle = ({
  option,
  originX,
  originY,
  targetX,
  targetY,
  expanded,
  delayMs,
  onSelect,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const { player, samePosition, nextFormation, xp } = option;
  const posCode = toPosCode(player.position);
  const posLabel = POS_CODE_TO_LABEL[posCode] || 'MF';
  const fullImgUrl = player.imagePath ? `${IMAGE_BASE}${player.imagePath}` : null;
  const showPhoto = fullImgUrl && !isDummyImage(fullImgUrl) && !imgFailed;

  const x = expanded ? targetX : originX;
  const y = expanded ? targetY : originY;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(player);
      }}
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${expanded ? 1 : 0.35})`,
        opacity: expanded ? 1 : 0,
        transitionDelay: `${delayMs}ms`,
      }}
      className="absolute z-30 w-11 h-11 sm:w-[52px] sm:h-[52px] select-none cursor-pointer group transition-[transform,opacity] duration-200 ease-out focus:outline-none"
      title={
        nextFormation
          ? `${player.name} einwechseln (${nextFormation})`
          : `${player.name} einwechseln`
      }
    >
      <div className="relative w-full h-full transition-transform duration-150 group-hover:scale-110 group-active:scale-95">
        <HexFrame
          className="w-full h-full"
          innerClassName="bg-[#171717]"
          ringColor={samePosition ? 'rgba(52, 211, 153, 0.92)' : 'rgba(251, 191, 36, 0.92)'}
          ringWidth={1.6}
          glowColor={samePosition ? 'rgba(52, 211, 153, 0.4)' : 'rgba(251, 191, 36, 0.4)'}
        >
          {showPhoto ? (
            <img
              src={fullImgUrl}
              alt={player.lastName || player.name}
              className="w-full h-full object-cover object-top"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="text-[11px] font-bold text-[#8b92a5] uppercase">
              {(player.lastName || player.name || '?').substring(0, 2)}
            </span>
          )}
        </HexFrame>

        {/* Positions-Badge oben links bei Formationswechsel */}
        {!samePosition && (
          <span
            className="absolute -top-1 -left-1 px-1 py-[1px] rounded-full oct-sm oct-bd-none text-[8px] font-black uppercase tracking-tight text-white shadow leading-none border border-black/70"
            style={{ backgroundColor: POSITION_COLORS[posCode] || '#f59e0b' }}
          >
            {posLabel}
          </span>
        )}

        {/* Startelf-Prognose-Icon unten rechts */}
        {player.prob != null && (
          <div className="absolute -bottom-0.5 right-0 pointer-events-none">
            <StartProbBadge prob={player.prob} variant="icon" size={16} backdrop />
          </div>
        )}
      </div>

      {/* Name & xP zentriert unter dem Avatar-Kreis, damit (x, y) exakt das Kreiszentrum bleibt */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-[74px] sm:w-[84px] flex flex-col items-center pointer-events-none">
        <span className="text-[10px] font-semibold text-white truncate max-w-full text-center leading-tight [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
          {player.lastName || player.name}
        </span>
        {(xp != null || nextFormation) && (
          <span className="text-[9px] font-bold tabular-nums leading-none mt-0.5 whitespace-nowrap [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
            {xp != null ? (
              <span className="text-cyan-400">{xp} xP</span>
            ) : (
              <span className="text-amber-300">{nextFormation}</span>
            )}
          </span>
        )}
      </div>
    </button>
  );
};

const SelectedSwapAnchor = ({ player, x, y, sizePx, xp, onClose }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fullImgUrl = player.imagePath ? `${IMAGE_BASE}${player.imagePath}` : null;
  const showPhoto = !player.isDummy && fullImgUrl && !isDummyImage(fullImgUrl) && !imgFailed;
  const dim = sizePx ? `${sizePx}px` : undefined;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      style={{
        left: 0,
        top: 0,
        width: dim,
        height: dim,
        transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`,
      }}
      className={`absolute z-30 ${dim ? '' : 'w-14 h-14 sm:w-16 sm:h-16'} select-none cursor-pointer focus:outline-none`}
      title="Auswahl schließen"
    >
      <div className="relative w-full h-full">
        <HexFrame
          className="w-full h-full"
          innerClassName="bg-[#171717]"
          ringColor="#ff5c3e"
          ringWidth={1.8}
          glowColor="rgba(255, 92, 62, 0.65)"
        >
          {showPhoto ? (
            <img
              src={fullImgUrl}
              alt={player.lastName || player.name}
              className="w-full h-full object-cover object-top"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="text-[12px] font-bold text-[#ff5c3e] uppercase">
              {player.isDummy ? '+' : (player.lastName || player.name || '?').substring(0, 2)}
            </span>
          )}
        </HexFrame>
        {!player.isDummy && player.prob != null && (
          <div className="absolute -bottom-0.5 right-0 pointer-events-none">
            <StartProbBadge prob={player.prob} variant="icon" size={18} backdrop />
          </div>
        )}
      </div>

      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-[82px] sm:w-[94px] flex flex-col items-center pointer-events-none">
        <span className="text-[10px] sm:text-[11px] font-bold text-white truncate max-w-full text-center leading-tight [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
          {player.isDummy ? 'Frei' : (player.lastName || player.name)}
        </span>
        {xp != null && (
          <span className="text-[9px] font-bold text-cyan-400 tabular-nums leading-none mt-0.5 [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
            {xp} xP
          </span>
        )}
      </div>
    </button>
  );
};

const SquadListRow = ({ player, isBench, xpSeason, onPlayerClick }) => {
  const posCode = toPosCode(player.position);
  const posLabel = POS_CODE_TO_LABEL[posCode] || 'MF';
  const isInjured = typeof player.status === 'number' && player.status !== 0;
  const statusText = isInjured ? (STATUS_LABELS[player.status] || `Status ${player.status}`) : null;

  const metaStatus = statusText
    ? { label: statusText, tone: 'orange' }
    : isBench
      ? { label: 'Bank', tone: 'muted' }
      : { label: 'Startelf', tone: 'emerald' };

  const metaSecondary = typeof xpSeason === 'number'
    ? `${xpSeason} xP`
    : (player.teamName || null);

  const hasAmount = typeof player.mvTrendAmount === 'number' && !Number.isNaN(player.mvTrendAmount);
  const isRising = hasAmount ? player.mvTrendAmount > 0 : player.mvTrendDir === 1;
  const isFalling = hasAmount ? player.mvTrendAmount < 0 : player.mvTrendDir === 2;
  const secondaryMetric = (hasAmount || player.mvTrendDir != null)
    ? {
        text: `${isRising ? '▲' : isFalling ? '▼' : '▬'} ${
          hasAmount
            ? formatSignedCompactMoney(player.mvTrendAmount)
            : isRising
              ? 'Steigend'
              : isFalling
                ? 'Fallend'
                : 'Stabil'
        }`,
        tone: isRising ? 'green' : isFalling ? 'red' : 'muted',
      }
    : null;

  return (
    <PlayerRowCard
      player={{
        name: player.name,
        position: posLabel,
        imagePath: player.imagePath,
        teamLogo: player.teamLogo,
        startProb: player.prob,
      }}
      metaStatus={metaStatus}
      metaSecondary={metaSecondary}
      primaryMetric={formatCompactMoney(player.marketValue)}
      secondaryMetric={secondaryMetric}
      onClick={player.id != null && onPlayerClick ? () => onPlayerClick(player.id) : undefined}
    />
  );
};

const CurrentSquadView = ({ players, liveStartingIds, loading }) => {
  const navigate = useNavigate();
  const [xpById, setXpById] = useState(() => new Map());
  const [customStarterIds, setCustomStarterIds] = useState(null);
  const [swapState, setSwapState] = useState(null);
  const [orbitalExpanded, setOrbitalExpanded] = useState(false);
  const [justSwappedId, setJustSwappedId] = useState(null);

  const pitchRef = useRef(null);
  const avatarRefs = useRef(new Map());
  const swapGlowTimerRef = useRef(null);

  const openPlayerDetail = useCallback((pid) => {
    if (pid != null) navigate(`/player/${encodeURIComponent(String(pid))}`);
  }, [navigate]);

  const registerAvatarRef = useCallback((id, el) => {
    if (el) avatarRefs.current.set(id, el);
    else avatarRefs.current.delete(id);
  }, []);

  const closeSwap = useCallback(() => {
    setOrbitalExpanded(false);
    setSwapState(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSquadXpMap().then((map) => {
      if (!cancelled) setXpById(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (swapGlowTimerRef.current) window.clearTimeout(swapGlowTimerRef.current);
  }, []);

  // Schliessen bei Escape oder Resize (damit Koordinaten immer exakt bleiben)
  useEffect(() => {
    if (!swapState) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeSwap();
    };
    const onResize = () => closeSwap();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [swapState, closeSwap]);

  // Sanftes Herausfahren der Options-Kreise ab dem ausgewaehlten Spieler
  useEffect(() => {
    if (!swapState) return undefined;
    const rafId = window.requestAnimationFrame(() => {
      setOrbitalExpanded(true);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [swapState]);

  const {
    pitchLineup,
    startersList,
    benchList,
    starterIds,
    isCustomLineup,
    groupedByPosition,
    startersValue,
    startersTrend,
    hasStartersTrend,
    startersXp,
    hasStartersXp,
    formationLabel,
  } = useMemo(() => {
    const normalized = (players || []).map((p) => ({
      ...p,
      position: toPosCode(p.position),
    }));
    const defaultSplit = splitStartersAndBench(normalized, liveStartingIds);

    let stList = defaultSplit.starters;
    let bnList = defaultSplit.bench;
    let stIds = defaultSplit.starterIds;
    let customActive = false;

    if (customStarterIds && customStarterIds.size > 0) {
      const validIds = new Set(normalized.map((p) => String(p.id)));
      const filteredCustom = new Set([...customStarterIds].filter((id) => validIds.has(id)));
      if (filteredCustom.size > 0) {
        stList = normalized.filter((p) => filteredCustom.has(String(p.id)));
        bnList = normalized.filter((p) => !filteredCustom.has(String(p.id)));
        stIds = filteredCustom;
        // Nur als "geaendert" markieren, wenn sich die Startelf wirklich unterscheidet
        customActive =
          filteredCustom.size !== defaultSplit.starterIds.size ||
          [...filteredCustom].some((id) => !defaultSplit.starterIds.has(id));
      }
    }

    const padded = buildLineupWithDummies(stList);
    const awCount = stList.filter((p) => p.position === 2).length;
    const mfCount = stList.filter((p) => p.position === 3).length;
    const stCount = stList.filter((p) => p.position === 4).length;
    const sumStartersMv = stList.reduce((sum, p) => sum + (p.marketValue || 0), 0);

    let sumStartersTrend = 0;
    let startersTrendFound = false;
    let sumStartersXp = 0;
    let startersXpFound = false;
    for (const p of stList) {
      if (typeof p.mvTrendAmount === 'number' && !Number.isNaN(p.mvTrendAmount)) {
        sumStartersTrend += p.mvTrendAmount;
        startersTrendFound = true;
      }
      const xpInfo = xpById.get(String(p.id));
      const xpVal = typeof xpInfo?.xpNext === 'number'
        ? xpInfo.xpNext
        : (typeof xpInfo?.xpSeason === 'number' ? xpInfo.xpSeason : null);
      if (xpVal != null) {
        sumStartersXp += xpVal;
        startersXpFound = true;
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
      startersList: stList,
      benchList: bnList,
      starterIds: stIds,
      isCustomLineup: customActive,
      groupedByPosition: groups,
      startersValue: sumStartersMv,
      startersTrend: sumStartersTrend,
      hasStartersTrend: startersTrendFound,
      startersXp: Math.round(sumStartersXp),
      hasStartersXp: startersXpFound,
      formationLabel: stList.length > 0 ? `${awCount}-${mfCount}-${stCount}` : null,
    };
  }, [players, liveStartingIds, xpById, customStarterIds]);

  const handlePitchPlayerClick = useCallback((player) => {
    const pid = String(player.id);
    if (swapState && String(swapState.target.id) === pid) {
      closeSwap();
      return;
    }

    const pitchEl = pitchRef.current;
    const avatarEl = avatarRefs.current.get(pid);
    if (!pitchEl || !avatarEl) return;

    const pitchRect = pitchEl.getBoundingClientRect();
    const avatarRect = avatarEl.getBoundingClientRect();
    const cx = (avatarRect.left + avatarRect.width / 2) - pitchRect.left;
    const cy = (avatarRect.top + avatarRect.height / 2) - pitchRect.top;

    const options = getSwapOptionsForTarget(player, startersList, benchList, xpById);
    const coords = computeOrbitalPositions(cx, cy, options.length, pitchRect.width, pitchRect.height);

    setOrbitalExpanded(false);
    setSwapState({
      target: player,
      cx,
      cy,
      sizePx: Math.round(avatarRect.width),
      pitchW: pitchRect.width,
      pitchH: pitchRect.height,
      options: options.map((opt, idx) => ({
        ...opt,
        x: coords[idx]?.x ?? cx,
        y: coords[idx]?.y ?? cy,
      })),
    });
  }, [swapState, closeSwap, startersList, benchList, xpById]);

  const handlePerformSwap = useCallback((benchPlayer) => {
    if (!swapState?.target || !benchPlayer) return;
    const target = swapState.target;
    const nextIds = new Set(starterIds);
    if (!target.isDummy) {
      nextIds.delete(String(target.id));
    }
    nextIds.add(String(benchPlayer.id));

    setCustomStarterIds(nextIds);
    closeSwap();

    const swappedId = String(benchPlayer.id);
    setJustSwappedId(swappedId);
    if (swapGlowTimerRef.current) window.clearTimeout(swapGlowTimerRef.current);
    swapGlowTimerRef.current = window.setTimeout(() => {
      setJustSwappedId(null);
      swapGlowTimerRef.current = null;
    }, 900);
  }, [swapState, starterIds, closeSwap]);

  const handleResetLineup = useCallback(() => {
    closeSwap();
    setCustomStarterIds(null);
  }, [closeSwap]);

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
  const activeSwapId = swapState ? String(swapState.target.id) : null;
  const swapTargetXp = swapState && !swapState.target.isDummy
    ? getPlayerXpValue(xpById, swapState.target.id)
    : null;

  return (
    <div>
      {/* Fussballfeld mit Startelf, radialem Spieler-Tausch & Startelf-Summary */}
      <div
        ref={pitchRef}
        className="oct-box rounded-2xl overflow-hidden relative min-h-[480px] sm:min-h-[560px] flex flex-col justify-between py-6 sm:py-8 shadow-2xl"
        style={{ backgroundImage: 'radial-gradient(circle at center, #1a1a1a 0%, #050505 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none opacity-5 border border-white rounded-lg m-4 sm:m-6">
          <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-32 sm:h-32 border border-white rounded-full hex-pitch-center" />
        </div>

        {/* Oben links: Reset-Button bei geaenderter Startelf (ausserhalb Swap-Modus) */}
        {!swapState && isCustomLineup && (
          <button
            type="button"
            onClick={handleResetLineup}
            className="absolute top-3.5 left-4 sm:top-5 sm:left-6 z-20 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full oct-pill oct-bd-accent bg-[#ff5c3e]/15 border border-[#ff5c3e]/45 text-[11px] font-bold text-[#ff5c3e] hover:bg-[#ff5c3e]/25 transition-colors cursor-pointer"
          >
            <RotateCcw size={11} />
            <span>Zurücksetzen</span>
          </button>
        )}

        {/* Oben rechts: aktuelle Formation */}
        {formationLabel && (
          <div
            className={`absolute top-3.5 right-4 sm:top-5 sm:right-6 z-20 px-2.5 py-1 rounded-full oct-pill border text-[11px] font-black tabular-nums transition-all duration-200 ${
              swapState
                ? 'opacity-20 pointer-events-none bg-black/45 border-white/10 text-gray-200'
                : isCustomLineup
                  ? 'bg-[#ff5c3e]/15 border-[#ff5c3e]/45 oct-bd-accent text-[#ff5c3e]'
                  : 'bg-black/45 border-white/10 text-gray-200'
            }`}
          >
            {formationLabel}
          </div>
        )}

        <div className="relative z-10 w-full px-2 sm:px-4 flex flex-col pt-3 sm:pt-2">
          <SquadPitchRow
            players={st}
            onPlayerClick={handlePitchPlayerClick}
            registerAvatarRef={registerAvatarRef}
            activeSwapId={activeSwapId}
            justSwappedId={justSwappedId}
          />
          <SquadPitchRow
            players={mf}
            onPlayerClick={handlePitchPlayerClick}
            registerAvatarRef={registerAvatarRef}
            activeSwapId={activeSwapId}
            justSwappedId={justSwappedId}
          />
          <SquadPitchRow
            players={aw}
            onPlayerClick={handlePitchPlayerClick}
            registerAvatarRef={registerAvatarRef}
            activeSwapId={activeSwapId}
            justSwappedId={justSwappedId}
          />
          <SquadPitchRow
            players={tw}
            onPlayerClick={handlePitchPlayerClick}
            registerAvatarRef={registerAvatarRef}
            activeSwapId={activeSwapId}
            justSwappedId={justSwappedId}
          />
        </div>

        <div
          className={`relative z-10 flex items-start justify-between gap-3 mx-6 sm:mx-8 mt-4 pt-3 border-t border-white/[0.07] transition-all duration-200 ${
            swapState ? 'opacity-20 grayscale pointer-events-none' : ''
          }`}
        >
          <div className="flex flex-col items-start min-w-0">
            <div className="h-6 sm:h-7 flex items-baseline">
              <span className="text-lg sm:text-2xl font-extrabold text-cyan-400 leading-none tabular-nums whitespace-nowrap">
                {hasStartersXp ? startersXp.toLocaleString('de-DE') : '–'}
              </span>
              {hasStartersXp && (
                <span className="text-xs sm:text-sm font-bold text-cyan-400/75 leading-none ml-1 whitespace-nowrap">
                  xP
                </span>
              )}
            </div>
            <div className="h-4 flex items-center mt-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8b92a5] leading-none whitespace-nowrap">
                Startelf xP
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end min-w-0">
            <div className="h-6 sm:h-7 flex items-baseline justify-end">
              <span className="text-lg sm:text-2xl font-extrabold text-white leading-none tabular-nums whitespace-nowrap">
                {formatCompactMoney(startersValue)}
              </span>
            </div>
            <div className="h-4 flex items-center justify-end mt-1">
              {hasStartersTrend ? (
                <MarketTrendBadge amount={startersTrend} dir={null} />
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8b92a5] leading-none whitespace-nowrap">
                  Startelf-Wert
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Radialer Tausch-Overlay (Spielfeld abgedunkelt + Optionen kreisfoermig um Spieler) */}
        {swapState && (
          <div
            className="absolute inset-0 z-20 bg-black/45 transition-opacity duration-200"
            onClick={closeSwap}
            role="presentation"
          >
            {/* Feine gestrichelte Verbindungslinien vom Spieler zu jeder Tausch-Option */}
            {swapState.options.length > 0 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-20"
                width={swapState.pitchW}
                height={swapState.pitchH}
              >
                {swapState.options.map((opt) => (
                  <line
                    key={opt.player.id}
                    x1={swapState.cx}
                    y1={swapState.cy}
                    x2={orbitalExpanded ? opt.x : swapState.cx}
                    y2={orbitalExpanded ? opt.y : swapState.cy}
                    stroke={opt.samePosition ? 'rgba(52, 211, 153, 0.35)' : 'rgba(251, 191, 36, 0.35)'}
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    className="transition-all duration-200"
                  />
                ))}
              </svg>
            )}

            {/* Obere Aktionsleiste im Tausch-Modus: Spielerprofil oeffnen & Schliessen */}
            <div className="absolute top-3.5 left-4 right-4 sm:top-5 sm:left-6 sm:right-6 z-40 flex items-center justify-between gap-2 pointer-events-none">
              {!swapState.target.isDummy ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPlayerDetail(swapState.target.id);
                  }}
                  className="pointer-events-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full oct-pill bg-[#171717] border border-white/15 text-[11px] font-semibold text-gray-200 hover:border-white/30 hover:text-white transition-colors cursor-pointer"
                >
                  <span>Profil</span>
                  <ArrowUpRight size={12} className="text-[#ff5c3e]" />
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeSwap();
                }}
                aria-label="Tausch abbrechen"
                className="pointer-events-auto w-7 h-7 rounded-full oct-sm bg-[#171717] border border-white/15 flex items-center justify-center text-gray-300 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Ausgewaehlter Spieler hervorgehoben am Originalplatz */}
            <SelectedSwapAnchor
              player={swapState.target}
              x={swapState.cx}
              y={swapState.cy}
              sizePx={swapState.sizePx}
              xp={swapTargetXp}
              onClose={closeSwap}
            />

            {/* Kreisfoermige Tausch-Optionen */}
            {swapState.options.map((opt, idx) => (
              <OrbitalOptionCircle
                key={opt.player.id}
                option={opt}
                originX={swapState.cx}
                originY={swapState.cy}
                targetX={opt.x}
                targetY={opt.y}
                expanded={orbitalExpanded}
                delayMs={idx * 25}
                onSelect={handlePerformSwap}
              />
            ))}

            {/* Hinweis falls kein gueltiger Bankspieler verfuegbar (z. B. nur 1 TW im Kader) */}
            {swapState.options.length === 0 && (
              <div
                style={{
                  left: Math.max(110, Math.min(swapState.pitchW - 110, swapState.cx)),
                  top: swapState.cy > swapState.pitchH * 0.55 ? swapState.cy - 68 : swapState.cy + 74,
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={(e) => e.stopPropagation()}
                className="absolute z-30 px-3 py-1.5 rounded-full bg-[#171717] border border-white/15 text-[11px] font-semibold text-[#8b92a5] whitespace-nowrap shadow-xl"
              >
                Kein Ersatz auf der Bank
              </div>
            )}
          </div>
        )}
      </div>

      {/* Direktlink in die installierte Kickbase-App im Kickbase-Brand- & Oktagon-Design */}
      <a
        href={KICKBASE_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="oct-md mt-3 w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-[#ff4b2b] via-[#ff5c3e] to-[#e0381e] text-white shadow-[0_8px_24px_-10px_rgba(255,75,43,0.65)] hover:brightness-110 transition-all active:scale-[0.99] group"
        style={{ '--oct-bd': 'rgba(255, 255, 255, 0.28)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Kickbase K-Emblem im scharfen Hexagon */}
          <span className="hex-beacon w-8 h-8 bg-black/85 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polygon points="5,3 9.5,3 9.5,21 5,21" fill="#ffffff" />
              <polygon points="9.5,11.8 16.5,3 20.5,3 13.5,12 20.5,21 16.2,21 9.5,12.5" fill="#ff5c3e" />
            </svg>
          </span>
          <div className="min-w-0 text-left">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/80 leading-none">
              KICKBASE
            </div>
            <div className="text-xs sm:text-sm font-extrabold tracking-tight text-white leading-tight mt-0.5 truncate">
              Weiter in der Kickbase App
            </div>
          </div>
        </div>
        <span className="oct-sm oct-bd-none w-7 h-7 bg-black/25 flex items-center justify-center shrink-0 group-hover:translate-x-0.5 transition-transform">
          <ExternalLink size={14} className="text-white" />
        </span>
      </a>

      {/* Liste unterhalb des Fussballfelds: nach Positionen gruppiert im einheitlichen Karten-Design */}
      <div className="mt-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-200">
            Kader nach Position
          </h3>
        </div>

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
                {group.players.map((player) => {
                  const xpInfo = xpById.get(String(player.id));
                  return (
                    <SquadListRow
                      key={player.id}
                      player={player}
                      isBench={!starterIds.has(String(player.id))}
                      xpSeason={xpInfo?.xpNext ?? xpInfo?.xpSeason}
                      onPlayerClick={openPlayerDetail}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CurrentSquadView;
