// Ebene-1-Seitenkopf: Eyebrow-Zeile + große Überschrift. Genutzt von den
// Haupt-Zielseiten (Liga, Pokal, Account, Admin, Trading Advisor), damit alle
// exakt dieselbe Größe/den gleichen Rhythmus haben. Die Akzentfarbe der
// Eyebrow-Zeile bleibt pro Seite konfigurierbar (z.B. Advisor = Cyan).
//
// Overflow-Garantie: min-w-0 + max-w-full + overflow-hidden sorgen dafuer,
// dass lange Eyebrows oder Titel niemals Nachbar-Buttons aus dem Viewport schieben.
export default function PageHeader({ eyebrow, eyebrowBadge = null, accentColor = '#ff5c3e', title }) {
  return (
    <div className="min-w-0 flex-1 max-w-full overflow-hidden pr-1">
      <div className="flex items-center gap-2 mb-0.5 min-w-0 max-w-full">
        <div
          className="text-[9px] sm:text-[11px] font-semibold tracking-wider truncate"
          style={{ color: accentColor }}
        >
          {eyebrow}
        </div>
        {eyebrowBadge && <div className="shrink-0">{eyebrowBadge}</div>}
      </div>
      <h1 className="text-[19px] sm:text-3xl font-bold tracking-tight uppercase leading-[1.1] break-words">
        {title}
      </h1>
    </div>
  );
}
