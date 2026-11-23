import React from 'react';
import { useLocation } from 'react-router-dom';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import { pointColor } from './ui/LivePlayerCircle';

// Eigene Seite statt Overlay/Modal fuer die Live-Punkte-Event-Liste eines
// Spielers (Owner-Wunsch 23.11.2026: "als extra Seite machen und nicht als
// Overlay... passe die Seite so an, dass sie wie bei Kickbase aussieht -
// oben ein grosses Bild mit Name, dann die Punkte gesamt und die
// einzelnen"). Design an einen vom Owner bereitgestellten Screenshot UND die
// aus App-Store-Marketing-Material bekannte Spieler-Detail-Ansicht angelehnt:
// grosses Foto mit Punkte-Halo-Hintergrund, Name, riesige Gesamtpunktzahl,
// darunter die Event-Liste (Aktion + Minute + Punkte).
//
// Erreicht per navigate(path, { state: { player } }) aus ui/LiveLineupGrid.jsx
// (Klick auf einen Spieler) - KEIN eigener Fetch, nutzt die bereits geladenen
// Daten. Direkter Aufruf/Reload ohne state zeigt einen Hinweis statt eines
// Fehlers (gleiches Prinzip wie UserDetail.jsx "Spieler nicht gefunden").
const PlayerLiveDetailPage = () => {
  const { state } = useLocation();
  const player = state?.player;
  const goBack = useBackNavigation('/account/live');

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
        <div className="max-w-[500px] w-full mx-auto px-4 sm:px-6 flex flex-col items-center">
          {/* Punkte-Halo: dezentes Punktraster hinter dem Foto, angelehnt an
              die echte Kickbase-Spieler-Detail-Ansicht. */}
          <div
            className="relative w-44 h-44 sm:w-52 sm:h-52 mt-4 mb-4 flex items-center justify-center shrink-0"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1.5px, transparent 1.5px)',
              backgroundSize: '14px 14px',
              maskImage: 'radial-gradient(circle, black 40%, transparent 72%)',
              WebkitMaskImage: 'radial-gradient(circle, black 40%, transparent 72%)',
            }}
          >
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden shadow-2xl ring-2 ring-[#2a2a2a] bg-[#171717] flex items-center justify-center">
              {player.imagePath ? (
                <img
                  src={`https://kickbase.b-cdn.net/${player.imagePath}`}
                  alt={player.lastName || player.name}
                  className="w-full h-full object-cover object-top"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <span className="text-gray-500 font-bold text-2xl uppercase">
                  {(player.lastName || player.name || '?').substring(0, 2)}
                </span>
              )}
            </div>
          </div>

          <div className="text-lg font-bold text-gray-100">{player.lastName || player.name}</div>
          <div className={`text-5xl sm:text-6xl font-black leading-none mt-1 ${pointColor(player.points)}`}>
            {player.points ?? '–'}
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] mt-2 mb-6">Punkte</div>

          <div className="w-full card-surface rounded-2xl overflow-hidden divide-y divide-[#2a2a2a]">
            {player.events?.length ? (
              player.events.map((e, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-gray-200">{e.label}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-base font-black ${e.points >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {e.points >= 0 ? '+' : ''}{e.points}
                    </span>
                    <span className="text-xs text-[#626978] w-7 text-right">{e.minute}'</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-5 text-center text-sm text-[#626978]">Noch keine punkterelevanten Aktionen.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerLiveDetailPage;
