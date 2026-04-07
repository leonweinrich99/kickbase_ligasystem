import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const FeatureCard = ({ title, text, color, icon: Icon, delay = 0 }) => {
  const borderColors = {
    blue: 'border-blue-500/40 hover:border-blue-500 hover:bg-blue-500/10',
    orange: 'border-orange-500/40 hover:border-orange-500 hover:bg-orange-500/10',
    green: 'border-green-500/40 hover:border-green-500 hover:bg-green-500/10',
    purple: 'border-purple-500/40 hover:border-purple-500 hover:bg-purple-500/10',
  };

  const textColors = {
    blue: 'text-blue-400',
    orange: 'text-orange-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: delay }}
      className="group bg-[#1a1d24] border border-[#2a2e37] rounded-3xl p-6 sm:p-8 transition-all duration-300 hover:border-[#3a3f4a] hover:-translate-y-2 shadow-2xl relative overflow-hidden"
    >
      {/* Decorative Gradient Background */}
      <div className={`absolute -right-4 -top-4 w-24 h-24 blur-3xl opacity-10 rounded-full transition-opacity group-hover:opacity-20 bg-${color}-500`}></div>
      
      <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#0f1115] border-2 flex items-center justify-center mb-6 transition-all duration-300 ${borderColors[color]}`}>
        <Icon className={`w-7 h-7 sm:w-8 sm:h-8 ${textColors[color]}`} />
      </div>

      <h3 className="text-xl sm:text-2xl font-black text-gray-100 mb-4 uppercase tracking-tighter">{title}</h3>
      <p className="text-sm sm:text-base text-[#8b92a5] leading-relaxed font-medium">
        {text}
      </p>
    </motion.div>
  );
};

const Features = () => {
  return (
    <div className="max-w-6xl mx-auto py-10 px-4 sm:px-6 relative overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Link 
          to="/" 
          className="absolute top-4 right-4 sm:top-10 sm:right-6 p-2 text-[#8b92a5] hover:text-white bg-[#1a1d24] border border-[#2a2e37] rounded-xl transition-all hover:border-[#3a3f4a] shadow-lg z-50"
          title="Zurück zum Dashboard"
        >
          <CloseIcon />
        </Link>
      </motion.div>

      <motion.header 
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="text-center mb-20 pt-10 sm:pt-0"
      >
        <div className="inline-block px-3 py-1 mb-4 text-[#4ba6ff] text-[0.85rem] font-extrabold uppercase tracking-[2.5px] bg-blue-500/10 border border-blue-500/20 rounded-full">
          Kickbase Trading Advisor
        </div>
        <h1 className="text-4xl sm:text-[4rem] font-black tracking-tighter uppercase leading-[1.05] mb-6 bg-gradient-to-br from-white via-white to-gray-500 bg-clip-text text-transparent">
          Mächtige Features <br /> <span className="text-[#4ba6ff]">Für Profi-Manager</span>
        </h1>
        <p className="max-w-2xl mx-auto text-[#8b92a5] text-sm sm:text-lg font-medium leading-relaxed">
          Nutze modernste Technologie und Datenanalyse, um deiner Konkurrenz immer einen Schritt voraus zu sein. Unser Trading-Paket bietet dir volle Transparenz.
        </p>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        <FeatureCard 
          color="blue"
          title="Budget-Kalkulator"
          text="Analyse der gesamten Liga-Historie, um das aktuelle Budget deiner Konkurrenten präzise zu schätzen. Kenne ihre finanziellen Grenzen für jeden Transfer."
          icon={(props) => (
            <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          )}
        />
        <FeatureCard 
          color="purple"
          title="KI-Marktwert-Trend"
          text="Ein Machine Learning Modell analysiert Punkte, Spielzeit und Trends, um die Marktwert-Entwicklung der nächsten Tage vorherzusagen. Verpasse keinen Peak."
          icon={(props) => (
            <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 7l-7.1 7.1-4.8-4.8-7.1 7.1"/><polyline points="15 7 22 7 22 14"/>
            </svg>
          )}
        />
        <FeatureCard 
          color="orange"
          title="Email-Advisor"
          text="Erhalte tägliche Reports direkt nach den Marktwert-Updates (ca. 22:00 Uhr). Alle Prognosen und Budgets kompakt in deinem Postfach."
          icon={(props) => (
            <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
          )}
        />
        <FeatureCard 
          color="green"
          title="Portfolio-Check"
          text="Automatisierte Bewertung deines Kaders. Das Tool sagt dir genau, welche Spieler du halten solltest und wann der optimale Verkaufszeitpunkt erreicht ist."
          icon={(props) => (
            <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
          )}
        />
        <FeatureCard 
          color="blue"
          title="Serverless Actions"
          text="Vollautomatischer Betrieb über GitHub Actions. Kein eigener Server nötig – die Berechnungen laufen zuverlässig im Hintergrund, 24/7."
          icon={(props) => (
            <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
          )}
        />
        <FeatureCard 
          color="orange"
          title="Mobile Optimiert"
          text="Alle Features sind vollständig responsiv gestaltet. Nutze das Trading-Wissen bequem auf dem Smartphone, während du am Transfermarkt zuschlägst."
          icon={(props) => (
            <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          )}
        />
      </div>

      <motion.footer 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        className="mt-20 py-10 border-t border-white/5 text-center"
      >
        <p className="text-[#626978] text-xs sm:text-sm">
          Basierend auf dem Open-Source Projekt <a href="https://github.com/LennardFe/Kickbase-Trading-Advisor" target="_blank" className="text-[#4ba6ff] hover:underline">Kickbase Trading Advisor</a>
        </p>
      </motion.footer>
    </div>
  );
};

export default Features;
