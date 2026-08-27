import { useState } from 'react';
import { useManagerImages } from '../useManagerImages';
import ManagerAvatar from './ManagerAvatar';

// Rundes Foto-Medaillon mit weichem Vignetten-Fade nach aussen - Pendant zu
// Advisor::PlayerImageDetail, aber rund/oval statt rechteckig.
//
// bleed = 'left' | 'right' | null steuert einen "Sichel"-Look: das Foto ist
// deutlich groesser als sein sichtbarer Bereich und wird an die jeweilige
// Aussenkante seines (positioned + overflow-hidden) Elternelements
// geschoben - der Elternrahmen kappt den Rest, sodass eine grosse, gut
// gefuellte, nach innen fadende Sichel entsteht (wie im Trading Advisor).
// Ohne bleed wird das Medaillon normal/zentriert im Textfluss dargestellt.
//
// WICHTIG: Ist fuer den Namen (noch) kein Kickbase-Bild bekannt, faellt die
// Komponente auf den klassischen Buchstaben-Kreis zurueck - im Bleed-Modus
// bewusst NICHT in der grossen Bleed-Groesse/-Position (haette dort einen
// hart abgeschnittenen, nicht fadenden Rand), sondern klein und mittig an
// der Kante, wie ein normaler Avatar.
export default function ManagerImageDetail({ name, photoURL, size = 160, ringColor = '#ff5c3e', bleed = null, className = '' }) {
  const images = useManagerImages();
  const [failed, setFailed] = useState(false);
  const src = !failed ? ((name && images[name]) || photoURL || null) : null;

  const bleedOffset = bleed === 'right' ? 'right-2 sm:right-2.5' : 'left-2 sm:left-2.5';
  const bleedPull = bleed === 'right' ? '-right-8 sm:-right-9' : '-left-8 sm:-left-9';

  if (!src) {
    const fallbackSize = bleed ? Math.round(size * 0.42) : size;
    const avatar = <ManagerAvatar name={name} photoURL={photoURL} size={fallbackSize} ringColor={ringColor} className={bleed ? '' : className} />;
    if (!bleed) return avatar;
    return (
      <div className={`absolute ${bleedOffset} top-1/2 -translate-y-1/2 z-0 pointer-events-none`}>
        {avatar}
      </div>
    );
  }

  const photo = (
    <div
      className={`relative shrink-0 rounded-full overflow-hidden ${bleed ? '' : className}`}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 rounded-full blur-2xl opacity-25" style={{ backgroundColor: ringColor }} />
      <img
        src={src}
        alt={name || 'Avatar'}
        className="w-full h-full object-cover object-center relative z-10"
        style={{
          // Vignette statt hartem Kreis-Rand: das Foto blendet schon VOR dem
          // Rand des Kreises weich aus (Fade bleibt sichtbar/"cool"), statt
          // scharf am Kreisrand abgeschnitten zu wirken. Zentrum bleibt
          // sichtbar/scharf (dort ist meistens das eigentliche Gesicht),
          // erst nach aussen hin wird kraeftig ausgeblendet.
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,1) 38%, rgba(0,0,0,0) 92%)',
          maskImage: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,1) 38%, rgba(0,0,0,0) 92%)',
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );

  if (!bleed) return photo;

  return (
    <div className={`absolute ${bleedPull} top-1/2 -translate-y-1/2 z-0 pointer-events-none`}>
      {photo}
    </div>
  );
}
