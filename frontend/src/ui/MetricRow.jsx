// Horizontale Icon+Titel+Beschreibung+Wert-Zeile - fuer Listen von Kennzahlen
// (z.B. Manager-Rating: Trades/offene Positionen/Kaderverkäufe).
export default function MetricRow({ icon: Icon, iconColor, title, description, value, valueColor }) {
  return (
    <div className="flex items-center gap-3 bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl p-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${iconColor}1A`, color: iconColor }}>
        <Icon size={17} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white truncate">{title}</div>
        {description && <div className="text-[11px] text-gray-500 truncate">{description}</div>}
      </div>
      <div className={`text-sm font-black shrink-0 text-right ${valueColor}`}>{value}</div>
    </div>
  );
}
