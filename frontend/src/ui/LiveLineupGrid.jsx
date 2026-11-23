import React from 'react';
import { useNavigate } from 'react-router-dom';
import LivePlayerCircle from './LivePlayerCircle';
import AnimatedPoints from './AnimatedPoints';

// Gemeinsame Live-Pitch-Darstellung fuer alle Stellen, die eine Startelf mit
// Live-Punkten zeigen (LiveLineupPage.jsx "Live Punkte" UND UserDetail.jsx
// Manager-Profil, Owner-Wunsch 23.11.2026: "zeig die Live-Punkte-Anzeige
// auch im Manager-Profil, aktuell ist die Anzeige dort unterschiedlich" -
// beide Stellen nutzen jetzt exakt dieselbe Komponente + dieselbe Datenquelle
// (frontend/api/live-lineup.js), damit die Zahlen nie wieder auseinanderlaufen
// koennen.
//
// Klick auf einen Spieler navigiert zu einer EIGENEN Seite (PlayerLiveDetailPage,
// Owner-Wunsch 23.11.2026: "als extra Seite machen und nicht als Overlay")
// mit der Event-Liste ("Pass +2" usw.) - moeglich seit
// frontend/api/_kickbaseClient.js::getEventTypeMap die eti-Codes aus den
// playercenter-events via /v4/live/eventtypes in Klartext uebersetzt. Die
// Spielerdaten werden per Router-State mitgegeben (kein Extra-Fetch noetig).

export const LiveRow = ({ players, onPlayerClick, prevPointsMap, animId }) => {
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
          prevPoints={!p.isDummy ? prevPointsMap?.[String(p.id)] : undefined}
          animKey={!p.isDummy && animId != null ? `${animId}:p:${p.id}` : null}
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
// beiden Einsatzorten. Navigiert bei Spieler-Klick selbst zur Detailseite
// (kein Aufrufer-Callback mehr noetig), damit das ueberall automatisch
// funktioniert.
const LiveLineupPitch = ({ lineup, totalPoints, prevPointsMap, animId }) => {
  const navigate = useNavigate();
  const openPlayer = (player) => navigate('/live-player', { state: { player } });

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
        <LiveRow players={st} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} />
        <LiveRow players={mf} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} />
        <LiveRow players={aw} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} />
        <LiveRow players={tw} onPlayerClick={openPlayer} prevPointsMap={prevPointsMap} animId={animId} />
      </div>

      {totalPoints != null && (
        <div className="relative z-10 flex justify-end px-6 sm:px-8 mt-4">
          <div className="text-right">
            <AnimatedPoints
              value={totalPoints}
              previousValue={prevPointsMap?.__total__}
              animKey={animId != null ? `${animId}:__total__` : null}
              format={(n) => n.toLocaleString('de-DE')}
              className="text-3xl sm:text-4xl font-black text-white leading-none"
              deltaPlacement="left"
            />
            <div className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] mt-1">Punkte</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveLineupPitch;
