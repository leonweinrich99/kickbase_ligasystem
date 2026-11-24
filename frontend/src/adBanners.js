import krokodilLogo from './assets/ads/krokodil.webp';
import heimatLogo from './assets/ads/heimat.png';
import freeformLogo from './assets/ads/freeform.png';
import crunchyLogo from './assets/ads/crunchy.png';

// Fake-Werbebanner-Easter-Eggs (Owner-Wunsch 24.11.2026: "Werbe-Banner fuer
// unsere Lieblingskneipen, ein Freundes-Unternehmen und Schlachpedia an
// geeigneten Stellen einblenden"). Reine Insider-Spass-Funktion fuer den
// privaten Liga-Freundeskreis - keine echte Werbeschaltung, kein Tracking,
// kein Geld involviert. Logos/Taglines/Adressen wurden von den jeweiligen
// echten Webseiten recherchiert (siehe Kommentare je Eintrag), damit es wie
// eine "echte" Anzeige wirkt. <AdBanner /> (ui/AdBanner.jsx) waehlt bei jedem
// Mount zufaellig einen Eintrag aus diesem Pool.
export const AD_BANNERS = [
  {
    id: 'krokodil',
    name: 'Krokodil Pub & Bar',
    tagline: 'Fuldas Kultkneipe seit 1986 · Irish Pub mit Bar-Charakter',
    meta: 'Karlstraße 31 · Fulda',
    logo: krokodilLogo,
    logoBg: '#0c1f14',
    cardBg: 'linear-gradient(135deg, #10251a 0%, #0a0a0a 100%)',
    accent: '#4ade80',
    url: 'https://krokodil-fulda.de/',
  },
  {
    id: 'heimat',
    name: 'heimat.',
    tagline: 'Willkommen daheim.',
    meta: 'Buttermarkt 2–6 · Fulda',
    logo: heimatLogo,
    logoBg: '#141414',
    cardBg: 'linear-gradient(135deg, #2a2208 0%, #0a0a0a 100%)',
    accent: '#d4a017',
    url: 'https://www.heimat-fulda.de/',
  },
  {
    id: 'gasthaus-zum-eck',
    name: 'Gasthaus Zum Eck',
    tagline: 'Die Kneipe ums Eck',
    meta: 'Mühlenstraße 1 · Fulda',
    emoji: '🍺',
    logoBg: '#2a1a08',
    cardBg: 'linear-gradient(135deg, #2a1a08 0%, #0a0a0a 100%)',
    accent: '#d2a24c',
    url: null,
  },
  {
    id: 'freeform-media',
    name: 'FreeForm Media',
    tagline: 'Websites, die gefunden werden. Gestaltet & gebaut in Fulda.',
    meta: 'freeform-media.de',
    logo: freeformLogo,
    logoBg: '#141414',
    cardBg: 'linear-gradient(135deg, #2a1240 0%, #0a0a0a 100%)',
    accent: '#c084fc',
    url: 'https://freeform-media.de/',
  },
  {
    id: 'wg-ls10',
    name: 'WG LS10',
    tagline: 'Hier steigen die besten WG-Partys der Stadt',
    meta: 'Einlass nur mit Vitamin B',
    emoji: '🎉',
    logoBg: '#2a0f2a',
    cardBg: 'linear-gradient(135deg, #2a0f2a 0%, #0a0a0a 100%)',
    accent: '#f472b6',
    url: null,
  },
  {
    id: 'schlachpedia',
    name: 'Schlachpedia',
    tagline: "Das Wiki für alles, was bei uns 'schlach' ist",
    meta: 'schlachpedia.vercel.app',
    emoji: '📖',
    logoBg: '#0f1a2a',
    cardBg: 'linear-gradient(135deg, #0f1a2a 0%, #0a0a0a 100%)',
    accent: '#60a5fa',
    url: 'https://schlachpedia.vercel.app',
  },
  {
    id: 'crunchy-kebab',
    name: 'Crunchy Kebab',
    tagline: 'Döner mal anders',
    meta: 'Robert-Kircher-Straße 6 · Fulda',
    logo: crunchyLogo,
    logoBg: '#000000',
    cardBg: 'linear-gradient(135deg, #1a1605 0%, #0a0a0a 100%)',
    accent: '#facc15',
    url: 'https://www.crunchy-kebab.com/',
  },
  {
    id: 'istanbul-pizza',
    name: 'Istanbul Pizza',
    tagline: 'Pizza, Döner & mehr',
    meta: 'Am Jagdstein 18 · Fulda',
    emoji: '🍕',
    logoBg: '#2a0a0a',
    cardBg: 'linear-gradient(135deg, #2a0a0a 0%, #0a0a0a 100%)',
    accent: '#f87171',
    url: 'https://www.lieferando.de/speisekarte/istanbul-pizza-fulda',
  },
];
