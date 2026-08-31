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
      className={`group flex items-center gap-2 text-[#8b92a5] hover:text-white transition-colors ${className}`}
    >
      <svg className="group-hover:-translate-x-1 transition-transform" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
      <span className="font-bold text-sm">{label}</span>
    </button>
  );
}
