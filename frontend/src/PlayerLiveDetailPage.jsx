import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import { pointColor } from './ui/LivePlayerCircle';

// Eigene Seite statt Overlay/Modal fuer die Live-Punkte-Event-Liste eines
// Spielers (Owner-Wunsch 23.11.2026: "als extra Seite machen und nicht als
// Overlay... passe die Seite so an, dass sie wie bei Kickbase aussieht").
// Design 1:1 an die vom Owner bereitgestellte Vorlage angelehnt (Screenshot
// "Rômulo 181 Punkte", Union Berlin 1:5 RB Leipzig, 24.11.2026): grosses,
// nach unten ausblassendes Spielerfoto vor Punkte-Raster-Hintergrund, Name,
// riesige Gesamtpunktzahl, Vereinswappen-Zeile mit Endstand/Live-Minute,
// darunter die Event-Liste als einzelne Karten (Korrekturen zu EINER Karte
// mit Anzahl+Pfeil gebuendelt, aufklappbar - wie im Original).
//
// Erreicht per navigate(path, { state: { player } }) aus ui/LiveLineupGrid.jsx
// (Klick auf einen Spieler) - KEIN eigener Fetch, nutzt die bereits geladenen
// Daten. Direkter Aufruf/Reload ohne state zeigt einen Hinweis statt eines
// Fehlers (gleiches Prinzip wie UserDetail.jsx "Spieler nicht gefunden").
const EventCard = ({ label, points, right }) => (
  <div className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-[#2a2a2a] bg-[#111111]/60">
    <div className="flex items-center gap-3 min-w-0">
      <span className={`text-base font-black shrink-0 ${points >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'}`}>
        {points >= 0 ? '+' : ''}{points}
      </span>
      <span className="text-sm font-medium text-gray-200 truncate">{label}</span>
    </div>
    {right}
  </div>
);

const PlayerLiveDetailPage = () => {
  const { state } = useLocation();
  const player = state?.player;
  const goBack = useBackNavigation('/account/live');
  const [correctionsOpen, setCorrectionsOpen] = useState(false);

  const events = player?.events || [];
  const corrections = events.filter((e) => e.points < 0);
  const bonuses = events.filter((e) => e.points >= 0);
  const correctionsTotal = corrections.reduce((sum, e) => sum + e.points, 0);

  const hasScore = player && (player.goalsFor != null || player.goalsAgainst != null);
  const statusLabel = player?.matchStatus === 2
    ? 'Endstand'
    : player?.matchMinute != null
      ? `Live ${player.matchMinute}'`
      : '';

  return (
    <div className="w-full bg-[#000000] min-h-screen relative flex flex-col pb-10">
      <div className="sticky top-0 z-40 bg-[#000000]/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center border-b border-[#2e2e2e]/50">
        <BackButton onClick={goBack} />
      </div>

      {!player ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
          <div className="text-gray-400 text-lg font-bold">Keine Spielerdaten vorhanden</div>
          <button
            onClick={goBack}
            className="bg-[#171717] border border-[#2e2e2e] px-6 py-3 rounded-xl text-gray-300 hover:text-white hover:border-[#ff5c3e] transition-all"
          >
            Zurück
          </button>
        </div>
      ) : (
        <>
          {/* Punkte-Raster-Hintergrund hinter Foto + Kopfbereich, wie in der
              Vorlage - zieht sich bis knapp unter die Wappen-Zeile. */}
          <div
            className="relative w-full"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1.5px, transparent 1.5px)',
              backgroundSize: '16px 16px',
            }}
          >
            <div className="relative h-64 sm:h-80 w-full overflow-hidden">
              {player.imagePath ? (
                <img
                  src={`https://kickbase.b-cdn.net/${player.imagePath}`}
                  alt={player.lastName || player.name}
                  className="w-full h-full object-cover object-top"
                  style={{
                    maskImage: 'linear-gradient(to bottom, black 45%, transparent 92%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, black 45%, transparent 92%)',
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden shadow-2xl ring-2 ring-[#2a2a2a] bg-[#171717] flex items-center justify-center">
                    <span className="text-gray-500 font-bold text-2xl uppercase">
                      {(player.lastName || player.name || '?').substring(0, 2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="relative -mt-16 sm:-mt-20 flex flex-col items-center px-4 sm:px-6 pb-6">
              <div className="text-lg font-bold text-gray-100">{player.lastName || player.name}</div>
              <div className={`text-6xl sm:text-7xl font-black leading-none mt-1 ${pointColor(player.points)}`}>
                {player.points ?? '–'}
              </div>

              {hasScore && (
                <div className="flex flex-col items-center gap-1 mt-3">
                  <div className="flex items-center gap-3">
                    {player.teamLogo && (
                      <img src={player.teamLogo} alt="" className="w-7 h-7 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                    )}
                    <span className="text-base font-bold text-gray-200">
                      {player.goalsFor ?? '–'}:{player.goalsAgainst ?? '–'}
                    </span>
                    {player.opponentLogo && (
                      <img src={player.opponentLogo} alt="" className="w-7 h-7 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                    )}
                  </div>
                  {statusLabel && (
                    <div className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5]">{statusLabel}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="max-w-[500px] w-full mx-auto px-4 sm:px-6">
            {events.length === 0 ? (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#626978]">
                Noch keine punkterelevanten Aktionen.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {corrections.length > 0 && (
                  <div className="rounded-2xl border border-[#2a2a2a] bg-[#111111]/60 overflow-hidden">
                    <button
                      onClick={() => setCorrectionsOpen((v) => !v)}
                      className="w-full flex items-center justify-between px-4 py-3.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-base font-black shrink-0 text-[#ff5c3e]">{correctionsTotal}</span>
                        <span className="text-sm font-medium text-gray-200">
                          Korrekturen <span className="text-[#626978]">({corrections.length})</span>
                        </span>
                      </div>
                      <ChevronRight
                        size={18}
                        className={`text-[#626978] shrink-0 transition-transform ${correctionsOpen ? 'rotate-90' : ''}`}
                      />
                    </button>
                    {correctionsOpen && (
                      <div className="border-t border-[#2a2a2a] divide-y divide-[#2a2a2a]">
                        {corrections.map((e, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-3">
                            <span className="text-sm font-medium text-gray-300">{e.label}</span>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm font-black text-[#ff5c3e]">{e.points}</span>
                              <span className="text-xs text-[#626978] w-7 text-right">{e.minute}'</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {bonuses.map((e, i) => (
                  <EventCard
                    key={i}
                    label={e.label}
                    points={e.points}
                    right={<span className="text-xs text-[#626978] w-7 text-right shrink-0">{e.minute}'</span>}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PlayerLiveDetailPage;
