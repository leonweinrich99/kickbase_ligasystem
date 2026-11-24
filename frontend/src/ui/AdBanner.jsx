import React, { useEffect, useState } from 'react';
import { AD_BANNERS } from '../adBanners';

// Fake-Werbebanner-Easter-Egg (Owner-Wunsch 24.11.2026) - sieht aus wie eine
// native Anzeige (kleines "ANZEIGE"-Label, Logo/Tagline), ist aber ein reiner
// Insider-Gag fuer den Liga-Freundeskreis. Waehlt bei jedem Mount zufaellig
// EINEN Eintrag aus adBanners.js, damit an derselben Stelle nicht immer
// dieselbe Werbung haengt. Faellt die Stelle (z.B. durch Re-Render der
// Elternkomponente) neu aus, ist das gewollt - macht den Running Gag
// ueberraschender.
//
// Math.random() darf laut React-Regeln nicht waehrend des Renderns laufen
// (impure) - die Auswahl passiert deshalb in einem Effect NACH dem ersten
// Render, nicht in useMemo/useState-Initializer.
const AdBanner = ({ className = '' }) => {
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    // Einmalige zufaellige Auswahl nach dem ersten Render - kann nicht
    // synchron in Render/useMemo passieren (impure), muss aber auch nicht an
    // einen externen Systemzustand synchronisiert werden, daher hier als
    // bewusste Ausnahme (gleiches Muster wie in UserDetail.jsx/Advisor.jsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBanner(AD_BANNERS[Math.floor(Math.random() * AD_BANNERS.length)]);
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
