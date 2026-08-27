// Ebene-1-Seitenkopf: Eyebrow-Zeile + große Überschrift. Genutzt von den
// Haupt-Zielseiten (Liga, Pokal, Account, Admin, Trading Advisor), damit alle
// exakt dieselbe Größe/den gleichen Rhythmus haben. Die Akzentfarbe der
// Eyebrow-Zeile bleibt pro Seite konfigurierbar (z.B. Advisor = Cyan).
export default function PageHeader({ eyebrow, accentColor = '#ff5c3e', title }) {
  return (
    <div className="min-w-0 pr-1">
      <div className="text-[9px] sm:text-[11px] font-bold tracking-wider mb-1" style={{ color: accentColor }}>{eyebrow}</div>
      <h1 className="text-[17px] sm:text-3xl font-black tracking-tight uppercase leading-[1.1] break-words">{title}</h1>
    </div>
  );
}
