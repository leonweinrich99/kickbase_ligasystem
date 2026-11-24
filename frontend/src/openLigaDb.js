// Client-Hilfsfunktionen fuer die Bundesliga-Live-Abfragen via OpenLigaDB.
// Ruft primaer die eigene Vercel-Route /api/live-bundesliga-matches auf und
// faellt lokal (z.B. reines `vite dev` ohne Vercel-Functions) nahtlos auf die
// CORS-faehige OpenLigaDB-REST-API zurueck.

const OPENLIGA_BASE = 'https://api.openligadb.de';

const getDefaultBundesligaSeason = (now = new Date()) =>
  now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

export const formatEventMinute = (minute, isOvertime) => {
  if (typeof minute !== 'number' || Number.isNaN(minute)) return '';
  if (isOvertime && minute > 45 && minute < 60) {
    return `45+${minute - 45}'`;
  }
  if (minute > 90) {
    return `90+${minute - 90}'`;
  }
  return `${minute}'`;
};

const computeEstimatedLiveClock = (elapsedMin, hasHalfTime, maxGoalMinute) => {
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
};

const normalizeOpenLigaMatch = (m, nowMs) => {
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
};

const fetchOpenLigaDirect = async ({ matchday = null, season = null } = {}) => {
  const resolvedSeason = season || getDefaultBundesligaSeason();
  const url = matchday
    ? `${OPENLIGA_BASE}/getmatchdata/bl1/${resolvedSeason}/${matchday}`
    : `${OPENLIGA_BASE}/getmatchdata/bl1`;

  const [matchRes, groupRes] = await Promise.all([
    fetch(url, { headers: { Accept: 'application/json' } }),
    matchday ? fetch(`${OPENLIGA_BASE}/getcurrentgroup/bl1`, { headers: { Accept: 'application/json' } }).catch(() => null) : Promise.resolve(null),
  ]);

  if (!matchRes.ok) {
    throw new Error('Bundesliga-Partien konnten nicht von OpenLigaDB geladen werden');
  }
  const rawMatches = await matchRes.json();
  if (!Array.isArray(rawMatches)) {
    throw new Error('Unerwartete Antwort von OpenLigaDB');
  }
  const currentGroup = groupRes && groupRes.ok ? await groupRes.json().catch(() => null) : null;

  const nowMs = Date.now();
  const matches = rawMatches
    .map((m) => normalizeOpenLigaMatch(m, nowMs))
    .sort((a, b) => {
      const ta = a.kickoffUtc ? Date.parse(a.kickoffUtc) : 0;
      const tb = b.kickoffUtc ? Date.parse(b.kickoffUtc) : 0;
      if (ta !== tb) return ta - tb;
      return (a.matchId ?? 0) - (b.matchId ?? 0);
    });

  const first = rawMatches[0] || null;
  const resolvedMatchday = matchday ?? first?.group?.groupOrderID ?? null;
  const currentMatchday = currentGroup?.groupOrderID ?? (matchday ? null : resolvedMatchday);
  const seasonValue = first?.leagueSeason ?? resolvedSeason;

  let latestUpdate = null;
  for (const m of matches) {
    if (m.lastUpdate && (!latestUpdate || m.lastUpdate > latestUpdate)) {
      latestUpdate = m.lastUpdate;
    }
  }

  return {
    source: 'openligadb-direct',
    leagueShortcut: 'bl1',
    leagueName: first?.leagueName || `1. Fußball-Bundesliga ${seasonValue}/${seasonValue + 1}`,
    season: seasonValue,
    matchday: resolvedMatchday,
    matchdayName: first?.group?.groupName || (resolvedMatchday ? `${resolvedMatchday}. Spieltag` : null),
    currentMatchday,
    hasLiveMatch: matches.some((m) => m.isLive),
    hasImminentMatch: matches.some((m) => m.isImminent),
    lastChange: latestUpdate,
    fetchedAt: new Date().toISOString(),
    matches,
  };
};

export const fetchBundesligaMatches = async ({ matchday = null, season = null, nocache = false } = {}) => {
  const params = new URLSearchParams();
  if (matchday != null) params.set('matchday', String(matchday));
  if (season != null) params.set('season', String(season));
  if (nocache) params.set('nocache', '1');
  const query = params.toString();

  try {
    const res = await fetch(`/api/live-bundesliga-matches${query ? `?${query}` : ''}`);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const json = await res.json();
      if (Array.isArray(json?.matches)) {
        return json;
      }
    }
  } catch {
    // Fallback auf direkten OpenLigaDB-Abruf
  }

  return fetchOpenLigaDirect({ matchday, season });
};

export const fetchBundesligaLastChange = async ({ season, matchday }) => {
  if (!season || !matchday) return null;
  try {
    const res = await fetch(`/api/live-bundesliga-matches?mode=lastchange&season=${season}&matchday=${matchday}`);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const json = await res.json();
      return json?.lastChange ?? null;
    }
  } catch {
    // Fallback auf direkten OpenLigaDB-Abruf
  }

  try {
    const res = await fetch(`${OPENLIGA_BASE}/getlastchangedate/bl1/${season}/${matchday}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
};

// Verein-Normalisierung fuer das Mapping zwischen OpenLigaDB-Vereinsnamen
// (z.B. "Borussia Mönchengladbach", "Hamburger SV", "FC Schalke 04") und
// Kickbase-Teamnamen (z.B. "M'gladbach", "Hamburg", "Schalke").
const normalizeClubName = (str) =>
  String(str || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const CLUB_ALIAS_TOKENS = [
  ['gladbach', 'moenchengladbach', 'm gladbach', 'bmg'],
  ['hamburg', 'hamburger', 'hsv'],
  ['schalke', 's04'],
  ['bayern', 'fcb', 'muenchen'],
  ['dortmund', 'bvb'],
  ['leverkusen', 'bayer 04', 'b04'],
  ['frankfurt', 'eintracht', 'sge'],
  ['leipzig', 'rb leipzig', 'rbl'],
  ['union berlin', 'union'],
  ['koeln', 'fc koeln'],
  ['mainz', 'fsv mainz'],
  ['stuttgart', 'vfb'],
  ['bremen', 'werder'],
  ['freiburg', 'sc freiburg'],
  ['augsburg', 'fca'],
  ['hoffenheim', 'tsg'],
  ['paderborn', 'sc paderborn'],
  ['elversberg', 'sv 07 elversberg'],
  ['wolfsburg', 'vfl wolfsburg'],
  ['heidenheim', 'fch'],
  ['bochum', 'vfl bochum'],
  ['pauli', 'st pauli'],
  ['kiel', 'holstein'],
  ['hertha', 'hertha bsc'],
];

const getClubCanonicalGroup = (name) => {
  const norm = normalizeClubName(name);
  if (!norm) return null;
  for (let i = 0; i < CLUB_ALIAS_TOKENS.length; i += 1) {
    if (CLUB_ALIAS_TOKENS[i].some((alias) => norm === alias || norm.includes(alias))) {
      return i;
    }
  }
  return null;
};

export const matchOpenLigaTeamToKickbase = (openLigaTeam, kickbaseTeams) => {
  if (!openLigaTeam || !Array.isArray(kickbaseTeams) || kickbaseTeams.length === 0) {
    return null;
  }

  const candidateNames = [openLigaTeam.shortName, openLigaTeam.name].filter(Boolean);
  const candidateNorms = candidateNames.map(normalizeClubName).filter(Boolean);
  const candidateGroups = candidateNames.map(getClubCanonicalGroup).filter((g) => g !== null);

  for (const kb of kickbaseTeams) {
    const kbNorm = normalizeClubName(kb.name);
    if (!kbNorm) continue;
    if (candidateNorms.some((c) => c === kbNorm)) {
      return kb;
    }
  }

  if (candidateGroups.length > 0) {
    for (const kb of kickbaseTeams) {
      const kbGroup = getClubCanonicalGroup(kb.name);
      if (kbGroup !== null && candidateGroups.includes(kbGroup)) {
        return kb;
      }
    }
  }

  for (const kb of kickbaseTeams) {
    const kbNorm = normalizeClubName(kb.name);
    if (!kbNorm) continue;
    if (candidateNorms.some((c) => c.includes(kbNorm) || kbNorm.includes(c))) {
      return kb;
    }
  }

  return null;
};

export const findOpenLigaMatchForKickbaseTeam = (matches, kickbaseTeam) => {
  if (!Array.isArray(matches) || !kickbaseTeam) return null;
  const list = [kickbaseTeam];
  for (const m of matches) {
    if (matchOpenLigaTeamToKickbase(m.home, list)) {
      return { match: m, side: 'home' };
    }
    if (matchOpenLigaTeamToKickbase(m.away, list)) {
      return { match: m, side: 'away' };
    }
  }
  return null;
};

// Leitet die Bundesliga-Vereinsliste (Kickbase-Team-ID + Name + Logo) direkt
// aus all_players.json ab, sodass das OpenLigaDB-Event-Matching auch im
// "Mein Kader"- und "Liga-Manager"-Modus ganz ohne Extra-API-Call funktioniert.
export const buildKickbaseTeamsFromPlayers = (allPlayers) => {
  const byId = new Map();
  for (const p of allPlayers || []) {
    if (p?.tid == null || !p?.tn) continue;
    const id = String(p.tid);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: p.tn,
        logo: p.tim ? `https://kickbase.b-cdn.net/${p.tim}` : null,
      });
    }
  }
  return Array.from(byId.values());
};

export const mergeKickbaseTeams = (primaryTeams, secondaryTeams) => {
  const byId = new Map();
  for (const t of secondaryTeams || []) {
    if (t?.id != null) byId.set(String(t.id), { ...t, id: String(t.id) });
  }
  for (const t of primaryTeams || []) {
    if (t?.id != null) byId.set(String(t.id), { ...t, id: String(t.id) });
  }
  return Array.from(byId.values());
};

// Erkennt beim Live-Polling neu gefallene Tore, Spielstandsaenderungen,
// Halbzeitpfiff und Abpfiff (relevant fuer Sieg-/Zu-Null-/Minutenboni).
export const diffBundesligaMatches = (prevMatches, nextMatches) => {
  const changedMatchIds = new Set();
  const newEventIds = new Set();
  const triggeredMatches = [];
  if (!Array.isArray(prevMatches) || prevMatches.length === 0 || !Array.isArray(nextMatches)) {
    return { changedMatchIds, newEventIds, triggeredMatches };
  }

  const prevById = new Map(prevMatches.map((m) => [m.matchId, m]));
  for (const next of nextMatches) {
    const prev = prevById.get(next.matchId);
    if (!prev) continue;

    const prevScoreKey = prev.score ? `${prev.score.home}:${prev.score.away}` : 'none';
    const nextScoreKey = next.score ? `${next.score.home}:${next.score.away}` : 'none';
    const scoreChanged = prevScoreKey !== nextScoreKey;

    const prevEventSet = new Set((prev.events || []).map((e) => String(e.id)));
    const freshEvents = [];
    for (const ev of next.events || []) {
      if (!prevEventSet.has(String(ev.id))) {
        newEventIds.add(String(ev.id));
        freshEvents.push(ev);
      }
    }

    const halfTimeReached = !prev.halfTimeScore && Boolean(next.halfTimeScore);
    const matchJustFinished = !prev.isFinished && Boolean(next.isFinished);

    if (freshEvents.length > 0 || scoreChanged || halfTimeReached || matchJustFinished) {
      changedMatchIds.add(next.matchId);
      const reason =
        freshEvents.length > 0
          ? 'goal'
          : matchJustFinished
            ? 'finished'
            : halfTimeReached
              ? 'halftime'
              : 'score';
      triggeredMatches.push({
        match: next,
        reason,
        latestEvent: freshEvents[freshEvents.length - 1] || null,
      });
    }
  }

  return { changedMatchIds, newEventIds, triggeredMatches };
};

// Filtert OpenLigaDB-Trigger auf Partien, an denen mindestens eine der
// relevanten Kickbase-Team-IDs (Heim ODER Gast) beteiligt ist.
export const matchTriggeredEventsToTeamIds = (triggeredMatches, relevantTeamIds, kickbaseTeams) => {
  if (!Array.isArray(triggeredMatches) || triggeredMatches.length === 0) return [];
  if (!relevantTeamIds || relevantTeamIds.size === 0) return [];
  if (!Array.isArray(kickbaseTeams) || kickbaseTeams.length === 0) return [];

  return triggeredMatches.filter((item) => {
    const kbHome = matchOpenLigaTeamToKickbase(item.match?.home, kickbaseTeams);
    const kbAway = matchOpenLigaTeamToKickbase(item.match?.away, kickbaseTeams);
    const homeHit = kbHome && relevantTeamIds.has(String(kbHome.id));
    const awayHit = kbAway && relevantTeamIds.has(String(kbAway.id));
    return Boolean(homeHit || awayHit);
  });
};

export const formatTriggerSummary = (triggered) => {
  if (!triggered?.match) return 'Live-Ereignis erkannt';
  const { match, reason, latestEvent } = triggered;
  const fixture = `${match.home.shortName} – ${match.away.shortName}`;
  const scoreText = match.score ? ` (${match.score.home}:${match.score.away})` : '';
  if (reason === 'goal' && latestEvent) {
    const icon = latestEvent.isOwnGoal ? '⚽' : '⚽';
    const tag = latestEvent.isOwnGoal ? 'Eigentor' : latestEvent.isPenalty ? 'Elfmeter' : 'Tor';
    const min = latestEvent.minuteLabel ? ` ${latestEvent.minuteLabel}` : '';
    return `${icon} ${tag}${min} · ${latestEvent.scorer} · ${fixture}${scoreText}`;
  }
  if (reason === 'finished') {
    return `🏁 Abpfiff · ${fixture}${scoreText}`;
  }
  if (reason === 'halftime') {
    return `⏱ Halbzeit · ${fixture}${scoreText}`;
  }
  return `🔄 Spielstand · ${fixture}${scoreText}`;
};

export const formatKickoffLabel = (isoUtc) => {
  if (!isoUtc) return '';
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Heute, ${time}`;

  const weekday = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  return `${weekday}, ${time}`;
};

export const formatKickoffFull = (isoUtc) => {
  if (!isoUtc) return '';
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time} Uhr`;
};

export const formatUpdateTime = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
