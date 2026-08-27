import { useState } from 'react';
import { useManagerImages } from '../useManagerImages';
import ManagerAvatar from './ManagerAvatar';

// Rundes Foto-Medaillon mit weichem Vignetten-Fade nach aussen - Pendant zu
// Advisor::PlayerImageDetail, aber rund/oval statt rechteckig.
//
// WICHTIG: Zeigt IMMER den kompletten, sauber gefadeten Kreis - wird
// absichtlich NIE von einer geraden (Karten-)Kante angeschnitten. Frueher
// gab es einen "bleed"-Modus, der den Kreis ueber den Rand seines Containers
// hinausschob und vom Container-overflow-hidden kappen liess - das erzeugte
// auf der abgeschnittenen Seite zwangslaeufig eine harte, gerade Kante
// ("rechteckiger Rand"), egal wie gut der Fade auf der anderen Seite
// aussah. Fuer einen sauberen Look OHNE sichtbare rechteckige Kanten muss
// der Kreis daher immer vollstaendig sichtbar bleiben - Aufrufer positionieren
// ihn einfach klein/nah am Rand, statt ihn abschneiden zu lassen.
//
// WICHTIG: Ist fuer den Namen (noch) kein Kickbase-Bild bekannt, faellt die
// Komponente auf den klassischen Buchstaben-Kreis zurueck.
export default function ManagerImageDetail({ name, photoURL, size = 160, ringColor = '#ff5c3e', className = '' }) {
  const images = useManagerImages();
  const [failed, setFailed] = useState(false);
  const src = !failed ? ((name && images[name]) || photoURL || null) : null;

  if (!src) {
    return <ManagerAvatar name={name} photoURL={photoURL} size={size} ringColor={ringColor} className={className} />;
  }

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full blur-2xl opacity-25" style={{ backgroundColor: ringColor }} />
      <img
        src={src}
        alt={name || 'Avatar'}
        // "rounded-full" UND die Fade-Maske liegen bewusst auf demselben
        // Element (dem <img> selbst) - Reihenfolge "erst rund zuschneiden,
        // dann faden". Manche Browser (v.a. Safari/WebKit) behandeln ein
        // maskiertes Element als eigene Compositing-Ebene, die von einem
        // overflow-hidden am ELTERN-Element nicht mehr sauber mitgeschnitten
        // wird - deshalb NIE border-radius/overflow-hidden an einem Div und
        // die Maske an einem Kind-Element trennen.
        className="w-full h-full object-cover object-center relative z-10 rounded-full"
        style={{
          // Vignette: Zentrum bleibt sichtbar/scharf (dort ist meistens das
          // eigentliche Gesicht), nach aussen wird kraeftig bis auf 0
          // ausgeblendet. "circle closest-side" sorgt dafuer, dass der
          // 100%-Punkt exakt dem Kreisrand entspricht (nicht der weiter
          // entfernten Boxecke, dem CSS-Standardverhalten "farthest-corner").
          WebkitMaskImage: 'radial-gradient(circle closest-side at 50% 50%, rgba(0,0,0,1) 34%, rgba(0,0,0,0) 100%)',
          maskImage: 'radial-gradient(circle closest-side at 50% 50%, rgba(0,0,0,1) 34%, rgba(0,0,0,0) 100%)',
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
