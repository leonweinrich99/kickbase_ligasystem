// Wiederverwendbarer An/Aus-Schalter im App-Design, genutzt von Reminders.jsx,
// PushNotificationCard.jsx und der Nutzerverwaltung.
export default function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${checked ? 'bg-[#ff5c3e]' : 'bg-[#2e2e2e]'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}></span>
    </button>
  );
}
