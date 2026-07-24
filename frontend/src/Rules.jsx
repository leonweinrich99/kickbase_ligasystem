import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="group relative pl-16 sm:pl-24 mb-10"
    >
      {/* Number/Icon Circle */}
      <div className={`absolute left-0 top-0 w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#000000] border-2 flex items-center justify-center z-10 transition-all duration-300 ${borderColors[color]}`}>
        {Icon ? <Icon className={`w-6 h-6 sm:w-8 sm:h-8 ${textColors[color]}`} /> : <span className={`text-lg sm:text-xl font-black ${textColors[color]}`}>{number}</span>}
      </div>

      <div className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-5 sm:p-6 transition-all duration-300 group-hover:border-[#3a3f4a] group-hover:translate-x-1 shadow-lg">
        <h3 className="text-lg sm:text-xl font-black text-gray-100 mb-3 uppercase tracking-tight">{title}</h3>
        <div className="text-sm sm:text-base text-[#8b92a5] leading-relaxed font-medium">
          {text}
          {children}
        </div>
      </div>
    </motion.div>
  );
};

const SectionTitle = ({ title }) => (
  <motion.h2 
    initial={{ opacity: 0, x: -20 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5 }}
    className="text-[1.8rem] font-black text-[#f8fafc] mb-8 mt-16 first:mt-0 tracking-tight pb-3 border-b border-white/5 uppercase"
  >
    {title}
  </motion.h2>
);

const Rules = () => {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4 relative overflow-x-hidden">
      <Link 
        to="/" 
        className="absolute top-4 right-4 sm:top-10 sm:right-0 p-2 text-[#8b92a5] hover:text-white bg-[#1a1d24] border border-[#2a2e37] rounded-xl transition-all hover:border-[#3a3f4a] shadow-lg z-50"
        title="Zurück zum Dashboard"
      >
        <CloseIcon />
      </Link>

      <motion.header 
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="text-center mb-20 pt-10 sm:pt-0"
      >
        <div className="inline-block px-3 py-1 mb-4 text-[#f97316] text-[0.85rem] font-extrabold uppercase tracking-[2.5px] bg-orange-500/10 border border-orange-500/20 rounded-full">
          Saison 26/27
        </div>
        <h1 className="text-4xl sm:text-[3.5rem] font-black tracking-tighter uppercase leading-[1.1] mb-4 bg-gradient-to-br from-white to-[#9ca3af] bg-clip-text text-transparent">
          KICKBASE LIGASYSTEM<br />Regelkatalog
        </h1>
      </motion.header>

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
          <SectionTitle title="Einsatz & Gewinn" />
          <RuleCard
            color="green"
            title="Startgeld"
            text="Jede*r zahlende Teilnehmer*in überweist 5 € in den gemeinsamen Preispool. Frist: bis Donnerstag, 13.08. (1 Tag vor Start der Vorbereitungsphase)."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 18V6" />
              </svg>
            )}
          />
          <RuleCard
            color="orange"
            title="Preispool"
            text="Bei 26 zahlenden Manager*innen stehen insgesamt 130 € Preisgeld zur Verfügung, aufgeteilt nach Liga. Die Verteilung gilt unter der Voraussetzung, dass alle 26 Personen ihren Einsatz überweisen."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            )}
          >
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[#000000] border border-[#2a2e37] rounded-xl p-3 text-center">
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Liga 1</div>
                <div className="text-xs text-gray-300 space-y-1">
                  <div>🥇 25 €</div><div>🥈 18 €</div><div>🥉 12 €</div>
                </div>
                <div className="text-[10px] text-[#626978] mt-2 font-bold">= 55 €</div>
              </div>
              <div className="bg-[#000000] border border-[#2a2e37] rounded-xl p-3 text-center">
                <div className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-2">Liga 2</div>
                <div className="text-xs text-gray-300 space-y-1">
                  <div>🥇 20 €</div><div>🥈 15 €</div><div>🥉 8 €</div>
                </div>
                <div className="text-[10px] text-[#626978] mt-2 font-bold">= 43 €</div>
              </div>
              <div className="bg-[#000000] border border-[#2a2e37] rounded-xl p-3 text-center">
                <div className="text-[10px] font-black uppercase tracking-widest text-green-400 mb-2">Liga 3</div>
                <div className="text-xs text-gray-300 space-y-1">
                  <div>🥇 15 €</div><div>🥈 10 €</div><div>🥉 7 €</div>
                </div>
                <div className="text-[10px] text-[#626978] mt-2 font-bold">= 32 €</div>
              </div>
            </div>
          </RuleCard>
          <RuleCard
            color="red"
            title="Sonderregel: Spiel ohne Einsatz"
            text="Wer nicht um Geld mitspielt, zahlt die 5 € nicht ein und kann dementsprechend auch kein Preisgeld gewinnen. Erreicht diese Person dennoch einen Treppchenplatz, wird das Preisgeld an den nächsten Platz dahinter ausgezahlt."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
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
