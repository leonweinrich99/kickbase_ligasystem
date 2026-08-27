// Kompakte, zentrierte Icon+Wert+Label-Kachel - fuer Raster mit 2-4 Kacheln
// nebeneinander (z.B. Manager-Rating-Teilscores, Account-Liga-Stats).
// Konsolidiert die zuvor 2x fast identisch nachgebauten Varianten in
// ManagerRatingBadge.jsx und AccountStats.jsx.
export default function StatTile({ icon: Icon, iconColor = '#ff5c3e', value, label, boxed = false, card = true, valueColor }) {
  const iconEl = Icon ? (
    boxed ? (
      <div className="w-9 h-9 rounded-xl bg-[#000] flex items-center justify-center mb-1.5" style={{ color: iconColor }}>
        <Icon size={16} />
      </div>
    ) : (
      <Icon size={16} className="mx-auto mb-1.5" style={{ color: iconColor }} />
    )
  ) : null;

  return (
    <div className={`flex flex-col items-center text-center ${card ? 'bg-[#1f1f1f] rounded-xl p-2.5 border border-[#2a2a2a]' : 'flex-1'}`}>
      {iconEl}
      <div className="text-sm font-black leading-none" style={{ color: valueColor || '#fff' }}>{value ?? '–'}</div>
      <div className="text-[8px] font-bold uppercase tracking-widest text-gray-500 mt-1.5">{label}</div>
    </div>
  );
}
