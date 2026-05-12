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
    purple: 'border-purple-500/40 hover:border-purple-500 hover:bg-purple-500/10',
  };

  const textColors = {
    blue: 'text-blue-400',
    orange: 'text-orange-400',
    green: 'text-green-400',
    red: 'text-red-400',
    purple: 'text-purple-400',
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

const PokalRules = () => {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4 relative overflow-x-hidden">
      <Link 
        to="/pokal" 
        className="absolute top-4 right-4 sm:top-10 sm:right-0 p-2 text-[#8b92a5] hover:text-white bg-[#1a1d24] border border-[#2a2e37] rounded-xl transition-all hover:border-[#3a3f4a] shadow-lg z-50"
        title="Zurück zum Pokal"
      >
        <CloseIcon />
      </Link>

      <motion.header 
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="text-center mb-20 pt-10 sm:pt-0"
      >
        <div className="inline-block px-3 py-1 mb-4 text-[#8b5cf6] text-[0.85rem] font-extrabold uppercase tracking-[2.5px] bg-purple-500/10 border border-purple-500/20 rounded-full">
          Saison 26/27
        </div>
        <h1 className="text-4xl sm:text-[3.5rem] font-black tracking-tighter uppercase leading-[1.1] mb-4 bg-gradient-to-br from-white to-[#9ca3af] bg-clip-text text-transparent">
          KICKBASE POKAL<br />Regelkatalog
        </h1>
      </motion.header>

      <div className="space-y-16">
        <section>
          <SectionTitle title="Turniermodus & Einstellungen" />
          <RuleCard 
            color="blue" 
            title="Die Auslosung" 
            text="Zu Beginn der Pokal-Saison gibt es eine erste Auslosung, die auf den bestehenden Qualigruppenergebnissen basiert. Dafür werden zwei Lostöpfe gebildet, aus denen die Kontrahenten für das Sechzehntelfinale gezogen werden. Für alle darauffolgenden Runden bzw. Spieltage werden die Partien immer wieder neu ausgelost."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8"></polyline>
                <line x1="4" y1="20" x2="21" y2="3"></line>
                <polyline points="21 16 21 21 16 21"></polyline>
                <line x1="15" y1="15" x2="21" y2="21"></line>
                <line x1="4" y1="4" x2="9" y2="9"></line>
              </svg>
            )}
          />
          <RuleCard 
            color="purple" 
            title="Head-to-Head Modus" 
            text="Die Spieler treten an einem festen Spieltag direkt gegeneinander an. Das Duell im Head-to-Head entscheidet über das Weiterkommen."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            )}
          />
          <RuleCard 
            color="blue" 
            title="Arena-Modus" 
            text="Der Pokal wird im speziellen Arenamodus von Kickbase gespielt. Alle Teams haben somit dieselben Voraussetzungen."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            )}
          />
          <RuleCard 
            color="orange" 
            title="Budget" 
            text="Jeder Teilnehmer erhält ein festes Startbudget in Höhe von 250 Millionen Euro, um seinen Kader für den Pokal-Spieltag aufzustellen."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                <path d="M12 18V6" />
              </svg>
            )}
          />
        </section>

        <section>
          <SectionTitle title="Verlauf & Belohnung" />
          <RuleCard 
            color="green" 
            title="K.O.-System" 
            text="Der Gewinner jedes Duells zieht direkt in die nächste Runde ein. Der Verlierer scheidet aus dem Pokalwettbewerb aus."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            )}
          />
          <RuleCard 
            color="red" 
            title="Die ultimative Belohnung" 
            text="Der Pokalsieger erhält die einmalige Chance, eine Liga aufzusteigen! Er darf in der Relegation um den Aufstieg in die nächst höhere Liga spielen."
            icon={(props) => (
              <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z" />
              </svg>
            )}
          />
        </section>
      </div>
    </div>
  );
};

export default PokalRules;
