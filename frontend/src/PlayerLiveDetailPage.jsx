import React from 'react';
import { useLocation } from 'react-router-dom';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import { pointColor } from './ui/LivePlayerCircle';

// Eigene Seite statt Overlay/Modal fuer die Live-Punkte-Event-Liste eines
// Spielers (Owner-Wunsch 23.11.2026: "als extra Seite machen und nicht als
// Overlay... passe die Seite so an, dass sie wie bei Kickbase aussieht").
// Design an die vom Owner bereitgestellte Vorlage angelehnt (Screenshot
// "Rômulo 181 Punkte", Union Berlin 1:5 RB Leipzig), zuletzt nachgeschaerft
// (Owner-Feedback 24.11.2026): grosses Spielerfoto vor einem nach aussen
// ausfadenden Punkte-Raster, abgedunkelter Fuss des Fotos fuer lesbare
// Schrift, Event-Liste startet knapp nach dem Foto. Statt einer
// zusammengefassten "Korrekturen"-Karte ("nicht alle Minuspunkte
// einbringen, lass diesen Tab einfach weg") steht jetzt eine flache,
// chronologische Liste mit "Halbzeit"/"Spielende"-Teilern - danach kommende
// Eintraege sind die ueblichen Nachspiel-Boni (Minutenbonus, Sieg-Bonus,
// Zu-Null-Bonus etc.).
//
// Erreicht per navigate(path, { state: { player } }) aus ui/LiveLineupGrid.jsx
// (Klick auf einen Spieler) - KEIN eigener Fetch, nutzt die bereits geladenen
// Daten. Direkter Aufruf/Reload ohne state zeigt einen Hinweis statt eines
// Fehlers (gleiches Prinzip wie UserDetail.jsx "Spieler nicht gefunden").
const EventCard = ({ label, points, minute }) => (
  <div className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-[#2a2a2a] bg-[#111111]/60">
    <div className="flex items-center gap-3 min-w-0">
      <span className={`text-base font-black shrink-0 ${points >= 0 ? 'text-emerald-400' : 'text-[#ff5c3e]'}`}>
        {points >= 0 ? '+' : ''}{points}
      </span>
      <span className="text-sm font-medium text-gray-200 truncate">{label}</span>
    </div>
    <span className="text-xs text-[#626978] w-7 text-right shrink-0">{minute}'</span>
  </div>
);

const Divider = ({ label }) => (
  <div className="flex items-center gap-3 py-1">
    <div className="flex-1 h-px bg-[#2a2a2a]" />
    <span className="text-[10px] font-black uppercase tracking-widest text-[#626978]">{label}</span>
    <div className="flex-1 h-px bg-[#2a2a2a]" />
  </div>
);

// Chronologische Event-Liste mit eingeschobenen "Halbzeit"/"Spielende"-
// Teilern statt einer gebuendelten "Korrekturen"-Zusammenfassung - zeigt
// jeden Punktabzug/-zuschlag einzeln, an der richtigen Stelle im Spielverlauf.
const buildTimeline = (events, matchStatus, matchMinute) => {
  const sorted = [...events].sort((a, b) => a.minute - b.minute);
  const timeline = [];
  let htDone = false;
  let ftDone = false;
  sorted.forEach((e) => {
    if (!htDone && e.minute > 45) {
      timeline.push({ divider: 'Halbzeit' });
      htDone = true;
    }
    if (!ftDone && e.minute > 90) {
      timeline.push({ divider: 'Spielende' });
      ftDone = true;
    }
    timeline.push(e);
  });
  if (!htDone && (matchStatus === 2 || (matchMinute != null && matchMinute > 45))) {
    timeline.push({ divider: 'Halbzeit' });
  }
  if (!ftDone && matchStatus === 2) {
    timeline.push({ divider: 'Spielende' });
  }
  return timeline;
};

const PlayerLiveDetailPage = () => {
  const { state } = useLocation();
  const player = state?.player;
  const goBack = useBackNavigation('/live');

  const timeline = player ? buildTimeline(player.events || [], player.matchStatus, player.matchMinute) : [];

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
          <div className="relative w-full overflow-hidden">
            {/* Punkte-Raster-Hintergrund als eigene Ebene HINTER Foto/Text,
                faedet nach aussen aus (Owner-Feedback: "die Punkte im
                Hintergrund muessen ausfaden") - eigene Maske, damit sie nicht
                auch Foto/Schrift mit ausblendet. */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1.5px, transparent 1.5px)',
                backgroundSize: '16px 16px',
                maskImage: 'radial-gradient(ellipse 85% 75% at center 32%, black 35%, transparent 85%)',
                WebkitMaskImage: 'radial-gradient(ellipse 85% 75% at center 32%, black 35%, transparent 85%)',
              }}
            />

            <div className="relative w-full flex justify-center">
              {player.imagePath ? (
                <div className="relative w-full">
                  <img
                    src={`https://kickbase.b-cdn.net/${player.imagePath}`}
                    alt={player.lastName || player.name}
                    className="w-full h-auto object-contain"
                    style={{
                      maskImage: 'linear-gradient(to bottom, black 88%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, black 88%, transparent 100%)',
                    }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  {/* Abdunkelung am Fuss des Fotos, damit Name/Punkte lesbar
                      bleiben (Owner-Feedback: "die Schrift liegt schon auf
                      dem Profilbild, hebt sich aber nicht genug davon ab"). */}
                  <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/70 to-transparent pointer-events-none" />
                </div>
              ) : (
                <div className="h-64 sm:h-80 flex items-center justify-center">
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden shadow-2xl ring-2 ring-[#2a2a2a] bg-[#171717] flex items-center justify-center">
                    <span className="text-gray-500 font-bold text-2xl uppercase">
                      {(player.lastName || player.name || '?').substring(0, 2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="relative -mt-10 sm:-mt-12 flex flex-col items-center px-4 sm:px-6 pb-2">
              <div className="text-lg font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{player.lastName || player.name}</div>
              <div className={`text-6xl sm:text-7xl font-black leading-none mt-1 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${pointColor(player.points)}`}>
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
            {timeline.length === 0 ? (
              <div className="card-surface rounded-2xl p-5 text-center text-sm text-[#626978]">
                Noch keine punkterelevanten Aktionen.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {timeline.map((item, i) => (
                  item.divider ? (
                    <Divider key={`d-${i}`} label={item.divider} />
                  ) : (
                    <EventCard key={i} label={item.label} points={item.points} minute={item.minute} />
                  )
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
