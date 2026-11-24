import React, { useEffect, useState } from 'react';
import { AD_BANNERS } from '../adBanners';

// Gemischter Deck-Generator im Modul-Scope: garantiert zufaellige Rotation,
// verhindert aber gleichzeitig, dass zwei <AdBanner /> auf derselben Seite
// (z.B. zwischen LIGA 1/2 und LIGA 2/3) zufaellig dieselbe Anzeige doppeln.
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

// Fake-Werbebanner-Easter-Egg (Owner-Wunsch 24.11.2026) - sieht aus wie eine
// native Anzeige (kleines "ANZEIGE"-Label, Logo/Tagline), ist aber ein reiner
// Insider-Gag fuer den Liga-Freundeskreis.
const AdBanner = ({ className = '' }) => {
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBanner(drawNextBanner());
  }, []);

  if (!banner) {
    return <div className={`rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse h-[88px] ${className}`} />;
  }

  const Wrapper = banner.url ? 'a' : 'div';
  const wrapperProps = banner.url
    ? { href: banner.url, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`relative block rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-colors active:scale-[0.99] ${className}`}
      style={{ background: banner.cardBg }}
    >
      <span className="absolute top-2.5 right-3 text-[8px] font-bold uppercase tracking-widest text-[#626978]">
        Anzeige
      </span>
      <div className="flex items-center gap-3.5 p-4">
        <div
          className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
          style={{ background: banner.logoBg }}
        >
          {banner.logo ? (
            <img src={banner.logo} alt={banner.name} className="w-full h-full object-contain p-1.5" />
          ) : (
            <span className="text-2xl">{banner.emoji}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate">{banner.name}</div>
          <div className="text-xs text-gray-300/90 leading-snug line-clamp-2">{banner.tagline}</div>
          <div className="text-[10px] font-semibold mt-1" style={{ color: banner.accent }}>
            {banner.meta}
          </div>
        </div>
      </div>
    </Wrapper>
  );
};

export default AdBanner;
