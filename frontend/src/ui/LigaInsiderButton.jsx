import React from 'react';
import { ExternalLink } from './icons';
import { useLigaInsiderUrl } from '../useLigaInsiderLinks';

/**
 * Kompakter Oktagon-Action-Button zum direkten Oeffnen der Spieler-Seite
 * auf LigaInsider.de (mit automatischem Such-Fallback fuer noch nicht
 * gematchte Nachwuchsspieler).
 */
export default function LigaInsiderButton({
  playerId,
  playerName = '',
  compact = false,
  className = '',
  onClick,
}) {
  const { url, isDirect } = useLigaInsiderUrl(playerId, playerName);

  if (!playerId && !playerName) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      title={
        isDirect
          ? `${playerName || 'Spieler'} direkt auf LigaInsider öffnen`
          : `${playerName || 'Spieler'} auf LigaInsider suchen`
      }
      className={`oct-pill oct-bd-green inline-flex items-center gap-1.5 rounded-full bg-[#131915] border border-emerald-500/35 hover:border-emerald-400/80 hover:bg-[#18241c] text-gray-100 hover:text-white transition-all active:scale-95 shadow-md ${
        compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
      } font-semibold ${className}`}
    >
      {/* Facettiertes LigaInsider-LI-Emblem */}
      <span
        className={`hex-beacon inline-flex items-center justify-center bg-emerald-500 text-[#051209] font-black leading-none shrink-0 ${
          compact ? 'w-4 h-4 text-[8px]' : 'w-[18px] h-[18px] text-[9px]'
        }`}
        aria-hidden="true"
      >
        LI
      </span>
      <span className="leading-none">LigaInsider</span>
      <ExternalLink size={compact ? 11 : 12} className="text-emerald-400 shrink-0" />
    </a>
  );
}
