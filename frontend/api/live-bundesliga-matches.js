// Live Bundesliga-Partien, Ergebnisse & Spielereignisse ueber die freie
// OpenLigaDB-API (https://api.openligadb.de) - ohne API-Key, ohne Kickbase-Login.
// Wird vom "Echte Teams"-Bereich auf der Live-Seite genutzt (On-Demand +
// automatisches Live-Polling waehrend laufender Bundesliga-Spiele).

const OPENLIGA_BASE = 'https://api.openligadb.de';

function getDefaultBundesligaSeason(now = new Date()) {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function formatEventMinute(minute, isOvertime) {
  if (typeof minute !== 'number' || Number.isNaN(minute)) return '';
  if (isOvertime && minute > 45 && minute < 60) {
    return `45+${minute - 45}'`;
  }
  if (minute > 90) {
    return `90+${minute - 90}'`;
  }
  return `${minute}'`;
}

function computeEstimatedLiveClock(elapsedMin, hasHalfTime, maxGoalMinute) {
  if (typeof elapsedMin !== 'number' || elapsedMin < 0) return null;
  if (hasHalfTime && elapsedMin >= 45 && elapsedMin <= 63 && maxGoalMinute <= 45) {
    return 'HZ';
  }
  if (elapsedMin <= 45) {
    return `${Math.max(1, elapsedMin)}'`;
  }
  if (elapsedMin <= 50 && !hasHalfTime) {
    return `45+${elapsedMin - 45}'`;
  }
  if (elapsedMin < 60 && maxGoalMinute <= 45) {
    return 'HZ';
  }
  const secondHalfMin = Math.max(46, elapsedMin - 15);
  if (maxGoalMinute > secondHalfMin) {
    return formatEventMinute(maxGoalMinute, maxGoalMinute > 90);
  }
  if (secondHalfMin > 90) {
    return `90+${Math.min(15, secondHalfMin - 90)}'`;
  }
  return `${secondHalfMin}'`;
}

function normalizeMatch(m, nowMs) {
  const kickoffUtc = m.matchDateTimeUTC || null;
  const kickoffMs = kickoffUtc ? Date.parse(kickoffUtc) : NaN;
  const isFinished = Boolean(m.matchIsFinished);
  const isStarted = Number.isFinite(kickoffMs) && nowMs >= kickoffMs;
  const elapsedMin = isStarted ? Math.floor((nowMs - kickoffMs) / 60000) : null;
  const isLive = isStarted && !isFinished && elapsedMin !== null && elapsedMin < 210;
  const isImminent = !isStarted && Number.isFinite(kickoffMs) && kickoffMs - nowMs > 0 && kickoffMs - nowMs <= 30 * 60 * 1000;

  const results = Array.isArray(m.matchResults) ? m.matchResults : [];
  const halfTimeRes = results.find((r) => r.resultTypeID === 1 || r.resultTypeKind === 'HalfTime') || null;
  const finalRes =
    results.find((r) => r.resultTypeID === 2 || r.resultTypeKind === 'After90Minutes') ||
    [...results].sort((a, b) => (b.resultOrderID ?? 0) - (a.resultOrderID ?? 0))[0] ||
    null;

  const rawGoals = Array.isArray(m.goals) ? [...m.goals] : [];
  rawGoals.sort((a, b) => {
    const totalA = (a.scoreTeam1 ?? 0) + (a.scoreTeam2 ?? 0);
    const totalB = (b.scoreTeam1 ?? 0) + (b.scoreTeam2 ?? 0);
    if (totalA !== totalB) return totalA - totalB;
    const minA = a.matchMinute ?? 0;
    const minB = b.matchMinute ?? 0;
    if (minA !== minB) return minA - minB;
    return (a.goalID ?? 0) - (b.goalID ?? 0);
  });

  let prevHome = 0;
  let prevAway = 0;
  let maxGoalMinute = 0;
  const events = rawGoals.map((g, idx) => {
    const scoreHome = typeof g.scoreTeam1 === 'number' ? g.scoreTeam1 : prevHome;
    const scoreAway = typeof g.scoreTeam2 === 'number' ? g.scoreTeam2 : prevAway;

    let side = 'home';
    if (g.scoringTeamId != null && m.team1?.teamId != null && g.scoringTeamId === m.team1.teamId) {
      side = 'home';
    } else if (g.scoringTeamId != null && m.team2?.teamId != null && g.scoringTeamId === m.team2.teamId) {
      side = 'away';
    } else if (scoreAway > prevAway && scoreHome === prevHome) {
      side = 'away';
    }

    prevHome = scoreHome;
    prevAway = scoreAway;

    const minute = typeof g.matchMinute === 'number' ? g.matchMinute : null;
    if (minute != null && minute > maxGoalMinute) {
      maxGoalMinute = minute;
    }

    const isPenalty = Boolean(g.isPenalty);
    const isOwnGoal = Boolean(g.isOwnGoal);
    const isOvertime = Boolean(g.isOvertime);

    return {
      id: g.goalID ?? `${m.matchID}-${idx}`,
      type: isOwnGoal ? 'own_goal' : isPenalty ? 'penalty' : 'goal',
      label: isOwnGoal ? 'Eigentor' : isPenalty ? 'Elfmeter' : 'Tor',
      minute,
      minuteLabel: formatEventMinute(minute, isOvertime),
      scorer: (g.goalGetterName || '').trim() || 'Torschütze unbekannt',
      side,
      scoreHome,
      scoreAway,
      isPenalty,
      isOwnGoal,
      isOvertime,
      comment: (g.comment || '').trim() || null,
    };
  });

  let score = null;
  if (finalRes && typeof finalRes.pointsTeam1 === 'number' && typeof finalRes.pointsTeam2 === 'number') {
    score = { home: finalRes.pointsTeam1, away: finalRes.pointsTeam2 };
  } else if (events.length > 0) {
    const last = events[events.length - 1];
    score = { home: last.scoreHome, away: last.scoreAway };
  } else if (halfTimeRes && typeof halfTimeRes.pointsTeam1 === 'number' && typeof halfTimeRes.pointsTeam2 === 'number') {
    score = { home: halfTimeRes.pointsTeam1, away: halfTimeRes.pointsTeam2 };
  } else if (isLive) {
    score = { home: 0, away: 0 };
  }

  const halfTimeScore =
    halfTimeRes && typeof halfTimeRes.pointsTeam1 === 'number' && typeof halfTimeRes.pointsTeam2 === 'number'
      ? { home: halfTimeRes.pointsTeam1, away: halfTimeRes.pointsTeam2 }
      : null;

  return {
    matchId: m.matchID,
    matchday: m.group?.groupOrderID ?? null,
    matchdayName: m.group?.groupName ?? null,
    kickoffUtc,
    kickoffLocal: m.matchDateTime || null,
    isFinished,
    isLive,
    isImminent,
    status: isFinished ? 'finished' : isLive ? 'live' : 'upcoming',
    liveClock: isLive ? computeEstimatedLiveClock(elapsedMin, Boolean(halfTimeScore), maxGoalMinute) : null,
    home: {
      openLigaId: m.team1?.teamId ?? null,
      name: m.team1?.teamName || '',
      shortName: m.team1?.shortName || m.team1?.teamName || '',
      logo: m.team1?.teamIconUrl || null,
    },
    away: {
      openLigaId: m.team2?.teamId ?? null,
      name: m.team2?.teamName || '',
      shortName: m.team2?.shortName || m.team2?.teamName || '',
      logo: m.team2?.teamIconUrl || null,
    },
    score,
    halfTimeScore,
    events,
    location: m.location?.locationStadium
      ? {
          stadium: m.location.locationStadium,
          city: m.location.locationCity || null,
        }
      : null,
    viewers: typeof m.numberOfViewers === 'number' ? m.numberOfViewers : null,
    lastUpdate: m.lastUpdateDateTime || null,
  };
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const { matchday, season, mode, nocache } = req.query || {};

  // Leichtgewichtiger Check fuer das Live-Polling: liefert nur den letzten
  // Aenderungszeitstempel des Spieltags (OpenLigaDB-Empfehlung fuer Polling).
  if (mode === 'lastchange') {
    const dayNum = parseInt(matchday, 10);
    const seasonNum = parseInt(season, 10) || getDefaultBundesligaSeason();
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 34) {
      return res.status(400).json({ error: 'Gueltiger Spieltag (1-34) erforderlich' });
    }
    const lastChange = await fetchJson(`${OPENLIGA_BASE}/getlastchangedate/bl1/${seasonNum}/${dayNum}`);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      season: seasonNum,
      matchday: dayNum,
      lastChange: typeof lastChange === 'string' ? lastChange : null,
      fetchedAt: new Date().toISOString(),
    });
  }

  const parsedDay = matchday != null && matchday !== '' ? parseInt(matchday, 10) : null;
  if (parsedDay !== null && (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 34)) {
    return res.status(400).json({ error: 'Ungueltiger Spieltag (erwartet 1-34)' });
  }

  const parsedSeason = season != null && season !== '' ? parseInt(season, 10) : null;
  const resolvedSeason =
    parsedSeason && Number.isInteger(parsedSeason) && parsedSeason >= 2005 && parsedSeason <= 2100
      ? parsedSeason
      : getDefaultBundesligaSeason();

  const matchesUrl = parsedDay
    ? `${OPENLIGA_BASE}/getmatchdata/bl1/${resolvedSeason}/${parsedDay}`
    : `${OPENLIGA_BASE}/getmatchdata/bl1`;

  const [rawMatches, currentGroup] = await Promise.all([
    fetchJson(matchesUrl),
    parsedDay ? fetchJson(`${OPENLIGA_BASE}/getcurrentgroup/bl1`) : Promise.resolve(null),
  ]);

  if (!Array.isArray(rawMatches)) {
    return res.status(502).json({ error: 'OpenLigaDB konnte nicht erreicht werden' });
  }

  const nowMs = Date.now();
  const matches = rawMatches
    .map((m) => normalizeMatch(m, nowMs))
    .sort((a, b) => {
      const ta = a.kickoffUtc ? Date.parse(a.kickoffUtc) : 0;
      const tb = b.kickoffUtc ? Date.parse(b.kickoffUtc) : 0;
      if (ta !== tb) return ta - tb;
      return (a.matchId ?? 0) - (b.matchId ?? 0);
    });

  const first = rawMatches[0] || null;
  const resolvedMatchday = parsedDay ?? first?.group?.groupOrderID ?? null;
  const currentMatchday = currentGroup?.groupOrderID ?? (parsedDay ? null : resolvedMatchday);
  const seasonValue = first?.leagueSeason ?? resolvedSeason;
  const hasLiveMatch = matches.some((m) => m.isLive);
  const hasImminentMatch = matches.some((m) => m.isImminent);

  let latestUpdate = null;
  for (const m of matches) {
    if (m.lastUpdate && (!latestUpdate || m.lastUpdate > latestUpdate)) {
      latestUpdate = m.lastUpdate;
    }
  }

  if (nocache === '1' || hasLiveMatch || hasImminentMatch) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  } else {
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  }

  return res.status(200).json({
    source: 'openligadb',
    leagueShortcut: 'bl1',
    leagueName: first?.leagueName || `1. Fußball-Bundesliga ${seasonValue}/${seasonValue + 1}`,
    season: seasonValue,
    matchday: resolvedMatchday,
    matchdayName: first?.group?.groupName || (resolvedMatchday ? `${resolvedMatchday}. Spieltag` : null),
    currentMatchday,
    hasLiveMatch,
    hasImminentMatch,
    lastChange: latestUpdate,
    fetchedAt: new Date().toISOString(),
    matches,
  });
}
