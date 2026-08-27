import { useState } from 'react';
import { useManagerImages } from '../useManagerImages';
import ManagerAvatar from './ManagerAvatar';

// Rundes/ovales Foto-Medaillon mit weichem Vignetten-Fade nach aussen -
// Pendant zu Advisor::PlayerImageDetail, aber bewusst rund/oval statt
// rechteckig: dadurch bleibt daneben stehender Text (Name etc.) immer klar
// getrennt vom Foto und gut lesbar - auch in kompakten Kontexten wie den
// Pokal-Kacheln oder nebeneinander im Head-to-Head.
//
// Drop-in-Ersatz fuer ManagerAvatar (gleiche Props: name, photoURL, size,
// ringColor) - faellt automatisch auf den klassischen Buchstaben-Kreis
// zurueck, solange fuer diesen Namen kein Kickbase-Profilbild bekannt ist.
export default function ManagerImageDetail({ name, photoURL, size = 160, ringColor = '#ff5c3e', oval = false, className = '' }) {
  const images = useManagerImages();
  const [failed, setFailed] = useState(false);
  const src = !failed ? ((name && images[name]) || photoURL || null) : null;

  if (!src) {
    return <ManagerAvatar name={name} photoURL={photoURL} size={size} ringColor={ringColor} className={className} />;
  }

  const width = size;
  const height = oval ? Math.round(size * 1.22) : size;

  return (
    <div
      className={`relative shrink-0 rounded-full overflow-hidden ${className}`}
      style={{ width, height }}
    >
      <div className="absolute inset-0 rounded-full blur-2xl opacity-25" style={{ backgroundColor: ringColor }} />
      <img
        src={src}
        alt={name || 'Avatar'}
        className="w-full h-full object-cover object-top relative z-10"
        style={{
          // Vignette statt hartem Kreis-Rand: das Foto blendet schon VOR dem
          // Rand des Kreises weich aus (Fade bleibt sichtbar/"cool"), statt
          // scharf am Kreisrand abgeschnitten zu wirken.
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 38%, rgba(0,0,0,1) 58%, rgba(0,0,0,0) 100%)',
          maskImage: 'radial-gradient(ellipse at 50% 38%, rgba(0,0,0,1) 58%, rgba(0,0,0,0) 100%)',
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
