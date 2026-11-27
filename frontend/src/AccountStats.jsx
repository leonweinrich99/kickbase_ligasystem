import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from './ui/icons';
import { useLeagueEntry } from './useLeagueEntry';
import { usePokalStatus } from './usePokalStatus';
import { useNextMatchday } from './useNextMatchday';
import { useManagerRatings } from './useManagerRatings';
import ManagerAvatar from './ui/ManagerAvatar';
import ManagerRatingHex from './ui/ManagerRatingHex';
import { TIER_ACCENT } from './ui/FifaManagerCard';
import pokalLogo from './assets/pokal_logo.png';

const STATUS_THEME = {
  advanced: { color: '#22c55e', label: 'Weiter dabei' },
  upcoming: { color: '#8b5cf6', label: 'Bevorstehend' },
  eliminated: { color: '#6b7280', label: 'Ausgeschieden' },
};

// Findet den Liga-Eintrag eines Managers anhand seines Kickbase-Namens
// (Pokal-Paarungen speichern nur Namen, keine IDs - siehe pokal-data.json).
const findManagerByName = (leagueData, name) => {
  if (!leagueData || !name) return null;
  for (const league of leagueData.leagues || []) {
    const found = (league.users || []).find((u) => u.name === name);
    if (found) return { ...found, leagueName: league.name, leagueColor: league.color };
  }
  return null;
};

// 1. Kompakte Manager-Hero-Card: Avatar + Metallic-Prism-Rating-Eyebrow,
//    Liga- & Tier-Badges, 3 Kernzahlen (Platz, Punkte, Letzter ST) und
//    direkte Schnellzugriffe auf Stats & Rating-Karte.
const ManagerHeroCard = ({ kickbaseId, kickbaseName, photoURL, entry, nextMatchday }) => {
  const allRatings = useManagerRatings();
  const rating = kickbaseId && allRatings ? allRatings[kickbaseId] : null;
  const tierAccent = rating ? (TIER_ACCENT[rating.cardTier] || TIER_ACCENT.bronze) : '#f4c542';
  const leagueColor = entry?.leagueColor || '#ff5c3e';

  return (
    <div
      className="card-surface oct-box rounded-2xl p-4 sm:p-5 mb-3.5 relative overflow-hidden"
      style={{
        backgroundImage: 'linear-gradient(145deg, rgba(28,30,38,0.92) 0%, rgba(16,17,22,0.96) 100%)',
      }}
    >
      {/* Obere Identitaets-Zeile */}
      <div className="flex items-center gap-3.5">
        <div className="relative shrink-0">
          <Link to={`/user/${kickbaseId}`} aria-label="Eigenes Manager-Profil öffnen" className="block">
            <ManagerAvatar
              name={kickbaseName}
              photoURL={photoURL}
              size={66}
              ringColor={leagueColor}
              ringWidth={1.5}
            />
          </Link>
          {rating && (
            <Link
              to="/account/manager-rating"
              aria-label={`Manager Rating ${rating.score} öffnen`}
              className="absolute -bottom-0.5 -right-1 z-20 flex items-center justify-center leading-none transition-transform hover:scale-110 active:scale-95"
            >
              <ManagerRatingHex rating={rating} size={34} backdrop />
            </Link>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-1.5 mb-1">
            {entry?.leagueName && (
              <span
                className="oct-pill oct-bd-none inline-flex items-center text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${leagueColor}28`, color: leagueColor }}
              >
                {entry.leagueName}
              </span>
            )}
            {rating && (
              <Link
                to="/account/manager-rating"
                className="oct-pill oct-bd-none inline-flex items-center text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full hover:brightness-110 transition-all"
                style={{ backgroundColor: `${tierAccent}24`, color: tierAccent }}
              >
                {(rating.level || rating.cardTier || 'Rating').toUpperCase()} · {rating.score}
              </Link>
            )}
          </div>

          <Link
            to={`/user/${kickbaseId}`}
            className="block text-lg font-extrabold text-white tracking-tight leading-tight truncate hover:text-[#ff7056] transition-colors"
          >
            {kickbaseName || 'Dein Manager'}
          </Link>

          <div className="text-[11px] text-[#8b92a5] mt-0.5 truncate">
            {nextMatchday
              ? `Nächster Spieltag: ST ${nextMatchday.number} · ${nextMatchday.dateRange}`
              : 'Dein aktueller Saison-Überblick'}
          </div>
        </div>
      </div>

      {/* 3 Kernzahlen kompakt im Hero integriert */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-3.5 border-t border-white/[0.07]">
        <div>
          <div className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#788092]">Platz</div>
          <div className="text-xl sm:text-2xl font-bold text-white tabular-nums mt-0.5 leading-none">
            {entry ? `#${entry.rank}` : '–'}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#788092]">Punkte</div>
          <div className="text-xl sm:text-2xl font-bold text-white tabular-nums mt-0.5 leading-none">
            {entry ? entry.points : '–'}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#788092]">Letzter ST</div>
          <div
            className="text-xl sm:text-2xl font-bold tabular-nums mt-0.5 leading-none"
            style={{ color: entry ? leagueColor : '#ffffff' }}
          >
            {entry ? entry.pointsMatchday : '–'}
          </div>
        </div>
      </div>

      {/* 2 direkte Schnellzugriffe */}
      <div className="grid grid-cols-2 gap-2 mt-3.5">
        <Link
          to={`/user/${kickbaseId}`}
          className="oct-md flex items-center justify-center gap-1 py-2 px-3 rounded-xl bg-[#ff5c3e]/12 hover:bg-[#ff5c3e]/20 border border-[#ff5c3e]/35 text-[11px] font-extrabold uppercase tracking-wider text-[#ff846d] transition-colors active:scale-[0.98]"
          style={{ '--oct-bd': 'rgba(255, 92, 62, 0.35)' }}
        >
          <span>Meine Stats</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </Link>
        <Link
          to="/account/manager-rating"
          className="oct-md flex items-center justify-center gap-1 py-2 px-3 rounded-xl border text-[11px] font-extrabold uppercase tracking-wider transition-all hover:brightness-110 active:scale-[0.98]"
          style={{
            backgroundColor: `${tierAccent}18`,
            borderColor: `${tierAccent}55`,
            '--oct-bd': `${tierAccent}55`,
            color: tierAccent,
          }}
        >
          <span>Rating-Karte</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  );
};

// 2. Kompakte Pokal-Duell-Kachel direkt unter der Hero-Card
const PokalCockpitCard = ({ kickbaseId, kickbaseName, photoURL, myEntry, status, roundInfo }) => {
  const [leagueData, setLeagueData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/data.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setLeagueData(json);
      })
      .catch(() => {
        if (!cancelled) setLeagueData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const opponentEntry = useMemo(
    () => (status?.opponent ? findManagerByName(leagueData, status.opponent) : null),
    [leagueData, status],
  );

  if (!status) {
    return (
      <div className="card-surface oct-box rounded-2xl p-4 mb-5">
        <div className="text-xs text-[#8b92a5] text-center py-2">Lade Pokal-Status…</div>
      </div>
    );
  }

  if (status.status === 'none') {
    return (
      <div className="card-surface oct-box rounded-2xl p-4 mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={pokalLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-extrabold uppercase tracking-wider text-white">Pokal</div>
            <div className="text-[11px] text-[#8b92a5] truncate">Aktuell nicht im Pokal dabei</div>
          </div>
        </div>
        <Link
          to="/pokal"
          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] shrink-0"
        >
          Baum
          <ChevronRight size={12} strokeWidth={3} />
        </Link>
      </div>
    );
  }

  if (status.status === 'champion') {
    return (
      <div
        className="card-surface oct-box rounded-2xl p-4 mb-5 flex items-center justify-between gap-3"
        style={{
          backgroundImage: 'linear-gradient(120deg, rgba(234,179,8,0.16) 0%, rgba(20,20,24,0.96) 60%)',
          '--oct-bd': 'rgba(234, 179, 8, 0.4)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <img src={pokalLogo} alt="Pokal" className="w-10 h-10 object-contain shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-black uppercase tracking-wider text-yellow-400">Pokalsieger!</div>
            <div className="text-xs text-[#8b92a5] mt-0.5">Herzlichen Glückwunsch zum Titel</div>
          </div>
        </div>
        <Link
          to="/pokal"
          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-yellow-400 hover:text-yellow-300 shrink-0"
        >
          Baum
          <ChevronRight size={12} strokeWidth={3} />
        </Link>
      </div>
    );
  }

  const theme = STATUS_THEME[status.status] || STATUS_THEME.upcoming;
  const opponentLabel = status.opponent || (status.status === 'eliminated' ? 'Unbekannt' : 'Noch offen');
  const canOpenH2H = Boolean(kickbaseId && opponentEntry?.id);
  const statusPillText = roundInfo?.matchday
    ? `ST ${roundInfo.matchday} · ${theme.label}`
    : theme.label;

  return (
    <div className="card-surface oct-box rounded-2xl p-4 mb-5">
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <img src={pokalLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-wider text-white truncate">
            Pokal · {status.round}
          </span>
        </div>
        <span
          className="oct-pill oct-bd-none inline-flex items-center text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: `${theme.color}24`, color: theme.color }}
        >
          {statusPillText}
        </span>
      </div>

      {/* Kompakte Duell-Zeile */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <ManagerAvatar name={kickbaseName} photoURL={photoURL} size={42} ringColor={theme.color} ringWidth={1.35} />
          <div className="min-w-0">
            <div className="text-xs font-extrabold text-white truncate">Du</div>
            {myEntry && (
              <div className="text-[10px] font-semibold text-[#8b92a5] truncate">
                {myEntry.leagueName} · #{myEntry.rank}
              </div>
            )}
          </div>
        </div>

        <div className="text-[10px] font-black text-[#4b5563] italic px-1 shrink-0">VS</div>

        <div className="flex items-center justify-end gap-2.5 min-w-0 flex-1 text-right">
          <div className="min-w-0">
            <div className="text-xs font-extrabold text-white truncate">{opponentLabel}</div>
            {opponentEntry ? (
              <div className="text-[10px] font-semibold text-[#8b92a5] truncate">
                {opponentEntry.leagueName} · #{opponentEntry.rank}
              </div>
            ) : (
              <div className="text-[10px] text-[#626978] truncate">Gegner offen</div>
            )}
          </div>
          <ManagerAvatar name={status.opponent} size={42} />
        </div>
      </div>

      {/* Direkte Aktionen */}
      <div className="flex items-center justify-between gap-3 mt-3.5 pt-3 border-t border-white/[0.06]">
        {canOpenH2H ? (
          <Link
            to={`/compare/${kickbaseId}/${opponentEntry.id}`}
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#ff5c3e] hover:text-[#ff7056] transition-colors"
          >
            Head-to-Head
            <ChevronRight size={12} strokeWidth={3} />
          </Link>
        ) : (
          <span className="text-[10px] text-[#626978]">
            {roundInfo?.date ? `Termin: ${roundInfo.date}` : 'K.-o.-Duell'}
          </span>
        )}
        <Link
          to="/pokal"
          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white transition-colors"
        >
          Pokal-Baum
          <ChevronRight size={12} strokeWidth={3} />
        </Link>
      </div>
    </div>
  );
};

export const SeasonSnapshot = ({ kickbaseId, kickbaseName, photoURL }) => {
  const entry = useLeagueEntry(kickbaseId);
  const nextMatchday = useNextMatchday();
  const { status: pokalStatus, roundInfo: pokalRoundInfo } = usePokalStatus(kickbaseName);

  return (
    <div>
      <ManagerHeroCard
        kickbaseId={kickbaseId}
        kickbaseName={kickbaseName}
        photoURL={photoURL}
        entry={entry}
        nextMatchday={nextMatchday}
      />
      <PokalCockpitCard
        kickbaseId={kickbaseId}
        kickbaseName={kickbaseName}
        photoURL={photoURL}
        myEntry={entry}
        status={pokalStatus}
        roundInfo={pokalRoundInfo}
      />
    </div>
  );
};
