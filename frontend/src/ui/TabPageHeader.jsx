import React from 'react';
import PageHeader from './PageHeader';

/**
 * Einheitlicher, overflow-sicherer Ebene-1-Header fuer alle Haupt-Tabs
 * (Liga, Pokal, Newsfeed, Live, Account).
 *
 * Strukturgarantien (verhindern horizontale UI-Brueche auf schmalen Handys):
 * 1. Top-Row trennt streng in [Logo (shrink-0)] + [Titel-Spalte (flex-1 min-w-0 overflow-hidden)]
 *    + [Rechts-Slot (shrink-0 max-w-[48%])]. Variable Status-Leisten gehoeren
 *    NIEMALS in die Eyebrow-Zeile, sondern immer in den eigenen `statusStrip`-Slot.
 * 2. `statusStrip` bekommt immer 100% Breite unterhalb der Top-Row und darf frei
 *    umbrechen (`flex-wrap`), sodass lange Texte (z.B. Spieltags-/Rundenstatus)
 *    weder Logo noch Rechts-Buttons ueberlagern oder aus dem Viewport druecken.
 * 3. `children` (Controls-Leiste, z.B. Spieltag-Wechsler, Pokal-Runden-Tabs,
 *    ModeSwitch) sitzt in einer eigenen `w-full min-w-0`-Zeile darunter.
 */
export default function TabPageHeader({
  logo,
  eyebrow,
  eyebrowBadge = null,
  accentColor = '#ff5c3e',
  title,
  right = null,
  statusStrip = null,
  bordered = true,
  className = '',
  children = null,
}) {
  return (
    <header
      data-layout-guard="tab-page-header"
      className={`flex flex-col w-full min-w-0 max-w-full ${
        bordered ? 'border-b border-[#2e2e2e] pb-4 sm:pb-6' : ''
      } gap-3 sm:gap-4 ${className}`}
    >
      {/* Top Row: Logo + Titel + optionaler Rechts-Slot */}
      <div
        data-layout-guard="header-top-row"
        className="flex justify-between items-center gap-2 sm:gap-3 w-full min-w-0"
      >
        <div
          data-layout-guard="header-identity"
          className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1 overflow-hidden"
        >
          {logo && (
            <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center overflow-hidden flex-shrink-0">
              {logo}
            </div>
          )}
          <PageHeader
            eyebrow={eyebrow}
            eyebrowBadge={eyebrowBadge}
            accentColor={accentColor}
            title={title}
          />
        </div>

        {right && (
          <div
            data-layout-guard="header-right"
            className="shrink-0 max-w-[48%] flex items-center justify-end"
          >
            {right}
          </div>
        )}
      </div>

      {/* Dedizierte vollbreite Status-Zeile (z.B. BL-Spieltag / naechste Pokalrunde) */}
      {statusStrip && (
        <div data-layout-guard="header-status-strip" className="w-full min-w-0">
          {statusStrip}
        </div>
      )}

      {/* Dedizierte Controls-Zeile (Wechsler, Runden-Tabs, Filter etc.) */}
      {children && (
        <div data-layout-guard="header-controls" className="w-full min-w-0">
          {children}
        </div>
      )}
    </header>
  );
}
