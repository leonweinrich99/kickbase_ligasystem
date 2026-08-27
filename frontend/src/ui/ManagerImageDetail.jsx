import { useState } from 'react';
import { useManagerImages } from '../useManagerImages';
import ManagerAvatar from './ManagerAvatar';

// Manager-Pendant zu Advisor::PlayerImageDetail (siehe Advisor.jsx) - ein
// grosses, unten ausgeblendetes Hero-Foto hinter dem Seiten-Header statt
// eines reinen Kreis-Avatars. "side" steuert, auf welcher Seite das Foto
// sichtbar bleibt und wohin es ausblendet (fuer Head-to-Head, wo zwei Fotos
// sich in der Mitte treffen sollen).
//
// Faellt automatisch auf den klassischen, leicht vergroesserten/verblassten
// Kreis-Avatar zurueck, solange kein Kickbase-Profilbild fuer diesen
// Manager-Namen bekannt ist (z.B. bevor das Bildfeld final verifiziert wurde,
// siehe backend/scripts/fetch-manager-images.js) - sieht dann nicht "kaputt"
// aus, nur schlichter.
export default function ManagerImageDetail({ name, photoURL, accentColor = '#ff5c3e', side = 'left', className = 'w-[280px] sm:w-[360px] h-[220px] sm:h-[260px]' }) {
  const images = useManagerImages();
  const [failed, setFailed] = useState(false);
  const src = !failed ? ((name && images[name]) || photoURL || null) : null;

  if (src) {
    // Fade-Richtung spiegelt sich fuer die rechte Seite (Head-to-Head),
    // damit beide Fotos zur Bildschirmmitte hin ausblenden statt beide nach
    // links.
    const sideFade = side === 'right'
      ? 'linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 85%)'
      : 'linear-gradient(270deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 85%)';

    return (
      <div
        className={`pointer-events-none relative ${className}`}
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)',
        }}
      >
        <div
          className="absolute inset-0 rounded-full blur-3xl opacity-20 z-0"
          style={{ backgroundColor: accentColor }}
        />
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover object-top pointer-events-none relative z-10"
          style={{
            WebkitMaskImage: sideFade,
            maskImage: sideFade,
          }}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`opacity-10 pointer-events-none blur-md scale-150 transform origin-top-${side === 'right' ? 'left' : 'right'} mt-4 ${side === 'right' ? 'ml-4' : 'mr-4'}`}>
      <ManagerAvatar name={name} photoURL={photoURL} size={100} />
    </div>
  );
}
