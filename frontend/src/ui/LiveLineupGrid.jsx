import React, { useState } from 'react';
import { X } from 'lucide-react';
import LivePlayerCircle, { pointColor } from './LivePlayerCircle';

// Gemeinsame Live-Pitch-Darstellung fuer alle Stellen, die eine Startelf mit
// Live-Punkten zeigen (LiveLineupPage.jsx "Live Punkte" UND UserDetail.jsx
// Manager-Profil, Owner-Wunsch 23.11.2026: "zeig die Live-Punkte-Anzeige
// auch im Manager-Profil, aktuell ist die Anzeige dort unterschiedlich" -
// beide Stellen nutzen jetzt exakt dieselbe Komponente + dieselbe Datenquelle
// (frontend/api/live-lineup.js), damit die Zahlen nie wieder auseinanderlaufen
// koennen.
//
// Klick auf einen Spieler oeffnet eine Event-Liste ("Pass +2" usw., Owner-
// Wunsch 23.11.2026: "Punkte mit Aktionen mappen... beim Anklicken des
// Spielers als Liste anzeigen, wie im echten Live-Modus") - moeglich seit
// frontend/api/_kickbaseClient.js::getEventTypeMap die eti-Codes aus den
// playercenter-events via /v4/live/eventtypes in Klartext uebersetzt.

const PlayerEventsModal = ({ player, onClose }) => (
  <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div
      className="card-surface rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-4 border-b border-[#2e2e2e] flex items-center justify-between shrink-0">
        <div>
          <div className="font-bold text-gray-100">{player.lastName || player.name}</div>
          <div className={`text-2xl font-black ${pointColor(player.points)}`}>{player.points ?? '–'} Punkte</div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>
      <div className="overflow-y-auto p-2">
        {player.events?.length ? (
          player.events.map((e, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <div>
                <div className="text-gray-200 font-medium">{e.label}</div>
                <div className="text-[11px] text-[#626978]">{e.minute}'</div>
              </div>
              <span className={`font-black ${e.points >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {e.points >= 0 ? '+' : ''}{e.points}
              </span>
            </div>
          ))
        ) : (
          <div className="p-4 text-center text-sm text-[#626978]">Noch keine punkterelevanten Aktionen.</div>
        )}
      </div>
    </div>
  </div>
);

export const LiveRow = ({ players, onPlayerClick }) => {
  if (!players || players.length === 0) return null;
  const itemCount = players.length;
  const size = itemCount > 4 ? 'w-12 h-12 sm:w-14 sm:h-14' : 'w-14 h-14 sm:w-16 sm:h-16';
  const containerSize = itemCount > 4 ? 'w-[62px] sm:w-[76px]' : 'w-[72px] sm:w-[86px]';
  return (
    <div className="flex justify-center items-start flex-nowrap gap-1 sm:gap-4 w-full px-2 mb-4 last:mb-0 overflow-visible">
      {players.map((p) => (
        <LivePlayerCircle
          key={p.id}
          imagePath={p.imagePath}
          name={p.name}
          displayName={p.lastName || p.name}
          points={p.points}
          size={size}
          containerSize={containerSize}
          onClick={!p.isDummy && onPlayerClick ? () => onPlayerClick(p) : undefined}
        />
      ))}
    </div>
  );
};

// Der dunkle Spielfeld-Rahmen selbst (Hintergrund + Feldlinien-Dekoration +
// die 4 Positionsreihen + Gesamtpunkte-Box unten rechts) - identisch an
// beiden Einsatzorten. Verwaltet den Event-Listen-Klick selbst (kein
// Aufrufer-Callback mehr noetig), damit die Listenansicht ueberall
// automatisch verfuegbar ist.
const LiveLineupPitch = ({ lineup, totalPoints }) => {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const st = lineup?.filter((p) => p.position === 4) || [];
  const mf = lineup?.filter((p) => p.position === 3 || p.position === 0) || [];
  const aw = lineup?.filter((p) => p.position === 2) || [];
  const tw = lineup?.filter((p) => p.position === 1) || [];

  return (
    <div
      className="rounded-2xl overflow-hidden relative min-h-[500px] sm:min-h-[600px] flex flex-col justify-between py-6 sm:py-8 mt-4 shadow-2xl"
      style={{ backgroundImage: 'radial-gradient(circle at center, #1a1a1a 0%, #050505 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none opacity-5 border border-white rounded-lg m-4 sm:m-6">
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-32 sm:h-32 border border-white rounded-full"></div>
      </div>

      <div className="relative z-10 w-full px-2 sm:px-4 flex flex-col">
        <LiveRow players={st} onPlayerClick={setSelectedPlayer} />
        <LiveRow players={mf} onPlayerClick={setSelectedPlayer} />
        <LiveRow players={aw} onPlayerClick={setSelectedPlayer} />
        <LiveRow players={tw} onPlayerClick={setSelectedPlayer} />
      </div>

      {totalPoints != null && (
        <div className="relative z-10 flex justify-end px-6 sm:px-8 mt-4">
          <div className="text-right">
            <div className="text-3xl sm:text-4xl font-black text-white leading-none">{totalPoints.toLocaleString('de-DE')}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] mt-1">Punkte</div>
          </div>
        </div>
      )}

      {selectedPlayer && <PlayerEventsModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    </div>
  );
};

export default LiveLineupPitch;
