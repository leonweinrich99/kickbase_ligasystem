import { useId, useState } from 'react';
import { useManagerImages } from '../useManagerImages';
import ligaLogo from '../assets/logo.png';

// Pixelgenaue FIFA/FC-Karten-Optik fuer das Manager Rating, umgesetzt als
// einzelnes SVG mit viewBox="0 0 484 632" - alle Koordinaten entsprechen 1:1
// der vorgegebenen Design-Spezifikation (Schild-Kontur, Namensband, Stats-
// Zeilen etc.), Skalierung passiert automatisch ueber die SVG-viewBox statt
// manueller px/%-Umrechnung.
//
// Slot-Zuordnung (Absprache siehe ManagerRatingPage-Historie):
// - rating        -> Gesamtscore
// - nationalityFlag -> unser Liga-Logo (ersetzt die Laenderflagge, kein
//   zusaetzliches Liga-Kuerzel als Text mehr - nur das Logo)
// - clubLogo      -> entfaellt (kein Vereinswappen-Aequivalent vorhanden)
// - playerImage   -> Manager-Profilbild (Kickbase-Bild > App-Profilbild > Buchstabe)
// - 6 Statistiken -> PRO/OVP/PKT (links), AKT/KAD/TIM (rechts)
// - bottomLogo    -> kleiner Ball statt Fussballschuh

const CARD_W = 484;
const CARD_H = 632;

// Exakte Aussenkontur laut Vorgabe (Schild-/Wappen-Form mit Einbuchtungen
// oben und Spitze unten).
const SHIELD_PATH = `
  M 104 64
  C 151 42, 207 36, 244 37
  C 294 37, 342 43, 378 66
  C 380 78, 380 87, 388 96
  C 397 105, 410 111, 426 113
  L 427 530
  C 427 550, 417 563, 400 570
  C 370 583, 332 588, 300 594
  C 278 598, 259 604, 243 628
  C 226 604, 207 598, 184 594
  C 150 589, 113 583, 84 570
  C 67 562, 57 549, 57 530
  L 57 113
  C 74 112, 88 106, 97 96
  C 104 88, 103 76, 104 64
  Z
`;

// Je Kartenstufe: Flaechen-Verlauf, Rahmenfarbe, Namensband-Verlauf +
// -Rahmen, sowie Text-/Sekundaertextfarbe - an echten FIFA-Karten orientiert.
const TIER_THEME = {
  bronze: {
    cardStops: [
      [0, '#e0935a'], [22, '#c06a35'], [50, '#8a4a22'], [78, '#c06a35'], [100, '#e0935a'],
    ],
    border: '#5c3115',
    bandStops: [[0, '#e3a06b'], [100, '#b4703a']],
    bandBorder: '#6b4420',
    text: '#4a2410',
    subtext: '#6b3a1a',
    divider: '#6b4420',
  },
  silver: {
    cardStops: [
      [0, '#f2f5f8'], [22, '#c7d1da'], [50, '#8f9aa6'], [78, '#c7d1da'], [100, '#f2f5f8'],
    ],
    border: '#5a6472',
    bandStops: [[0, '#f1f4f7'], [100, '#c4cdd6']],
    bandBorder: '#6b7480',
    text: '#2c333b',
    subtext: '#454e57',
    divider: '#6b7480',
  },
  gold: {
    cardStops: [
      [0, '#ffe694'], [22, '#f4c542'], [50, '#b8860b'], [78, '#f4c542'], [100, '#ffe694'],
    ],
    border: '#7a5a06',
    bandStops: [[0, '#e9c94e'], [100, '#d6b638']],
    bandBorder: '#8f711e',
    text: '#382313',
    subtext: '#4a2915',
    divider: '#8f711e',
  },
};

const STAT_ROW_Y = [440, 480, 520];

// Kleine Akzentfarbe je Kartenstufe - fuer UI-Elemente AUSSERHALB der Karte
// selbst (z.B. die Berechnungs-Erklaerkarten darunter), damit die Farbwelt
// konsistent bleibt, ohne das komplette TIER_THEME (Verlaeufe etc.) exportieren
// zu muessen.
const TIER_ACCENT = {
  bronze: '#c9793f',
  silver: '#9aa4ae',
  gold: '#e9c94e',
};

// Winziger, eigener Ball statt Fussballschuh (kein passendes Lucide-Icon
// vorhanden) - dezentes Pentagon-Muster in der Kartentextfarbe.
const BallGlyph = ({ cx, cy, r = 9, color }) => (
  <g stroke={color} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" fill="none">
    <circle cx={cx} cy={cy} r={r} />
    <path
      d={`M ${cx} ${cy - r * 0.55} l ${r * 0.55} ${r * 0.4} l -${r * 0.2} ${r * 0.65} h -${r * 0.7} l -${r * 0.2} -${r * 0.65} Z`}
    />
  </g>
);

export default function FifaManagerCard({ rating, photoURL }) {
  const theme = TIER_THEME[rating.cardTier] || TIER_THEME.bronze;
  const uid = useId().replace(/[:]/g, '');
  const images = useManagerImages();
  const [photoFailed, setPhotoFailed] = useState(false);
  // Prioritaet wie beim normalen ManagerAvatar: echtes Kickbase-Profilbild
  // (ueber alle Kickbase-Accounts eingesammelt) > eigenes App-Profilbild
  // (photoURL, nur fuer den eingeloggten Account selbst verfuegbar) > Buchstabe.
  const photoUrl = !photoFailed ? (images[rating.name] || photoURL || null) : null;

  // Elite-Manager (oberste der 5 zugrundeliegenden Stufen) bekommen einen
  // dezenten goldenen Glow um die Karte, statt eine eigene 4. Kartenfarbe.
  const isElite = rating.level === 'Elite';

  // Sicherheitsnetz fuer sehr lange, leerzeichenlose Kickbase-Namen: das
  // Namensband ist knapp 76% der Kartenbreite breit, bei ~19 Zeichen wird es
  // eng - lieber etwas kleinere Schrift als ein am Kartenrand abgeschnittener
  // Name (SVG-Text bricht nicht automatisch um).
  const nameLength = rating.name?.length || 0;
  const nameFontSize = nameLength > 18 ? 22 : nameLength > 14 ? 29 : 34;

  return (
    <div className="w-full flex justify-center py-2">
      <div
        className="relative"
        style={{
          width: 'min(340px, calc(100vw - 2rem))',
          aspectRatio: `${CARD_W} / ${CARD_H}`,
          filter: isElite ? 'drop-shadow(0 0 14px rgba(244, 197, 66, 0.65))' : undefined,
        }}
      >
        <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} className="w-full h-full block" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
          <defs>
            <linearGradient id={`grad-card-${uid}`} x1="0%" y1="0%" x2="65%" y2="100%">
              {theme.cardStops.map(([offset, color]) => (
                <stop key={offset} offset={`${offset}%`} stopColor={color} />
              ))}
            </linearGradient>
            <linearGradient id={`grad-band-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
              {theme.bandStops.map(([offset, color]) => (
                <stop key={offset} offset={`${offset}%`} stopColor={color} />
              ))}
            </linearGradient>
            <linearGradient id={`grad-glint-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="35%" stopColor="#fff" stopOpacity="0" />
              <stop offset="48%" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="62%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <pattern id={`pattern-dots-${uid}`} width="10" height="10" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="0.6" fill="#fff" opacity="0.6" />
            </pattern>
            <clipPath id={`clip-shield-${uid}`}>
              <path d={SHIELD_PATH} />
            </clipPath>
          </defs>

          <g clipPath={`url(#clip-shield-${uid})`}>
            {/* Grundflaeche */}
            <path d={SHIELD_PATH} fill={`url(#grad-card-${uid})`} />
            {/* Musterschicht + Glanzstreifen */}
            <rect x="0" y="0" width={CARD_W} height={CARD_H} fill={`url(#pattern-dots-${uid})`} opacity="0.15" />
            <rect x="0" y="0" width={CARD_W} height={CARD_H} fill={`url(#grad-glint-${uid})`} />

            {/* Portrait */}
            {photoUrl ? (
              <image
                href={photoUrl}
                x="183" y="109" width="190" height="247"
                preserveAspectRatio="xMidYMin slice"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <>
                <rect x="183" y="109" width="190" height="247" fill="#00000022" />
                <text x="278" y="232" textAnchor="middle" dominantBaseline="central" fontSize="81" fontWeight="600" fill={theme.subtext} opacity="0.5">
                  {rating.name?.charAt(0)?.toUpperCase() || '?'}
                </text>
              </>
            )}

            {/* Namensband */}
            <rect x="58" y="354" width="369" height="65" fill={`url(#grad-band-${uid})`} />
            <line x1="58" y1="354.5" x2="427" y2="354.5" stroke={theme.bandBorder} strokeWidth="1" />
            <line x1="58" y1="418.5" x2="427" y2="418.5" stroke={theme.bandBorder} strokeWidth="1" />
            <text x="242.5" y="388" textAnchor="middle" dominantBaseline="central" fontSize={nameFontSize} fontWeight="700" fill={theme.subtext}>
              {rating.name?.toUpperCase()}
            </text>

            {/* Gesamtscore */}
            <text x="131" y="118" textAnchor="middle" dominantBaseline="central" fontSize="52" fontWeight="600" fill={theme.text}>
              {rating.score}
            </text>

            {/* Liga-Logo (Nation-Slot) - ohne Liga-Kuerzel-Text darunter,
                dafuer etwas groesser und mittig unter dem Score */}
            <image href={ligaLogo} x="99" y="168" width="64" height="64" preserveAspectRatio="xMidYMid meet" />

            {/* Trennlinie ueber den Statistiken */}
            <line x1="101" y1="418" x2="383" y2="418" stroke={theme.text} strokeWidth="2" />

            {/* Statistiken links: PRO / OVP / PKT */}
            {[['PRO', rating.pro], ['OVP', rating.ovp], ['PKT', rating.pkt]].map(([label, value], i) => (
              <text key={label} x="113" y={STAT_ROW_Y[i]} textAnchor="start" dominantBaseline="central" fill={theme.text}>
                <tspan fontSize="31" fontWeight="600">{value}</tspan>
                <tspan dx="9" fontSize="21" fontWeight="500" fill={theme.subtext}>{label}</tspan>
              </text>
            ))}

            {/* Statistiken rechts: AKT / KAD / TIM */}
            {[['AKT', rating.akt], ['KAD', rating.kad], ['TIM', rating.tim]].map(([label, value], i) => (
              <text key={label} x="288" y={STAT_ROW_Y[i]} textAnchor="start" dominantBaseline="central" fill={theme.text}>
                <tspan fontSize="31" fontWeight="600">{value}</tspan>
                <tspan dx="9" fontSize="21" fontWeight="500" fill={theme.subtext}>{label}</tspan>
              </text>
            ))}

            {/* Vertikale Trennlinie zwischen den Stat-Spalten */}
            <line x1="247" y1="425" x2="247" y2="536" stroke={theme.divider} strokeWidth="1" />

            {/* Fusszeile: Ball statt Fussballschuh */}
            <BallGlyph cx="243" cy="577" r="9" color={theme.subtext} />
          </g>

          {/* Aussenkontur zuletzt gezeichnet, damit der Rahmen sauber ueber
              allen Layern (Foto, Band etc.) liegt */}
          <path d={SHIELD_PATH} fill="none" stroke={theme.border} strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

export { TIER_ACCENT };
