import { X, ArrowLeft } from 'lucide-react';

// Einheitlicher Schließen-Button (App-weiter Mehrheitsstandard) - ersetzt die
// vielen leicht unterschiedlichen Varianten (verschiedene Größen, teils reines
// "✕"-Textzeichen statt Icon), die historisch entstanden sind.
export default function CloseButton({ onClick, className = '', size = 'default', ...props }) {
  const sizeClasses = size === 'compact' ? 'w-8 h-8' : 'w-10 h-10';
  const iconSize = size === 'compact' ? 14 : 18;

  return (
    <button
      onClick={onClick}
      aria-label="Schließen"
      className={`shrink-0 flex items-center justify-center bg-[#171717] border border-[#2e2e2e] rounded-xl text-[#8b92a5] hover:text-white hover:border-[#404040] transition-all ${sizeClasses} ${className}`}
      {...props}
    >
      <X size={iconSize} strokeWidth={2.5} />
    </button>
  );
}

// Zurück-Button mit Pfeil + Text (Mehrheitsstandard für "Zurück"-Navigation,
// z.B. UserDetail/CompareView) - eigene Komponente, damit Icon/Text/Hover
// überall exakt gleich sind.
export function BackButton({ onClick, label = 'Zurück', className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-3 bg-[#171717] border border-[#2e2e2e] px-4 py-2 rounded-xl text-[#8b92a5] hover:text-white transition-all shrink-0 ${className}`}
    >
      <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
      <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}
