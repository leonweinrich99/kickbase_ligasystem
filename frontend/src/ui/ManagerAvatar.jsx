import { useState } from 'react';
import { useManagerImages } from '../useManagerImages';

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
    <div
      className={`rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-[#1f1f1f] ${className}`}
      style={{
        width: size,
        height: size,
        border: ringColor ? `${ringWidth}px solid ${ringColor}` : undefined,
      }}
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
    </div>
  );
}
