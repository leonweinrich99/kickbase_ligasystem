import React, { useEffect, useState } from 'react';
import { AD_BANNERS } from '../adBanners';
import { ArrowUpRight, Search } from './icons';

// Gemischter Deck-Generator im Modul-Scope: garantiert zufaellige Rotation,
// verhindert aber gleichzeitig, dass zwei <AdBanner /> auf derselben Seite
// zufaellig dieselbe Anzeige doppeln.
let shuffledDeck = [];
let lastPickedId = null;

function drawNextBanner() {
  if (shuffledDeck.length === 0) {
    shuffledDeck = [...AD_BANNERS];
    for (let i = shuffledDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]];
    }
    if (shuffledDeck.length > 1 && shuffledDeck[0].id === lastPickedId) {
      [shuffledDeck[0], shuffledDeck[1]] = [shuffledDeck[1], shuffledDeck[0]];
    }
  }
  const picked = shuffledDeck.shift();
  lastPickedId = picked.id;
  return picked;
}

const AdTag = ({ light = false, className = 'top-2 right-2.5' }) => (
  <span
    className={`absolute z-20 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest pointer-events-none ${className} ${
      light
        ? 'bg-black/10 text-black/55'
        : 'bg-black/60 backdrop-blur-sm text-white/65 border border-white/10'
    }`}
  >
    Anzeige
  </span>
);

/* -------------------------------------------------------------------------- */
/* 1. KROKODIL — Symmetrisch zentriertes Pub-Schild + grüner Fußstreifen      */
/* -------------------------------------------------------------------------- */
const KrokodilCard = ({ banner }) => (
  <div className="relative bg-[#06140c] overflow-hidden">
    <AdTag />

    {/* Zentriertes Wirtshaus-Emblem mit freigestelltem Krokodil */}
    <div
      className="relative px-4 pt-2.5 pb-2 text-center"
      style={{
        background:
          'radial-gradient(ellipse at 50% 45%, rgba(34,197,94,0.18), transparent 68%)',
      }}
    >
      <div className="inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.22em] text-[#d4af37]">
        <span>ESTD. 1986</span>
        <span className="opacity-50">·</span>
        <span>KARLSTR. 31</span>
        <span className="opacity-50">·</span>
        <span>FULDA</span>
      </div>

      <div className="mt-1 flex items-center justify-center gap-2.5">
        <img
          src={banner.previewImage}
          alt="Krokodil Pub & Bar"
          loading="lazy"
          className="h-14 w-auto object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.65)] group-hover:scale-105 transition-transform duration-300 shrink-0"
        />
        <div className="text-left">
          <div className="text-[22px] font-black uppercase tracking-[0.08em] text-white leading-none">
            KROKODIL
          </div>
          <div className="text-[10px] font-semibold text-[#d4af37] tracking-wider uppercase mt-0.5">
            Irish Pub &amp; Bar
          </div>
        </div>
      </div>
    </div>

    {/* Grüner Fußstreifen über volle Breite */}
    <div className="bg-emerald-500 text-[#04140a] px-3.5 py-1.5 flex items-center justify-between gap-2 text-[10px]">
      <span className="font-bold truncate">Di–Do Feierabendbier 0,5l · 4 €</span>
      <span className="inline-flex items-center gap-0.5 font-black uppercase tracking-wider shrink-0">
        krokodil-fulda.de
        <ArrowUpRight size={10} />
      </span>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* 2. HEIMAT. — Helle Postkarte mit echter Buttermarkt-Zeichnung rechts       */
/* -------------------------------------------------------------------------- */
const HeimatCard = ({ banner }) => (
  <div className="relative h-[116px] bg-[#ffffff] text-[#171717] flex items-center overflow-hidden">
    <AdTag light />

    {/* Echte Buttermarkt-Skizze von heimat-fulda.de (nur Stadtskizze, kein doppeltes Logo) */}
    <img
      src={banner.previewImage}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className="absolute right-0 top-0 h-[168%] w-[64%] object-cover object-top opacity-90 group-hover:scale-[1.03] transition-transform duration-500"
    />
    <div
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(90deg, #ffffff 0%, #ffffff 42%, rgba(255,255,255,0.82) 58%, rgba(255,255,255,0.08) 100%)',
      }}
    />

    <div className="relative z-10 px-4 py-3 flex flex-col justify-between h-full max-w-[68%]">
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#881337]">
          Buttermarkt 2–6 · Fulda
        </div>
        <div className="text-2xl font-black tracking-tight leading-none mt-0.5 text-[#d4b000]">
          heimat<span className="text-[#9f1239]">.</span>
        </div>
        <div className="text-[11px] font-medium text-neutral-700 mt-1 truncate">
          Kaffee · Küche · Kneipe
        </div>
      </div>

      <div>
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#9f1239] text-white">
          Willkommen daheim
          <ArrowUpRight size={10} />
        </span>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* 3. FREEFORM MEDIA — Komplette Karte als echtes Mini-Browser-Fenster        */
/* -------------------------------------------------------------------------- */
const FreeFormCard = ({ banner }) => (
  <div className="relative bg-white text-[#0f0f14] overflow-hidden">
    {/* Authentische Browser-Titelleiste */}
    <div className="bg-[#eef0f6] border-b border-black/10 px-3 py-1.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1 shrink-0">
        <span className="w-2 h-2 rounded-full bg-[#ff5f57]" />
        <span className="w-2 h-2 rounded-full bg-[#febc2e]" />
        <span className="w-2 h-2 rounded-full bg-[#28c840]" />
      </div>
      <div className="flex-1 max-w-[190px] bg-white border border-black/10 rounded-md px-2 py-0.5 text-[9px] font-semibold text-neutral-600 text-center truncate">
        freeform-media.de
      </div>
      <span className="text-[8px] font-bold uppercase tracking-widest text-black/45 shrink-0">
        Anzeige
      </span>
    </div>

    {/* Studio-Inhalt darunter */}
    <div className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-gradient-to-r from-white via-white to-[#f3f0ff]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <img src={banner.logo} alt="FreeForm Media" className="h-3.5 w-auto object-contain" />
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-purple-700">
            Webdesign · SEO · KI
          </span>
        </div>
        <div className="text-[14px] font-black leading-tight tracking-tight text-[#0d0d12]">
          Websites, die gefunden werden.
        </div>
        <div className="text-[10px] text-neutral-500 mt-0.5 truncate">
          Gestaltet &amp; gebaut in Fulda
        </div>
      </div>

      <div className="relative shrink-0 flex items-center gap-2">
        <div className="w-[82px] sm:w-[116px] h-[56px] rounded-lg overflow-hidden border border-black/15 shadow-sm bg-white">
          <img
            src={banner.previewImage}
            alt="FreeForm Media Website"
            loading="lazy"
            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <span className="w-7 h-7 rounded-full bg-[#0d0d12] text-white flex items-center justify-center shrink-0 group-hover:bg-purple-700 transition-colors">
          <ArrowUpRight size={13} />
        </span>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* 4. SCHLACHPEDIA — Echter Wikipedia-Artikelkasten mit Suchleiste & Infobox  */
/* -------------------------------------------------------------------------- */
const SchlachpediaCard = ({ banner }) => (
  <div className="relative bg-[#f8f9fa] text-[#1f2937] border-l-4 border-l-[#f59e0b] px-3.5 py-3 overflow-hidden">
    <AdTag light />

    {/* Obere Wiki-Zeile mit Logo & Suchleiste */}
    <div className="flex items-center gap-2 pr-14 mb-2">
      <img src={banner.logo} alt="Schlachpedia" className="w-5 h-5 shrink-0" />
      <span className="font-serif text-xs font-bold text-[#111827] tracking-tight shrink-0">
        Schlach<span className="text-[#2563eb]">pedia</span>
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-white border border-gray-300 rounded px-2 py-0.5 text-[10px] text-gray-400">
        <Search size={10} className="shrink-0 text-gray-400" />
        <span className="truncate">Schlachpedia durchsuchen...</span>
      </div>
    </div>

    {/* Artikel-Snippet + orange S-Infobox */}
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-serif text-[15px] font-bold text-[#111827] leading-none">Schlach</span>
          <span className="text-[10px] italic text-gray-500 truncate">[ʃlax] · Das Nachschlachwerk</span>
        </div>
        <p className="text-[11px] text-gray-700 leading-snug mt-1 line-clamp-2">
          Bezeichnet eine gemeinschaftlich beschlossene Feier mit ausgedehntem Spaß — Satzung, Kultur &amp; Chronik.
        </p>
        <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-[#2563eb] group-hover:underline">
          <span>Artikel auf schlachpedia.web.app lesen</span>
          <ArrowUpRight size={10} />
        </div>
      </div>

      <div className="flex flex-col w-[52px] shrink-0 rounded border border-gray-300 bg-white overflow-hidden text-center">
        <div className="bg-[#f59e0b] text-white font-serif text-lg font-bold py-1.5 leading-none">
          S
        </div>
        <div className="py-1 px-1 text-[8px] font-semibold text-gray-600 leading-tight">
          Wiki
        </div>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* 5. CRUNCHY KEBAB — Full-Bleed-Döner-Foto + knallgelbe Streetfood-Leiste    */
/* -------------------------------------------------------------------------- */
const CrunchyCard = ({ banner }) => (
  <div className="relative bg-[#080806] overflow-hidden">
    <AdTag />

    {/* Full-Bleed Panorama-Döner-Foto */}
    <div className="relative h-[104px] w-full overflow-hidden bg-[#0e0c07]">
      <img
        src={banner.previewImage}
        alt="Crunchy Kebab Döner"
        loading="lazy"
        className="w-full h-full object-cover object-[center_95%] group-hover:scale-[1.04] transition-transform duration-500"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.18) 100%)',
        }}
      />

      {/* Logo & Stadt-Badge oben links direkt im Foto */}
      <div className="absolute top-2 left-3 flex items-center gap-2">
        <img src={banner.logo} alt="Crunchy Kebab" className="h-5 w-auto object-contain drop-shadow" />
        <span className="px-1.5 py-0.5 rounded bg-[#facc15] text-black text-[8px] font-black uppercase tracking-wider">
          Fulda
        </span>
      </div>
    </div>

    {/* Knallgelbe Streetfood-Banderole unten über die volle Breite */}
    <div className="bg-[#facc15] text-black px-3.5 py-1.5 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className="text-[11px] font-black uppercase tracking-tight">Döner mal anders!</span>
        <span className="text-[10px] font-bold opacity-80 ml-1.5 hidden xs:inline">· 12 Soßen &amp; Vegan</span>
      </div>
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-black text-[#facc15] text-[9px] font-black uppercase tracking-wider shrink-0">
        Speisekarte
        <ArrowUpRight size={10} />
      </span>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* 6. WG LS10 — Native Instagram-Story-Karte mit Progress-Bars & Sticker      */
/* -------------------------------------------------------------------------- */
const WgLs10Card = () => (
  <div
    className="relative px-3.5 pt-2 pb-3 overflow-hidden"
    style={{
      background:
        'radial-gradient(circle at 85% 20%, rgba(214,41,118,0.32), transparent 55%), radial-gradient(circle at 12% 85%, rgba(250,126,30,0.22), transparent 55%), #140917',
    }}
  >
    {/* Typische Instagram-Story-Fortschrittsbalken ganz oben */}
    <div className="grid grid-cols-3 gap-1 mb-2.5">
      <div className="h-[2.5px] rounded-full bg-white/85" />
      <div className="h-[2.5px] rounded-full bg-white/25 overflow-hidden">
        <div className="h-full w-2/3 bg-white/90 rounded-full" />
      </div>
      <div className="h-[2.5px] rounded-full bg-white/25" />
    </div>

    {/* Story-Header */}
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <div className="p-[2px] rounded-full bg-gradient-to-tr from-[#feda75] via-[#fa7e1e] to-[#d62976] shrink-0">
          <div className="w-8 h-8 rounded-full bg-[#150a18] border border-[#140917] flex items-center justify-center font-black text-[10px] text-white">
            LS10
          </div>
        </div>
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-white truncate">@die_ls10</span>
            <span className="text-[9px] text-white/55 shrink-0">· Anzeige</span>
          </div>
          <div className="text-[9px] text-pink-200/80 truncate">Instagram Story · Fulda</div>
        </div>
      </div>

      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0095f6] text-white text-[10px] font-bold shrink-0">
        Folgen
        <ArrowUpRight size={10} />
      </span>
    </div>

    {/* Schräg gesetzter Instagram-Story-Sticker */}
    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5 rounded-xl bg-white text-[#140917] shadow-md transform -rotate-[0.8deg]">
      <span className="text-[11px] font-black tracking-tight">
        🔥 Die besten WG-Partys der Stadt
      </span>
      <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gradient-to-r from-[#d62976] to-[#fa7e1e] text-white">
        Vitamin B
      </span>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* 7. ISTANBUL PIZZA — Lieferando-App-Karte mit Menü-Chips                    */
/* -------------------------------------------------------------------------- */
const IstanbulPizzaCard = () => (
  <div className="relative bg-[#150e0a] overflow-hidden">
    <AdTag className="top-1 right-2" />

    {/* Charakteristischer Lieferando-Orange-Balken oben */}
    <div className="bg-[#ff8000] text-black px-3.5 py-1 flex items-center gap-2 pr-16">
      <span className="text-[10px] font-black tracking-tight">lieferando.de</span>
      <span className="text-[9px] font-bold opacity-80 truncate">· Fulda Ostend</span>
    </div>

    <div className="px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black text-white leading-tight truncate">
              Istanbul Pizza
            </span>
            <span className="px-1.5 py-0.5 rounded bg-[#ff8000]/20 text-[#ffa040] text-[9px] font-extrabold shrink-0">
              ★ 4,6
            </span>
          </div>
          <div className="text-[10px] text-gray-400 truncate mt-0.5">
            Am Jagdstein 18 · Liefern &amp; Abholen
          </div>
        </div>

        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#ff8000] text-black text-[10px] font-black uppercase tracking-wider shrink-0">
          Menü
          <ArrowUpRight size={11} />
        </span>
      </div>

      {/* Kompakte Lieferando-Kategorie-Chips */}
      <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
        {['🍕 Pizza', '🥙 Döner', '🥖 Pide & Grill'].map((chip) => (
          <span
            key={chip}
            className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[9px] font-semibold text-gray-200 whitespace-nowrap"
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* 8. GASTHAUS ZUM ECK — Warmes Kneipen-Polaroid mit Kerze & Hochstift Pils   */
/* -------------------------------------------------------------------------- */
const ZumEckCard = ({ banner }) => (
  <div
    className="relative px-3.5 py-2.5 flex items-center gap-3.5 overflow-hidden"
    style={{
      background:
        'radial-gradient(circle at 18% 50%, rgba(217,119,6,0.22), transparent 55%), linear-gradient(135deg, #211509 0%, #110b05 100%)',
    }}
  >
    <AdTag />

    {/* Schräges Kneipen-Polaroid links (Kerze in Jameson-Flasche + Hochstift Pils) */}
    <div className="shrink-0 bg-[#f6efe2] p-1 pb-2 rounded-md shadow-xl transform -rotate-2 group-hover:rotate-0 transition-transform duration-300">
      <div className="w-[68px] h-[74px] rounded-[3px] overflow-hidden bg-black">
        <img
          src={banner.previewImage}
          alt="Gasthaus Zum Eck Stammtisch"
          loading="lazy"
          className="w-full h-full object-cover object-center"
        />
      </div>
    </div>

    {/* Warme goldene Wirtshaus-Typo rechts */}
    <div className="min-w-0 flex-1 pr-6">
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#d2a24c]">
        Mühlenstraße 1 · Fulda
      </div>
      <div className="font-serif text-[18px] font-bold text-[#f7ecd5] leading-tight mt-0.5 truncate">
        Gasthaus Zum Eck
      </div>
      <p className="text-[11px] italic text-[#dfcca9]/90 leading-snug mt-0.5 line-clamp-2">
        „Die Kneipe ums Eck — einfach reinkommen.“
      </p>
      <div className="mt-1.5 inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#d2a24c]/90">
        <span className="w-1.5 h-1.5 rounded-full bg-[#d2a24c]" />
        <span>Frisch gezapft · Stammtisch</span>
      </div>
    </div>
  </div>
);

const LIGHT_AD_IDS = new Set(['heimat', 'freeform-media', 'schlachpedia']);

const AdBanner = ({ className = '', bannerId = null }) => {
  const [pickedBanner, setPickedBanner] = useState(() =>
    bannerId ? AD_BANNERS.find((b) => b.id === bannerId) || null : null
  );

  useEffect(() => {
    if (bannerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPickedBanner(AD_BANNERS.find((b) => b.id === bannerId) || AD_BANNERS[0]);
      return;
    }
    setPickedBanner(drawNextBanner());
  }, [bannerId]);

  const banner = pickedBanner;

  if (!banner) {
    return (
      <div
        className={`oct-box rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse h-[118px] ${className}`}
      />
    );
  }

  const Wrapper = banner.url ? 'a' : 'div';
  const wrapperProps = banner.url
    ? { href: banner.url, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  const isLight = LIGHT_AD_IDS.has(banner.id);

  const renderCard = () => {
    switch (banner.id) {
      case 'krokodil':
        return <KrokodilCard banner={banner} />;
      case 'heimat':
        return <HeimatCard banner={banner} />;
      case 'freeform-media':
        return <FreeFormCard banner={banner} />;
      case 'schlachpedia':
        return <SchlachpediaCard banner={banner} />;
      case 'crunchy-kebab':
        return <CrunchyCard banner={banner} />;
      case 'wg-ls10':
        return <WgLs10Card />;
      case 'istanbul-pizza':
        return <IstanbulPizzaCard />;
      case 'gasthaus-zum-eck':
        return <ZumEckCard banner={banner} />;
      default:
        return <KrokodilCard banner={banner} />;
    }
  };

  return (
    <Wrapper
      {...wrapperProps}
      className={`oct-box group relative block rounded-2xl overflow-hidden border transition-all duration-200 ${
        banner.url ? 'active:scale-[0.99] cursor-pointer hover:brightness-[1.03]' : ''
      } ${isLight ? 'border-black/15' : 'border-white/12 hover:border-white/25'} ${className}`}
    >
      {renderCard()}
    </Wrapper>
  );
};

export default AdBanner;
