import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy } from './icons';
import ManagerAvatar from './ManagerAvatar';
import LiveLineupPitch from './LiveLineupGrid';
import { buildLineupWithDummies } from '../liveLineupUtils';
import { loadPlayerCatalogBundle } from '../playerDetailData';

const ROUND_MAP = [
  { name: 'Sechzehntelfinale', keys: ['roundOf32Left', 'roundOf32Right'] },
  { name: 'Achtelfinale', keys: ['roundOf16Left', 'roundOf16Right'] },
  { name: 'Viertelfinale', keys: ['quarterFinalsLeft', 'quarterFinalsRight'] },
  { name: 'Halbfinale', keys: ['semiFinalsLeft', 'semiFinalsRight'] },
  { name: 'Finale', keys: ['final'] },
];

function findPokalMatch(pokalData, matchId, name1, name2) {
  if (!pokalData) return null;
  const schedule = pokalData.meta?.roundSchedule || {};

  if (matchId) {
    for (const round of ROUND_MAP) {
      for (const key of round.keys) {
        const found = (pokalData[key] || []).find((m) => m.id === matchId);
        if (found) {
          return {
            match: found,
            roundName: round.name,
            schedule: schedule[round.name] || null,
          };
        }
      }
    }
  }

  // Fallback: falls nur beide Namen bekannt sind, neueste Begegnung im Pokal finden
  if (name1 && name2) {
    for (let i = ROUND_MAP.length - 1; i >= 0; i--) {
      const round = ROUND_MAP[i];
      for (const key of round.keys) {
        const found = (pokalData[key] || []).find(
          (m) =>
            (m.p1 === name1 && m.p2 === name2) ||
            (m.p1 === name2 && m.p2 === name1)
        );
        if (found) {
          return {
            match: found,
            roundName: round.name,
            schedule: schedule[round.name] || null,
          };
        }
      }
    }
  }

  return null;
}

const PokalMatchupSection = ({ pokalMatchId, user1, user2 }) => {
  const navigate = useNavigate();
  const [pokalData, setPokalData] = useState(null);
  const [lineupsFile, setLineupsFile] = useState(null);
  const [catalogBundle, setCatalogBundle] = useState(null);
  const [loadedKey, setLoadedKey] = useState(null);

  // 'u1' = user1 (links, #ff5c3e), 'u2' = user2 (rechts, #3b82f6)
  const [activeSide, setActiveSide] = useState('u1');
  // On-demand Live-/Fallback-Ergebnisse pro userId, damit Hin- und Herschalten sofort geht
  const [liveByUserId, setLiveByUserId] = useState({});
  const inFlightIdsRef = useRef(new Set());

  const currentKey = pokalMatchId || '__default__';
  const initialLoading = loadedKey !== currentKey;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/pokal-data.json?t=${Date.now()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/history/pokal-lineups.json?t=${Date.now()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      loadPlayerCatalogBundle().catch(() => null),
    ]).then(([pokalJson, lineupsJson, bundle]) => {
      if (cancelled) return;
      setPokalData(pokalJson);
      setLineupsFile(lineupsJson);
      setCatalogBundle(bundle);
      setLoadedKey(currentKey);
    });
    return () => {
      cancelled = true;
    };
  }, [currentKey]);

  const matchInfo = useMemo(
    () => findPokalMatch(pokalData, pokalMatchId, user1?.name, user2?.name),
    [pokalData, pokalMatchId, user1?.name, user2?.name]
  );

  const match = matchInfo?.match || null;
  const roundName = matchInfo?.roundName || null;
  const schedule = matchInfo?.schedule || null;
  const matchday = schedule?.matchday ?? null;

  // Reihenfolge aus pokal-data.json auf (user1, user2) abbilden, falls user1 im Bracket p2 ist
  const isReversed = Boolean(match && user1?.name && match.p2 === user1.name && match.p1 === user2?.name);
  const score1 = match ? (isReversed ? match.score2 : match.score1) : null;
  const score2 = match ? (isReversed ? match.score1 : match.score2) : null;
  const winner1 = match ? (isReversed ? match.winner === 2 : match.winner === 1) : false;
  const winner2 = match ? (isReversed ? match.winner === 1 : match.winner === 2) : false;
  const hasResult = Boolean(
    match &&
      (match.winner != null ||
        match.provisional ||
        (score1 || 0) !== 0 ||
        (score2 || 0) !== 0)
  );

  const activeUser = activeSide === 'u1' ? user1 : user2;
  const activeScore = activeSide === 'u1' ? score1 : score2;
  const activeUserId = activeUser?.id ? String(activeUser.id) : null;

  const staticDayEntry = matchday != null ? lineupsFile?.matchdays?.[String(matchday)] : null;
  const staticManagerEntry = activeUserId ? staticDayEntry?.managers?.[activeUserId] || null : null;

  const isProvisional = Boolean(match?.provisional);
  const isUpcoming = Boolean(match && !hasResult);
  const needsLiveFetch = Boolean(
    !initialLoading &&
      match &&
      matchday != null &&
      activeUserId &&
      !isUpcoming &&
      (isProvisional || !staticManagerEntry)
  );

  // Live-/API-Abruf fuer laufende Pokal-Spieltage oder falls fuer den Manager
  // noch kein Eintrag in pokal-lineups.json existiert.
  useEffect(() => {
    if (!needsLiveFetch || !activeUserId || matchday == null) return undefined;
    const reqKey = `${matchday}:${activeUserId}`;
    if (liveByUserId[activeUserId] || inFlightIdsRef.current.has(reqKey)) return undefined;

    let cancelled = false;
    inFlightIdsRef.current.add(reqKey);

    fetch(`/api/live-lineup?leagueKey=POKAL&userId=${encodeURIComponent(activeUserId)}&dayNumber=${encodeURIComponent(String(matchday))}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        setLiveByUserId((prev) => ({
          ...prev,
          [activeUserId]: json || { players: [], unavailable: true },
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setLiveByUserId((prev) => ({
          ...prev,
          [activeUserId]: { players: [], unavailable: true },
        }));
      })
      .finally(() => {
        inFlightIdsRef.current.delete(reqKey);
      });

    return () => {
      cancelled = true;
    };
  }, [needsLiveFetch, activeUserId, matchday, liveByUserId]);

  // Bevorzuge Live-API bei provisorischer/laufender Runde, sonst das gespeicherte pokal-lineups.json
  const activeSource = useMemo(() => {
    if (!activeUserId) return null;
    const liveData = liveByUserId[activeUserId];
    if (isProvisional && liveData && Array.isArray(liveData.players) && liveData.players.length > 0) {
      return {
        source: 'live',
        players: liveData.players,
        officialPoints: liveData.officialPoints ?? null,
        emptySlots: liveData.emptySlots ?? 0,
      };
    }
    if (staticManagerEntry) {
      return {
        source: 'static',
        players: staticManagerEntry.players || [],
        officialPoints: staticManagerEntry.pointsMatchday ?? null,
        emptySlots: staticManagerEntry.emptySlots ?? 0,
      };
    }
    if (liveData && !liveData.unavailable) {
      return {
        source: 'live',
        players: liveData.players || [],
        officialPoints: liveData.officialPoints ?? null,
        emptySlots: liveData.emptySlots ?? 0,
      };
    }
    return null;
  }, [activeUserId, isProvisional, liveByUserId, staticManagerEntry]);

  const enrichedLineup = useMemo(() => {
    if (!activeSource || !Array.isArray(activeSource.players) || activeSource.players.length === 0) {
      return null;
    }
    const catalogMap = catalogBundle?.catalogMap;
    const teamLogosById = catalogBundle?.teamLogosById;
    const mapped = activeSource.players
      .filter((p) => p && !p.error && p.playerId != null)
      .map((p) => {
        const pid = String(p.playerId);
        const full = catalogMap?.get(pid);
        const fullName = full ? `${full.fn || ''} ${full.ln || ''}`.trim() : p.name;
        const tid = p.teamId != null ? String(p.teamId) : full?.tid != null ? String(full.tid) : null;
        const oppTid = p.opponentTeamId != null ? String(p.opponentTeamId) : null;
        return {
          id: pid,
          position: full?.pos || 3,
          name: fullName || p.name || 'Spieler',
          lastName: full?.ln || p.name || 'Spieler',
          points: typeof p.points === 'number' ? p.points : 0,
          imagePath: full?.pim || p.imagePath || null,
          events: Array.isArray(p.events) ? p.events : [],
          teamLogo: tid ? teamLogosById?.get(tid) || null : null,
          opponentLogo: oppTid ? teamLogosById?.get(oppTid) || null : null,
          goalsFor: p.goalsFor,
          goalsAgainst: p.goalsAgainst,
          matchStatus: p.matchStatus,
          matchMinute: p.matchMinute,
        };
      });
    if (mapped.length === 0) return null;
    return buildLineupWithDummies(mapped);
  }, [activeSource, catalogBundle]);

  const displayTotalPoints = useMemo(() => {
    if (typeof activeSource?.officialPoints === 'number') return activeSource.officialPoints;
    if (hasResult && typeof activeScore === 'number') return activeScore;
    if (activeSource?.players?.length) {
      return activeSource.players.reduce((s, p) => s + (p?.points || 0), 0);
    }
    return null;
  }, [activeSource, activeScore, hasResult]);

  const isLoadingActiveLineup = Boolean(initialLoading || (needsLiveFetch && activeUserId && !liveByUserId[activeUserId]));

  // Falls kein Pokal-Match gefunden wurde (z.B. reiner Liga-Vergleich ohne Pokal-Kontext)
  if (!initialLoading && !match) {
    return null;
  }

  const handlePlayerClick = (player) => {
    if (Array.isArray(player?.events) && player.events.length > 0) {
      navigate('/live-player', { state: { player } });
    } else if (player?.id) {
      navigate(`/player/${player.id}`);
    }
  };

  const statusLabel = match?.walkover
    ? 'Kampflos'
    : match?.provisional
      ? 'Vorläufig'
      : match?.winner
        ? 'Endstand'
        : 'Anstehend';

  const statusClass = match?.provisional
    ? 'bg-amber-500/15 text-amber-300 border-amber-400/35'
    : match?.winner
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
      : 'bg-[#8b5cf6]/15 text-[#c4b5fd] border-[#8b5cf6]/35';

  const emptySlotsCount = activeSource?.emptySlots || 0;
  const playerPointsSum = (activeSource?.players || []).reduce((s, p) => s + (p?.points || 0), 0);
  const hasPenaltyDiff =
    emptySlotsCount > 0 &&
    typeof displayTotalPoints === 'number' &&
    displayTotalPoints !== playerPointsSum;

  return (
    <section className="mb-10">
      {/* Kompaktes Pokal-Duell-Banner im Spieltag-Look (Umschalter per 1-Tap) */}
      <div className="card-surface oct-md oct-bd-purple rounded-2xl p-3.5 mb-3 border border-[#8b5cf6]/35 shadow-[0_0_24px_rgba(139,92,246,0.08)]">
        {/* Kopfzeile: Runde, Spieltag & Status */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <Trophy size={13} className="text-[#8b5cf6] shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#c4b5fd] truncate">
              {roundName || 'Pokal-Duell'}
            </span>
            {schedule && (
              <span className="text-[10px] font-medium text-[#8b92a5] truncate hidden xs:inline">
                · ST {schedule.matchday} ({schedule.date})
              </span>
            )}
          </div>
          <span className={`oct-pill px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider shrink-0 ${statusClass}`}>
            {statusLabel}
          </span>
        </div>

        {/* 3-Spalten Match-Header (analog SelectedTeamMatchBanner im Spieltag-Tab) */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSide('u1')}
            className={`oct-md flex items-center justify-end gap-2 min-w-0 rounded-xl px-2 py-1.5 transition-all cursor-pointer border ${
              activeSide === 'u1'
                ? 'oct-bd-accent bg-[#ff5c3e]/14 border-[#ff5c3e]/50'
                : 'oct-bd-none border-transparent hover:bg-white/[0.04]'
            }`}
          >
            <span className={`text-xs sm:text-sm truncate text-right ${activeSide === 'u1' ? 'text-white font-bold' : 'text-gray-300 font-medium'}`}>
              {user1.name}
            </span>
            <ManagerAvatar name={user1.name} size={30} ringColor="#ff5c3e" ringWidth={1.3} />
          </button>

          <div className="oct-sm px-2.5 py-1.5 rounded-xl bg-black/55 border border-white/10 text-center min-w-[68px] tabular-nums">
            {hasResult ? (
              <span className="text-sm sm:text-base font-black whitespace-nowrap">
                <span className={winner1 ? 'text-emerald-400' : 'text-gray-300'}>{score1 ?? 0}</span>
                <span className="text-gray-600 mx-1">:</span>
                <span className={winner2 ? 'text-emerald-400' : 'text-gray-300'}>{score2 ?? 0}</span>
              </span>
            ) : (
              <span className="text-xs font-bold text-[#626978]">vs</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setActiveSide('u2')}
            className={`oct-md flex items-center justify-start gap-2 min-w-0 rounded-xl px-2 py-1.5 transition-all cursor-pointer border ${
              activeSide === 'u2'
                ? 'bg-[#3b82f6]/15 border-[#3b82f6]/55'
                : 'oct-bd-none border-transparent hover:bg-white/[0.04]'
            }`}
          >
            <ManagerAvatar name={user2.name} size={30} ringColor="#3b82f6" ringWidth={1.3} />
            <span className={`text-xs sm:text-sm truncate text-left ${activeSide === 'u2' ? 'text-white font-bold' : 'text-gray-300 font-medium'}`}>
              {user2.name}
            </span>
          </button>
        </div>

        {/* Explizite Kader-Umschalt-Buttons (wie "Startelf Heim / Startelf Gast" im Spieltag-Tab) */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => setActiveSide('u1')}
            className={`oct-md flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-[0.98] cursor-pointer min-w-0 border ${
              activeSide === 'u1'
                ? 'bg-[#ff5c3e] text-white border-[#ff5c3e] shadow-[0_0_16px_rgba(255,92,62,0.28)]'
                : 'bg-[#171717] text-gray-300 border-white/10 hover:border-[#ff5c3e]/50 hover:text-white'
            }`}
          >
            <span className="truncate">Kader {user1.name}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSide('u2')}
            className={`oct-md flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-[0.98] cursor-pointer min-w-0 border ${
              activeSide === 'u2'
                ? 'bg-[#3b82f6] text-white border-[#3b82f6] shadow-[0_0_16px_rgba(59,130,246,0.28)]'
                : 'bg-[#171717] text-gray-300 border-white/10 hover:border-[#3b82f6]/50 hover:text-white'
            }`}
          >
            <span className="truncate">Kader {user2.name}</span>
          </button>
        </div>
      </div>

      {/* Pokal-Startelf des gewaehlten Spielers */}
      {isUpcoming ? (
        <div className="card-surface oct-md rounded-2xl px-4 py-7 text-center border border-white/10">
          <div className="text-xs font-bold uppercase tracking-widest text-[#c4b5fd] mb-1">
            Pokal-Kader noch offen
          </div>
          <p className="text-xs text-[#8b92a5]">
            Die Aufstellungen von <span className="text-white font-semibold">{user1.name}</span> und{' '}
            <span className="text-white font-semibold">{user2.name}</span> erscheinen hier automatisch ab Anpfiff
            {schedule ? ` (BL-Spieltag ${schedule.matchday} · ${schedule.date})` : ''}.
          </p>
        </div>
      ) : isLoadingActiveLineup ? (
        <div className="card-surface oct-md rounded-2xl h-[360px] animate-pulse border border-white/10 flex items-center justify-center">
          <span className="text-xs font-semibold text-[#8b92a5]">
            Lade Pokal-Kader von {activeUser?.name}…
          </span>
        </div>
      ) : enrichedLineup ? (
        <div>
          <LiveLineupPitch
            key={`${match?.id || 'pokal'}-${activeUserId}`}
            lineup={enrichedLineup}
            totalPoints={displayTotalPoints}
            onPlayerClick={handlePlayerClick}
          />
          {hasPenaltyDiff && (
            <div className="mt-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-400/25 text-[11px] text-amber-200/90 text-center">
              Spielerpunkte: <span className="font-bold tabular-nums">{playerPointsSum}</span> ·{' '}
              {emptySlotsCount} {emptySlotsCount === 1 ? 'leere Position' : 'leere Positionen'} (−{emptySlotsCount * 100} Pkt.) → Offiziell:{' '}
              <span className="font-bold tabular-nums">{displayTotalPoints}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="card-surface oct-md rounded-2xl px-4 py-7 text-center border border-white/10">
          <div className="text-xs font-bold uppercase tracking-widest text-[#8b92a5] mb-1">
            Kein Pokal-Kader aufgestellt
          </div>
          <p className="text-xs text-[#626978]">
            Für <span className="text-gray-300 font-semibold">{activeUser?.name}</span> liegt für diese Pokalrunde
            {schedule ? ` (BL-Spieltag ${schedule.matchday})` : ''} keine Startelf in der Pokal-Liga vor
            {match?.walkover ? ' (Nichtantritt / kampflos)' : ''}.
          </p>
        </div>
      )}
    </section>
  );
};

export default PokalMatchupSection;
