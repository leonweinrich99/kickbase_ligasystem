import React from 'react';

const RuleCard = ({ number, title, text, color, children, icon: Icon }) => {
  const borderColors = {
    blue: 'border-blue-500/40 hover:border-blue-500 hover:bg-blue-500/10',
    orange: 'border-orange-500/40 hover:border-orange-500 hover:bg-orange-500/10',
    green: 'border-green-500/40 hover:border-green-500 hover:bg-green-500/10',
    red: 'border-red-500/40 hover:border-red-500 hover:bg-red-500/10',
  };

  const textColors = {
    blue: 'text-blue-400',
    orange: 'text-orange-400',
    green: 'text-green-400',
    red: 'text-red-400',
  };

  return (
    <div className="group relative pl-12 sm:pl-16 mb-8">
      {/* Timeline Line */}
      <div className="absolute left-6 sm:left-8 top-0 bottom-[-32px] w-[2px] bg-[#2a2e37] group-last:bottom-0"></div>
      
      {/* Number/Icon Circle */}
      <div className={`absolute left-0 top-0 w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#0f1115] border-2 flex items-center justify-center z-10 transition-all duration-300 ${borderColors[color]}`}>
        {Icon ? <Icon className={`w-6 h-6 sm:w-8 sm:h-8 ${textColors[color]}`} /> : <span className={`text-lg sm:text-xl font-black ${textColors[color]}`}>{number}</span>}
      </div>

      <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-5 sm:p-6 transition-all duration-300 group-hover:border-[#3a3f4a] group-hover:translate-x-1 shadow-lg">
        <h3 className="text-lg sm:text-xl font-black text-gray-100 mb-3 uppercase tracking-tight">{title}</h3>
        <div className="text-sm sm:text-base text-[#8b92a5] leading-relaxed font-medium">
          {text}
          {children}
        </div>
      </div>
    </div>
  );
};

const SectionTitle = ({ title }) => (
  <h2 className="text-xl sm:text-2xl font-black text-white mb-8 mt-12 first:mt-0 uppercase tracking-wider flex items-center">
    <span className="w-2 h-6 bg-[#ff5c3e] mr-4 rounded-full"></span>
    {title}
  </h2>
);

const Rules = () => {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <header className="text-center mb-16">
        <div className="text-[10px] sm:text-[12px] font-bold tracking-[0.2em] text-[#ff5c3e] mb-3 uppercase">Offizieller Katalog</div>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase text-white mb-4">
          Regelwerk <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500">Saison 26/27</span>
        </h1>
        <div className="w-20 h-1 bg-[#ff5c3e] mx-auto rounded-full opacity-50"></div>
      </header>

      <div className="space-y-16">
        <section>
          <SectionTitle title="Fairplay & Verantwortung" />
          <RuleCard 
            color="blue" 
            title="Fairplay & Mindset" 
            text="Fairness und Spaß stehen an erster Stelle. Die Regeln sind einzuhalten und Strafen umzusetzen. Niederlagen sollen sportlich genommen werden."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            )}
          />
          <RuleCard 
            color="blue" 
            title="Diskussion" 
            text="Jeder ist für die Regeleinhaltung verantwortlich. Verstöße werden liga-intern diskutiert, Strafen im Zweifel per Mehrheitsentscheid festgelegt."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            )}
          />
        </section>

        <section>
          <SectionTitle title="Limits & Transfers" />
          <RuleCard 
            color="green" 
            title="Team-Limits" 
            text="Maximal 2 Spieler desselben Teams in der Startelf. Im gesamten Kader sind bis zu 3 Spieler eines Teams erlaubt."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            )}
          />
          <RuleCard 
            color="orange" 
            title="Spielerleihen" 
            text="Leihgebühren müssen mindestens 500k pro Spieltag betragen."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            )}
          />
          <RuleCard 
            color="red" 
            title="Underpay-Verbot" 
            text="Kauf unter Marktwert ist verboten. 1. Verstoß = Gelb, 2. Verstoß = Rot (Strafe)."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            )}
          />
        </section>

        <section>
          <SectionTitle title="Spieltags-Regeln" />
          <RuleCard 
            color="orange" 
            title="Zwangsverkauf Top 3" 
            text="Top 3 Manager der Woche müssen ihren besten Spieler (Startelf) bis Montag 22 Uhr an den Transfermarkt verkaufen."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )}
          />
          <RuleCard 
            color="red" 
            title="Strafen" 
            text="Bei Verstoß muss am nächsten Spieltag ein Spieler weniger aufgestellt werden. Nichtbefolgung ist ein weiterer Verstoß."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            )}
          />
        </section>

        <section>
          <SectionTitle title="Aufstieg & Abstieg" />
          <RuleCard 
            color="green" 
            title="Auf- und Abstieg" 
            text="Greift nach Hin- und Rückrunde. Platz 1&2 steigen auf, Platz 8&9 steigen ab."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
              </svg>
            )}
          />
          <RuleCard 
            color="orange" 
            title="Relegation" 
            text="Letzter Spieltag: Platz 3 vs Platz 7 der höheren Liga. Vergleich via Matchday Challenge (Rushmodus)."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            )}
          />
        </section>
      </div>
    </div>
  );
};

export default Rules;
