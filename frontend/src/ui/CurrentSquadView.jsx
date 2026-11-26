import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { buildLineupWithDummies } from '../liveLineupUtils';
import { normalizeStartProbCode } from '../startProbMeta';
import { loadPlayerCatalogBundle } from '../playerDetailData';
import StartProbBadge from './StartProbBadge';
import PlayerRowCard from './PlayerRowCard';

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

const SquadPitchCircle = ({ player, size, containerSize, onPlayerClick }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fullImgUrl = player.imagePath ? `${IMAGE_BASE}${player.imagePath}` : null;
  const showPhoto = !player.isDummy && fullImgUrl && !isDummyImage(fullImgUrl) && !imgFailed;
  const clickable = !player.isDummy && player.id != null && Boolean(onPlayerClick);

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onPlayerClick(player.id) : undefined}
      onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onPlayerClick(player.id) : undefined}
      className={`flex flex-col items-center ${containerSize} select-none ${clickable ? 'cursor-pointer transition-transform hover:scale-105 active:scale-95' : ''}`}
    >
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

      <span className={`mt-1.5 text-[10px] sm:text-[11px] font-semibold truncate max-w-full text-center leading-tight ${player.isDummy ? 'text-[#525866]' : 'text-gray-100'}`}>
        {player.isDummy ? 'Frei' : (player.lastName || player.name)}
      </span>
    </div>
  );
};

const SquadPitchRow = ({ players, onPlayerClick }) => {
  if (!players || players.length === 0) return null;
  const itemCount = players.length;
  const size = itemCount > 4 ? 'w-12 h-12 sm:w-14 sm:h-14' : 'w-14 h-14 sm:w-16 sm:h-16';
  const containerSize = itemCount > 4 ? 'w-[62px] sm:w-[76px]' : 'w-[72px] sm:w-[86px]';
  return (
    <div className="flex justify-center items-start flex-nowrap gap-1 sm:gap-4 w-full px-2 mb-4 last:mb-0">
      {players.map((p) => (
        <SquadPitchCircle key={p.id} player={p} size={size} containerSize={containerSize} onPlayerClick={onPlayerClick} />
      ))}
    </div>
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
  const openPlayerDetail = (pid) => {
    if (pid != null) navigate(`/player/${encodeURIComponent(String(pid))}`);
  };

  useEffect(() => {
    let cancelled = false;
    loadSquadXpMap().then((map) => {
      if (!cancelled) setXpById(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    pitchLineup,
    starterIds,
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
    const { starters: stList, starterIds: stIds } = splitStartersAndBench(normalized, liveStartingIds);
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
      starterIds: stIds,
      groupedByPosition: groups,
      startersValue: sumStartersMv,
      startersTrend: sumStartersTrend,
      hasStartersTrend: startersTrendFound,
      startersXp: Math.round(sumStartersXp),
      hasStartersXp: startersXpFound,
      formationLabel: stList.length > 0 ? `${awCount}-${mfCount}-${stCount}` : null,
    };
  }, [players, liveStartingIds, xpById]);

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
          <SquadPitchRow players={st} onPlayerClick={openPlayerDetail} />
          <SquadPitchRow players={mf} onPlayerClick={openPlayerDetail} />
          <SquadPitchRow players={aw} onPlayerClick={openPlayerDetail} />
          <SquadPitchRow players={tw} onPlayerClick={openPlayerDetail} />
        </div>

        <div className="relative z-10 flex items-start justify-between gap-3 mx-6 sm:mx-8 mt-4 pt-3 border-t border-white/[0.07]">
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
                      xpSeason={xpInfo?.xpSeason}
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
