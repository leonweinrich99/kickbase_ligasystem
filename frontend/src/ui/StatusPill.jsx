// Farbige Pille für einen ZUSTAND (z.B. "Ausstehend", "Freigegeben", "Verknüpft").
// Für einmaliges Aktions-Feedback (Speichern/Senden-Ergebnis) NICHT diese
// Komponente nutzen, sondern schlichtes Icon+Text in der Akzentfarbe.
const VARIANTS = {
  green: 'bg-green-500/10 text-green-400 border-green-500/30',
  red: 'bg-red-500/10 text-red-400 border-red-500/30',
  yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  gray: 'bg-[#1f1f1f] text-[#8b92a5] border-[#2e2e2e]',
};

export default function StatusPill({ icon: Icon, children, variant = 'gray', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border shrink-0 ${VARIANTS[variant] || VARIANTS.gray} ${className}`}>
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}
