import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { subscribeToRules } from './rulesConfig';

const colors = {
  blue: ['border-blue-500/40 hover:border-blue-500 hover:bg-blue-500/10', 'text-blue-400'],
  orange: ['border-orange-500/40 hover:border-orange-500 hover:bg-orange-500/10', 'text-orange-400'],
  green: ['border-green-500/40 hover:border-green-500 hover:bg-green-500/10', 'text-green-400'],
  red: ['border-red-500/40 hover:border-red-500 hover:bg-red-500/10', 'text-red-400'],
  purple: ['border-purple-500/40 hover:border-purple-500 hover:bg-purple-500/10', 'text-purple-400'],
};

const Icon = ({ id, className }) => {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.5', strokeLinecap: 'round', strokeLinejoin: 'round', className };
  const paths = {
    fairplay: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l7.78-7.78a5.5 5.5 0 0 0 0-7.78z" /></>,
    discussion: <><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5z" /></>,
    'team-limits': <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    loans: <><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
    underpay: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    draw: <><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></>,
    'head-to-head': <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    arena: <><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></>,
    budget: <><circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6" /></>,
    knockout: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    reward: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z" /></>,
  };
  return <svg {...common}>{paths[id] || <circle cx="12" cy="12" r="9" />}</svg>;
};

const RuleCard = ({ rule, number }) => {
  const [border, text] = colors[rule.color] || colors.blue;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.5, ease: 'easeOut' }} className="group relative pl-16 sm:pl-24 mb-10">
      <div className={`absolute left-0 top-0 w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#000000] border-2 flex items-center justify-center z-10 transition-all duration-300 ${border}`}>
        <Icon id={rule.id} className={`w-6 h-6 sm:w-8 sm:h-8 ${text}`} />
      </div>
      <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-5 sm:p-6 transition-all duration-300 group-hover:border-[#404040] group-hover:translate-x-1 shadow-lg">
        <h3 className="text-lg sm:text-xl font-black text-gray-100 mb-3 uppercase tracking-tight">{rule.title || `Regel ${number}`}</h3>
        <div className="text-sm sm:text-base text-[#8b92a5] leading-relaxed font-medium whitespace-pre-line">{rule.text}</div>
      </div>
    </motion.div>
  );
};

export default function Rules({ type = 'league', backTo = '/', label = 'Regelkatalog', accent = 'orange' }) {
  const [rules, setRules] = useState(null);
  useEffect(() => subscribeToRules(setRules), []);
  const cards = rules?.[type] || [];
  const sections = [...new Set(cards.map((rule) => rule.section))];
  const isCup = type === 'cup';

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 relative overflow-x-hidden">
      <Link to={backTo} className="absolute top-4 right-4 sm:top-10 sm:right-0 p-2 text-[#8b92a5] hover:text-white bg-[#171717] border border-[#2e2e2e] rounded-xl transition-all hover:border-[#404040] shadow-lg z-50" title="Zurück">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </Link>
      <motion.header initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="text-center mb-20 pt-10 sm:pt-0">
        <div className={`inline-block px-3 py-1 mb-4 text-[0.85rem] font-extrabold uppercase tracking-[2.5px] border rounded-full ${accent === 'purple' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' : 'text-orange-400 bg-orange-500/10 border-orange-500/20'}`}>{rules?.season || 'Saison 26/27'}</div>
        <h1 className="text-4xl sm:text-[3.5rem] font-black tracking-tighter uppercase leading-[1.1] mb-4 bg-gradient-to-br from-white to-[#9ca3af] bg-clip-text text-transparent">KICKBASE {isCup ? 'POKAL' : 'LIGASYSTEM'}<br />{label}</h1>
      </motion.header>
      <div className="space-y-16">
        {sections.map((section) => (
          <section key={section}>
            <motion.h2 initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-[1.8rem] font-black text-[#f8fafc] mb-8 mt-16 first:mt-0 tracking-tight pb-3 border-b border-white/5 uppercase">{section}</motion.h2>
            {cards.filter((rule) => rule.section === section).map((rule, index) => <RuleCard key={rule.id} rule={rule} number={index + 1} />)}
          </section>
        ))}
      </div>
    </div>
  );
}
