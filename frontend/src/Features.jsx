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

const Features = ({ data }) => {
  const trends = data?.marketTrends || [];

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
          Live Analyse & Trends
        </div>
        <h1 className="text-4xl sm:text-[4rem] font-black tracking-tighter uppercase leading-[1.05] mb-6 bg-gradient-to-br from-white via-white to-gray-500 bg-clip-text text-transparent">
          Echtzeit Trading <br /> <span className="text-[#4ba6ff]">Insights</span>
        </h1>
        <p className="max-w-2xl mx-auto text-[#8b92a5] text-sm sm:text-lg font-medium leading-relaxed">
          Hier siehst du die Live-Daten aus deiner Liga. Unsere KI analysiert den Transfermarkt und die Budgets der Konkurrenz in Echtzeit.
        </p>
      </motion.header>

      {/* Live Market Trends Section */}
      <section className="mb-20">
        <h2 className="text-2xl font-black text-white mb-8 uppercase tracking-widest border-l-4 border-[#4ba6ff] pl-4">Top Marktwert-Gewinner</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {trends.length > 0 ? (
            trends.map((player, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-5 flex items-center justify-between group hover:border-[#4ba6ff]/50 transition-all"
              >
                <div>
                  <div className="text-white font-bold text-lg">{player.name}</div>
                  <div className="text-[#626978] text-xs font-bold uppercase tracking-tighter">{player.team}</div>
                </div>
                <div className="text-right">
                  <div className="text-[#22c55e] font-black text-lg">+{player.change.toLocaleString('de-DE')} €</div>
                  <div className="text-[#626978] text-[10px] font-bold uppercase">Trend: Steigend</div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="col-span-full text-center py-10 text-[#8b92a5] border-2 border-dashed border-[#2a2e37] rounded-3xl">
              Keine Trenddaten verfügbar. Starte den Datenabruf, um Live-Analyse zu erhalten.
            </div>
          )}
        </div>
      </section>

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
        {/* ... Rest of FeatureCards simplified or removed for space ... */}
        <FeatureCard 
          color="purple"
          title="KI-Portofolio Check"
          text="Das Tool sagt dir genau, welche Spieler du halten solltest und wann der optimale Verkaufszeitpunkt erreicht ist."
          icon={(props) => (
            <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
          )}
        />
        <FeatureCard 
          color="orange"
          title="Serverless Actions"
          text="Vollautomatischer Betrieb über GitHub Actions. Kein eigener Server nötig – die Berechnungen laufen zuverlässig im Hintergrund, 24/7."
          icon={(props) => (
            <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
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
          Fahrstuhl-Modus aktiviert. Live-Daten bereitgestellt vom <a href="#" className="text-[#4ba6ff] hover:underline">Kickbase Analyzer Engine</a>
        </p>
      </motion.footer>
    </div>
  );
};

export default Features;
