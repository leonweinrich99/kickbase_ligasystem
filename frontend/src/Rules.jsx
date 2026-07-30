import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { subscribeToRules } from './rulesConfig';

const colors = {
  blue: ['border-blue-500/40', 'text-blue-400'], orange: ['border-orange-500/40', 'text-orange-400'],
  green: ['border-green-500/40', 'text-green-400'], red: ['border-red-500/40', 'text-red-400'], purple: ['border-purple-500/40', 'text-purple-400'],
};
const accentClasses = { orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20', purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };

const RuleCatalog = ({ type = 'league', backTo = '/', label = 'Regelkatalog', accent = 'orange' }) => {
  const [rules, setRules] = useState(null);
  useEffect(() => subscribeToRules(setRules), []);
  const cards = rules?.[type] || [];
  const sections = [...new Set(cards.map((rule) => rule.section))];

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 relative overflow-x-hidden">
      <Link to={backTo} className="absolute top-4 right-4 sm:top-10 sm:right-0 p-2 text-[#8b92a5] hover:text-white bg-[#171717] border border-[#2e2e2e] rounded-xl transition-all z-50" title="Zurück">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </Link>
      <header className="text-center mb-20 pt-10 sm:pt-0">
        <div className={`inline-block px-3 py-1 mb-4 text-[0.85rem] font-extrabold uppercase tracking-[2.5px] border rounded-full ${accentClasses[accent] || accentClasses.orange}`}>{rules?.season || 'Saison 26/27'}</div>
        <h1 className="text-4xl sm:text-[3.5rem] font-black tracking-tighter uppercase leading-[1.1] bg-gradient-to-br from-white to-[#9ca3af] bg-clip-text text-transparent">KICKBASE<br />{label}</h1>
      </header>
      <div className="space-y-16">
        {sections.map((section) => (
          <section key={section}>
            <h2 className="text-[1.8rem] font-black text-[#f8fafc] mb-8 tracking-tight pb-3 border-b border-white/5 uppercase">{section}</h2>
            {cards.filter((rule) => rule.section === section).map((rule) => {
              const [border, text] = colors[rule.color] || colors.blue;
              return <article key={rule.id} className="relative pl-6 sm:pl-8 mb-6">
                <div className={`absolute left-0 top-0 bottom-0 border-l-4 ${border}`} />
                <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-5 sm:p-6 shadow-lg">
                  <h3 className={`text-lg sm:text-xl font-black ${text} mb-3 uppercase tracking-tight`}>{rule.title}</h3>
                  <div className="text-sm sm:text-base text-[#8b92a5] leading-relaxed font-medium whitespace-pre-line">{rule.text}</div>
                </div>
              </article>;
            })}
          </section>
        ))}
      </div>
    </div>
  );
};

export default function Rules() { return <RuleCatalog />; }
