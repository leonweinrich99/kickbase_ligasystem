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
// "bleedPull" (px) steuert, wie weit es nach aussen geschoben wird - kleiner
// = mehr vom Kreis bleibt sichtbar/mittig, groesser = schmalere Sichel.
// Ohne bleed wird das Medaillon normal/zentriert im Textfluss dargestellt.
//
// WICHTIG: Ist fuer den Namen (noch) kein Kickbase-Bild bekannt, faellt die
// Komponente auf den klassischen Buchstaben-Kreis zurueck - im Bleed-Modus
// bewusst NICHT in der grossen Bleed-Groesse/-Position (haette dort einen
// hart abgeschnittenen, nicht fadenden Rand), sondern klein und mittig an
// der Kante, wie ein normaler Avatar.
export default function ManagerImageDetail({ name, photoURL, size = 160, ringColor = '#ff5c3e', bleed = null, bleedPull = 32, className = '' }) {
  const images = useManagerImages();
  const [failed, setFailed] = useState(false);
  const src = !failed ? ((name && images[name]) || photoURL || null) : null;

  const bleedOffset = bleed === 'right' ? 'right-2 sm:right-2.5' : 'left-2 sm:left-2.5';
  const bleedPullStyle = bleed === 'right' ? { right: -bleedPull } : { left: -bleedPull };

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
          // Vignette statt hartem Kreis-Rand: WICHTIG ist "circle closest-side"
          // (statt der CSS-Standardgroesse "farthest-corner") - nur so
          // entspricht der 100%-Punkt des Gradienten exakt dem sichtbaren
          // Kreisrand. Ohne das wurde der Fade nie wirklich transparent,
          // bevor er vom Kreis-Clip hart abgeschnitten wurde (der eigentliche
          // Bug hinter "Fade sieht komisch/abgeschnitten aus"). Zentrum bleibt
          // sichtbar/scharf (dort ist meistens das eigentliche Gesicht), nach
          // aussen wird kraeftig bis auf 0 ausgeblendet.
          WebkitMaskImage: 'radial-gradient(circle closest-side at 50% 50%, rgba(0,0,0,1) 34%, rgba(0,0,0,0) 100%)',
          maskImage: 'radial-gradient(circle closest-side at 50% 50%, rgba(0,0,0,1) 34%, rgba(0,0,0,0) 100%)',
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );

  if (!bleed) return photo;

  return (
    <div className="absolute top-1/2 -translate-y-1/2 z-0 pointer-events-none" style={bleedPullStyle}>
      {photo}
    </div>
  );
}
