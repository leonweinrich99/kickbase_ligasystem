import React, { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ArrowLeft, MapPin, Users, Radio } from 'lucide-react';
import {
  matchOpenLigaTeamToKickbase,
  formatKickoffLabel,
  formatKickoffFull,
  fetchBundesligaTable,
} from '../openLigaDb';

const TeamCrest = ({ logo, fallbackLogo, name, sizeClass = 'w-7 h-7' }) => {
  const [srcIndex, setSrcIndex] = useState(0);
  const candidates = [logo, fallbackLogo].filter(Boolean);
  const src = candidates[srcIndex] || null;

  if (!src) {
    return (
      <div className={`${sizeClass} rounded-full bg-[#202020] flex items-center justify-center text-[10px] font-bold text-[#8b92a5] shrink-0`}>
        {(name || '?').substring(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={`${sizeClass} object-contain shrink-0`}
      onError={() => setSrcIndex((i) => i + 1)}
    />
  );
};

const MatchEventTimeline = ({ match, newEventIds }) => {
  const timelineItems = useMemo(() => {
    const events = match?.events || [];
    const items = [];
    let htInserted = false;
    for (const ev of events) {
      if (!htInserted && match?.halfTimeScore && typeof ev.minute === 'number' && ev.minute > 45) {
        items.push({ kind: 'halftime', score: match.halfTimeScore });
        htInserted = true;
      }
      items.push({ kind: 'event', event: ev });
    }
    if (!htInserted && match?.halfTimeScore && (match?.isFinished || match?.liveClock === 'HZ' || events.length > 0)) {
      items.push({ kind: 'halftime', score: match.halfTimeScore });
    }
    return items;
  }, [match]);

  if (!match?.events?.length) {
    return (
      <div className="py-3 text-center text-xs text-[#8b92a5]">
        {match.status === 'upcoming'
          ? `Anpfiff: ${formatKickoffFull(match.kickoffUtc)}`
          : match.isLive
            ? 'Noch keine Tore gefallen — Live-Ticker aktiv.'
            : 'Keine Tore in dieser Partie.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 py-2">
      {timelineItems.map((item, idx) => {
        if (item.kind === 'halftime') {
          return (
            <div key={`ht-${idx}`} className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#626978] tabular-nums">
                Halbzeit · {item.score.home}:{item.score.away}
              </span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
          );
        }

        const ev = item.event;
        const isHome = ev.side === 'home';
        const isFresh = newEventIds?.has(String(ev.id));

        return (
          <div
            key={ev.id}
            className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 py-1.5 rounded-xl transition-colors ${
              isFresh
                ? 'bg-emerald-500/15 border border-emerald-400/40'
                : 'bg-black/30 border border-white/[0.04]'
            }`}
          >
            {/* Heim-Seite */}
            <div className="flex items-center justify-end gap-1.5 min-w-0 text-right">
              {isHome && (
                <>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-100 truncate">
                      {ev.scorer}
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      {ev.isPenalty && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-400/30">
                          11m
                        </span>
                      )}
                      {ev.isOwnGoal && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-red-500/15 text-red-300 border border-red-400/30">
                          ET
                        </span>
                      )}
                      <span className="text-[10px] font-semibold text-[#8b92a5] tabular-nums">
                        {ev.scoreHome}:{ev.scoreAway}
                      </span>
                    </div>
                    {ev.comment && (
                      <div className="text-[10px] text-[#626978] truncate">{ev.comment}</div>
                    )}
                  </div>
                  <span className="text-xs shrink-0" aria-hidden="true">⚽</span>
                </>
              )}
            </div>

            {/* Spielminute in der Mitte */}
            <div className="px-1.5 py-0.5 rounded-md bg-[#171717] border border-white/10 text-[10px] font-black text-gray-200 tabular-nums text-center min-w-[36px]">
              {ev.minuteLabel || '—'}
            </div>

            {/* Gast-Seite */}
            <div className="flex items-center justify-start gap-1.5 min-w-0 text-left">
              {!isHome && (
                <>
                  <span className="text-xs shrink-0" aria-hidden="true">⚽</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-100 truncate">
                      {ev.scorer}
                    </div>
                    <div className="flex items-center justify-start gap-1 mt-0.5">
                      <span className="text-[10px] font-semibold text-[#8b92a5] tabular-nums">
                        {ev.scoreHome}:{ev.scoreAway}
                      </span>
                      {ev.isPenalty && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-400/30">
                          11m
                        </span>
                      )}
                      {ev.isOwnGoal && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-red-500/15 text-red-300 border border-red-400/30">
                          ET
                        </span>
                      )}
                    </div>
                    {ev.comment && (
                      <div className="text-[10px] text-[#626978] truncate">{ev.comment}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const MatchStatusBadge = ({ match }) => {
  if (match.isLive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ef4444]/15 border border-[#ef4444]/40 text-[10px] font-black uppercase tracking-wider text-[#ef4444] tabular-nums">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#ef4444]" />
        </span>
        LIVE {match.liveClock || ''}
      </span>
    );
  }
  if (match.isFinished) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8b92a5] tabular-nums">
        <span>Endstand</span>
        {match.halfTimeScore && (
          <span className="text-[#626978] font-semibold">
            (HZ {match.halfTimeScore.home}:{match.halfTimeScore.away})
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold text-[#8b92a5] tabular-nums">
      {formatKickoffLabel(match.kickoffUtc)}
    </span>
  );
};

const MatchCard = ({
  match,
  kbHome,
  kbAway,
  isExpanded,
  onToggleExpand,
  onSelectKickbaseTeam,
  isUpdated,
  newEventIds,
}) => {
  const homeLogo = kbHome?.logo || match.home.logo;
  const awayLogo = kbAway?.logo || match.away.logo;
  const goalCount = match.events?.length || 0;

  return (
    <div
      className={`card-surface rounded-2xl overflow-hidden transition-all ${
        isUpdated
          ? 'border-emerald-400/60 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
          : match.isLive
            ? 'border-[#ef4444]/40'
            : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full text-left px-3.5 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <MatchStatusBadge match={match} />
          <div className="flex items-center gap-2 shrink-0">
            {isUpdated && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[9px] font-black uppercase tracking-wider text-emerald-300 animate-pulse">
                Update
              </span>
            )}
            {goalCount > 0 && (
              <span className="text-[10px] font-semibold text-[#8b92a5] tabular-nums">
                ⚽ {goalCount}
              </span>
            )}
            <ChevronDown
              size={14}
              className={`text-[#626978] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
          {/* Heimteam */}
          <div className="flex items-center justify-end gap-2 min-w-0">
            <span className="text-xs sm:text-sm font-semibold text-gray-100 truncate text-right">
              {match.home.shortName}
            </span>
            <TeamCrest
              logo={homeLogo}
              fallbackLogo={match.home.logo}
              name={match.home.shortName}
              sizeClass="w-7 h-7 sm:w-8 sm:h-8"
            />
          </div>

          {/* Ergebnis */}
          <div
            className={`px-3 py-1 rounded-xl text-center min-w-[64px] border tabular-nums ${
              isUpdated
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                : match.isLive
                  ? 'bg-[#ef4444]/15 border-[#ef4444]/40 text-white'
                  : 'bg-black/50 border-white/10 text-white'
            }`}
          >
            {match.score ? (
              <span className="text-base sm:text-lg font-extrabold tracking-tight">
                {match.score.home} : {match.score.away}
              </span>
            ) : (
              <span className="text-xs font-bold text-[#626978]">vs</span>
            )}
          </div>

          {/* Gastteam */}
          <div className="flex items-center justify-start gap-2 min-w-0">
            <TeamCrest
              logo={awayLogo}
              fallbackLogo={match.away.logo}
              name={match.away.shortName}
              sizeClass="w-7 h-7 sm:w-8 sm:h-8"
            />
            <span className="text-xs sm:text-sm font-semibold text-gray-100 truncate text-left">
              {match.away.shortName}
            </span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-white/[0.06]">
          <MatchEventTimeline match={match} newEventIds={newEventIds} />

          {(match.location || match.viewers) && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-[#626978] mt-1 mb-2.5">
              {match.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={10} />
                  {match.location.stadium}
                  {match.location.city ? `, ${match.location.city}` : ''}
                </span>
              )}
              {typeof match.viewers === 'number' && match.viewers > 0 && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Users size={10} />
                  {match.viewers.toLocaleString('de-DE')}
                </span>
              )}
            </div>
          )}

          {(kbHome || kbAway) && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                disabled={!kbHome}
                onClick={() => kbHome && onSelectKickbaseTeam(kbHome.id)}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#171717] border border-white/10 hover:border-[#ff5c3e]/60 hover:bg-[#1e1e1e] text-[11px] font-semibold text-gray-200 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-w-0"
              >
                <TeamCrest
                  logo={homeLogo}
                  fallbackLogo={match.home.logo}
                  name={match.home.shortName}
                  sizeClass="w-4 h-4"
                />
                <span className="truncate">Startelf {match.home.shortName}</span>
              </button>
              <button
                type="button"
                disabled={!kbAway}
                onClick={() => kbAway && onSelectKickbaseTeam(kbAway.id)}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#171717] border border-white/10 hover:border-[#ff5c3e]/60 hover:bg-[#1e1e1e] text-[11px] font-semibold text-gray-200 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-w-0"
              >
                <TeamCrest
                  logo={awayLogo}
                  fallbackLogo={match.away.logo}
                  name={match.away.shortName}
                  sizeClass="w-4 h-4"
                />
                <span className="truncate">Startelf {match.away.shortName}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Kompaktes Match-Banner direkt ueber der Kickbase-Startelf eines ausgewaehlten
// Bundesliga-Teams - zeigt das OpenLigaDB-Live-Ergebnis & die Tore/Ereignisse
// sowie einen 1-Tap-Wechsel zum Gegner oder zurueck zu allen Partien.
export const SelectedTeamMatchBanner = ({
  match,
  selectedSide,
  teamsList,
  onSelectTeam,
  onShowAllMatches,
  isUpdated,
  newEventIds,
}) => {
  const [eventsOpen, setEventsOpen] = useState(Boolean(match?.isLive));

  if (!match) return null;

  const kbHome = matchOpenLigaTeamToKickbase(match.home, teamsList);
  const kbAway = matchOpenLigaTeamToKickbase(match.away, teamsList);
  const opponentKb = selectedSide === 'home' ? kbAway : kbHome;
  const opponentShortName = selectedSide === 'home' ? match.away.shortName : match.home.shortName;
  const homeLogo = kbHome?.logo || match.home.logo;
  const awayLogo = kbAway?.logo || match.away.logo;
  const goalCount = match.events?.length || 0;

  return (
    <div
      className={`card-surface rounded-2xl p-3.5 mb-3 transition-all ${
        isUpdated
          ? 'border-emerald-400/60'
          : match.isLive
            ? 'border-[#ef4444]/40'
            : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <button
          type="button"
          onClick={onShowAllMatches}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8b92a5] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft size={13} />
          <span>Alle Partien</span>
        </button>
        <MatchStatusBadge match={match} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button
          type="button"
          disabled={!kbHome || selectedSide === 'home'}
          onClick={() => kbHome && onSelectTeam(kbHome.id)}
          className={`flex items-center justify-end gap-2 min-w-0 rounded-xl px-2 py-1 transition-colors ${
            selectedSide === 'home'
              ? 'bg-[#ff5c3e]/12 border border-[#ff5c3e]/40'
              : kbHome
                ? 'hover:bg-white/5 cursor-pointer'
                : ''
          }`}
        >
          <span className={`text-xs sm:text-sm truncate text-right ${selectedSide === 'home' ? 'text-white font-bold' : 'text-gray-300 font-medium'}`}>
            {match.home.shortName}
          </span>
          <TeamCrest logo={homeLogo} fallbackLogo={match.home.logo} name={match.home.shortName} sizeClass="w-7 h-7" />
        </button>

        <div className="px-2.5 py-1 rounded-xl bg-black/50 border border-white/10 text-center min-w-[58px] tabular-nums">
          {match.score ? (
            <span className="text-base font-extrabold text-white">
              {match.score.home} : {match.score.away}
            </span>
          ) : (
            <span className="text-xs font-bold text-[#626978]">vs</span>
          )}
        </div>

        <button
          type="button"
          disabled={!kbAway || selectedSide === 'away'}
          onClick={() => kbAway && onSelectTeam(kbAway.id)}
          className={`flex items-center justify-start gap-2 min-w-0 rounded-xl px-2 py-1 transition-colors ${
            selectedSide === 'away'
              ? 'bg-[#ff5c3e]/12 border border-[#ff5c3e]/40'
              : kbAway
                ? 'hover:bg-white/5 cursor-pointer'
                : ''
          }`}
        >
          <TeamCrest logo={awayLogo} fallbackLogo={match.away.logo} name={match.away.shortName} sizeClass="w-7 h-7" />
          <span className={`text-xs sm:text-sm truncate text-left ${selectedSide === 'away' ? 'text-white font-bold' : 'text-gray-300 font-medium'}`}>
            {match.away.shortName}
          </span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={() => setEventsOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-300 hover:text-white transition-colors cursor-pointer"
        >
          <span>Spielereignisse{goalCount > 0 ? ` (${goalCount})` : ''}</span>
          <ChevronDown size={13} className={`text-[#626978] transition-transform ${eventsOpen ? 'rotate-180' : ''}`} />
        </button>

        {opponentKb && (
          <button
            type="button"
            onClick={() => onSelectTeam(opponentKb.id)}
            className="text-[11px] font-semibold text-[#ff5c3e] hover:text-[#ff7b63] transition-colors cursor-pointer truncate"
          >
            Zu {opponentShortName} wechseln →
          </button>
        )}
      </div>

      {eventsOpen && (
        <div className="mt-1">
          <MatchEventTimeline match={match} newEventIds={newEventIds} />
        </div>
      )}
    </div>
  );
};

const getTableZoneColor = (rank) => {
  if (rank <= 4) return '#3b82f6'; // Champions League
  if (rank === 5) return '#f97316'; // Europa League
  if (rank === 6) return '#22c55e'; // Conference League
  if (rank === 16) return '#eab308'; // Relegation
  if (rank >= 17) return '#ef4444'; // Abstieg
  return null;
};

const BundesligaTableView = ({ season, teamsList, onSelectKickbaseTeam }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchBundesligaTable({ season })
      .then((res) => {
        if (!cancelled) {
          setRows(res?.table || []);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Bundesliga-Tabelle konnte nicht geladen werden');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [season]);

  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="h-11 rounded-xl card-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-surface rounded-2xl p-4 text-center text-xs text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="card-surface rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[26px_1fr_28px_36px_38px] sm:grid-cols-[30px_1fr_32px_72px_42px_42px] items-center gap-1.5 px-3 py-2 border-b border-white/10 text-[9px] font-black uppercase tracking-widest text-[#626978]">
          <span className="text-center">#</span>
          <span>Verein</span>
          <span className="text-center">Sp</span>
          <span className="hidden sm:block text-center">S-U-N</span>
          <span className="text-right">Diff</span>
          <span className="text-right">Pkt</span>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {rows.map((row) => {
            const zoneColor = getTableZoneColor(row.rank);
            const kbTeam = matchOpenLigaTeamToKickbase(row, teamsList);
            const logo = kbTeam?.logo || row.logo;
            const clickable = Boolean(kbTeam && onSelectKickbaseTeam);

            return (
              <div
                key={row.openLigaId ?? row.name}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onSelectKickbaseTeam(kbTeam.id) : undefined}
                onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onSelectKickbaseTeam(kbTeam.id) : undefined}
                className={`relative grid grid-cols-[26px_1fr_28px_36px_38px] sm:grid-cols-[30px_1fr_32px_72px_42px_42px] items-center gap-1.5 px-3 py-2.5 text-xs transition-colors ${
                  clickable ? 'hover:bg-white/[0.04] cursor-pointer active:bg-white/[0.06]' : ''
                }`}
              >
                {zoneColor && (
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                    style={{ backgroundColor: zoneColor }}
                  />
                )}
                <span className="text-center text-[11px] font-bold text-[#8b92a5] tabular-nums">
                  {row.rank}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <TeamCrest logo={logo} fallbackLogo={row.logo} name={row.shortName} sizeClass="w-5 h-5" />
                  <span className="font-semibold text-gray-100 truncate">
                    {row.shortName || row.name}
                  </span>
                </div>
                <span className="text-center text-[11px] text-[#8b92a5] tabular-nums">
                  {row.matches}
                </span>
                <span className="hidden sm:block text-center text-[11px] text-[#8b92a5] tabular-nums">
                  {row.won}-{row.draw}-{row.lost}
                </span>
                <span className={`text-right text-[11px] font-semibold tabular-nums ${
                  row.goalDiff > 0 ? 'text-emerald-400' : row.goalDiff < 0 ? 'text-red-400' : 'text-[#8b92a5]'
                }`}>
                  {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                </span>
                <span className="text-right text-xs sm:text-sm font-extrabold text-white tabular-nums">
                  {row.points}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Kompakte Zonen-Legende */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-[#626978] px-1">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6]" />CL</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f97316]" />EL</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#22c55e]" />ECL</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#eab308]" />Rel.</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]" />Abstieg</span>
      </div>
    </div>
  );
};

const BundesligaMatchesSection = ({
  matchesData,
  loading,
  error,
  activeMatchday,
  currentMatchday,
  onChangeMatchday,
  onRetry,
  teamsList,
  onSelectKickbaseTeam,
  changedMatchIds,
  newEventIds,
  autoPollingActive,
}) => {
  const [subTab, setSubTab] = useState('matches'); // 'matches' | 'table'
  const [toggledIds, setToggledIds] = useState({});

  const matches = matchesData?.matches || [];
  const displayedDay = activeMatchday ?? matchesData?.matchday ?? null;
  const isCurrentDay = currentMatchday == null || displayedDay == null || displayedDay === currentMatchday;

  const isMatchExpanded = (match) => {
    if (Object.prototype.hasOwnProperty.call(toggledIds, match.matchId)) {
      return toggledIds[match.matchId];
    }
    return Boolean(match.isLive);
  };

  const toggleMatch = (match) => {
    setToggledIds((prev) => ({
      ...prev,
      [match.matchId]: !isMatchExpanded(match),
    }));
  };

  const canPrev = displayedDay != null && displayedDay > 1;
  const canNext = displayedDay != null && displayedDay < 34;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Umschalter: Partien <-> Bundesliga Tabelle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSubTab('matches')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap text-xs border transition-colors cursor-pointer ${
              subTab === 'matches'
                ? 'bg-[#ef4444]/15 border-[#ef4444] text-white font-semibold'
                : 'border-[#2e2e2e] text-[#8b92a5] font-medium hover:text-white'
            }`}
          >
            Partien
          </button>
          <button
            type="button"
            onClick={() => setSubTab('table')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap text-xs border transition-colors cursor-pointer ${
              subTab === 'table'
                ? 'bg-[#ef4444]/15 border-[#ef4444] text-white font-semibold'
                : 'border-[#2e2e2e] text-[#8b92a5] font-medium hover:text-white'
            }`}
          >
            Tabelle
          </button>
        </div>

        {autoPollingActive && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#ef4444]">
            <Radio size={11} className="animate-pulse" />
            <span>Live</span>
          </span>
        )}
      </div>

      {subTab === 'table' ? (
        <BundesligaTableView
          season={matchesData?.season ?? null}
          teamsList={teamsList}
          onSelectKickbaseTeam={onSelectKickbaseTeam}
        />
      ) : (
        <>
          {/* Spieltag-Steuerung */}
          <div className="card-surface rounded-2xl px-3 py-2 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={!canPrev || loading}
              onClick={() => canPrev && onChangeMatchday(displayedDay - 1)}
              aria-label="Vorheriger Spieltag"
              className="w-8 h-8 rounded-lg bg-[#171717] border border-white/10 flex items-center justify-center text-gray-300 hover:text-white hover:border-white/25 disabled:opacity-30 transition-colors cursor-pointer shrink-0"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex items-center justify-center gap-2 min-w-0">
              <span className="text-xs sm:text-sm font-bold text-white leading-tight whitespace-nowrap">
                {displayedDay ? `${displayedDay}. Spieltag` : 'Bundesliga'}
              </span>
              {!isCurrentDay && currentMatchday != null && (
                <button
                  type="button"
                  onClick={() => onChangeMatchday(currentMatchday)}
                  className="px-2 py-0.5 rounded-md bg-[#ff5c3e]/15 border border-[#ff5c3e]/40 text-[10px] font-bold text-[#ff5c3e] hover:bg-[#ff5c3e]/25 transition-colors cursor-pointer shrink-0"
                >
                  Aktuell
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={!canNext || loading}
              onClick={() => canNext && onChangeMatchday(displayedDay + 1)}
              aria-label="Nächster Spieltag"
              className="w-8 h-8 rounded-lg bg-[#171717] border border-white/10 flex items-center justify-center text-gray-300 hover:text-white hover:border-white/25 disabled:opacity-30 transition-colors cursor-pointer shrink-0"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {error && (
            <div className="card-surface rounded-2xl p-4 text-center">
              <div className="text-xs text-red-400 mb-2">{error}</div>
              <button
                type="button"
                onClick={onRetry}
                className="px-3 py-1.5 rounded-lg bg-[#171717] border border-white/15 text-xs font-semibold text-gray-200 hover:text-white cursor-pointer"
              >
                Erneut versuchen
              </button>
            </div>
          )}

          {loading && matches.length === 0 ? (
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-[78px] rounded-2xl card-surface animate-pulse" />
              ))}
            </div>
          ) : matches.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {matches.map((match) => (
                <MatchCard
                  key={match.matchId}
                  match={match}
                  kbHome={matchOpenLigaTeamToKickbase(match.home, teamsList)}
                  kbAway={matchOpenLigaTeamToKickbase(match.away, teamsList)}
                  isExpanded={isMatchExpanded(match)}
                  onToggleExpand={() => toggleMatch(match)}
                  onSelectKickbaseTeam={onSelectKickbaseTeam}
                  isUpdated={changedMatchIds?.has(match.matchId)}
                  newEventIds={newEventIds}
                />
              ))}
            </div>
          ) : !error ? (
            <div className="card-surface rounded-2xl p-6 text-center text-xs text-[#8b92a5]">
              Keine Bundesliga-Partien für diesen Spieltag gefunden.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default BundesligaMatchesSection;
