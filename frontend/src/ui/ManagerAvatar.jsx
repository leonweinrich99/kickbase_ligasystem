import { useState } from 'react';
import { useManagerImages } from '../useManagerImages';
import HexFrame from './HexFrame';

// Einheitlicher Manager-Avatar (App-weiter Standard, ersetzt die vielen
// leicht unterschiedlichen Buchstaben-Kreise, die historisch entstanden
// sind - Dashboard, Account, Pokal, UserDetail, CompareView).
//
// Prioritaet: echtes Kickbase-Profilbild (ueber alle Kickbase-Accounts
// eingesammelt, siehe backend/scripts/fetch-manager-images.js, Zuordnung
// ueber den Kickbase-Namen) > eigenes App-Profilbild (photoURL, nur fuer den
// eingeloggten Account selbst verfuegbar) > Buchstaben-Fallback.
export default function ManagerAvatar({ name, photoURL, size = 40, className = '', ringColor, ringWidth = 2 }) {
  const images = useManagerImages();
  const [failed, setFailed] = useState(false);

  const kickbaseImage = name ? images[name] : null;
  const src = !failed ? (kickbaseImage || photoURL || null) : null;

  return (
    <HexFrame
      className={`shrink-0 ${className}`}
      innerClassName="bg-[#1f1f1f]"
      style={{ width: size, height: size }}
      ringColor={ringColor || 'rgba(255, 255, 255, 0.16)'}
      ringWidth={ringColor ? Math.min(ringWidth, 1.75) : 1.15}
    >
      {src ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        // Dezenter als frueher (kein font-black/Akzentfarbe mehr) - der
        // Buchstabe ist bewusst nur noch ein ruhiger Platzhalter.
        <span className="font-semibold text-[#8b92a5]" style={{ fontSize: size / 2.4 }}>
          {name?.charAt(0)?.toUpperCase() || '?'}
        </span>
      )}
    </HexFrame>
  );
}
