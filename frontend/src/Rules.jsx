import { useEffect, useState } from 'react';
import { motion as Motion } from 'framer-motion';
import { subscribeToRules, saveRules } from './rulesConfig';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import rulesLogo from './assets/rules_logo.png';
import pokalLogo from './assets/pokal_logo.png';
import HexFrame from './ui/HexFrame';
import {
  RuleFairplayIcon,
  MessageCircle,
  Users,
  RuleLoansIcon,
  RuleBudgetIcon,
  RuleDrawIcon,
  RuleArenaIcon,
  ArrowRight,
  Trophy,
  RuleEditIcon,
  Info,
  X,
} from './ui/icons';

const colors = {
  blue: ['border-blue-500/40 hover:border-blue-500 hover:bg-blue-500/10', 'text-blue-400', '#3b82f6'],
  orange: ['border-orange-500/40 hover:border-orange-500 hover:bg-orange-500/10', 'text-orange-400', '#f97316'],
  green: ['border-green-500/40 hover:border-green-500 hover:bg-green-500/10', 'text-green-400', '#22c55e'],
  red: ['border-red-500/40 hover:border-red-500 hover:bg-red-500/10', 'text-red-400', '#ef4444'],
  purple: ['border-purple-500/40 hover:border-purple-500 hover:bg-purple-500/10', 'text-purple-400', '#a855f7'],
};

const RULE_ICONS = {
  fairplay: RuleFairplayIcon,
  discussion: MessageCircle,
  'team-limits': Users,
  loans: RuleLoansIcon,
  underpay: RuleBudgetIcon,
  draw: RuleDrawIcon,
  'head-to-head': Users,
  arena: RuleArenaIcon,
  budget: RuleBudgetIcon,
  knockout: ArrowRight,
  reward: Trophy,
};

const Icon = ({ id, className }) => {
  const Comp = RULE_ICONS[id] || Info;
  return <Comp className={className} strokeWidth={2.5} />;
};

const PencilIcon = <RuleEditIcon size={14} strokeWidth={2.5} />;

const RuleEditForm = ({ rule, onCancel, onSave, saving }) => {
  // Eigene Komponente, die NUR waehrend isEditing gerendert wird: der lokale
  // State initialisiert sich beim Mounten direkt aus `rule` - kein Effekt
  // noetig, da ein Wechsel zurueck zur Ansicht (isEditing=false) diese
  // Komponente ohnehin unmountet und beim naechsten Bearbeiten frisch
  // neu gemountet wird.
  const [draft, setDraft] = useState({ title: rule.title, text: rule.text });

  return (
    <div className="space-y-3">
      <input
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        className="w-full bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2 text-lg font-black text-gray-100 uppercase tracking-tight outline-none focus:border-[#ff5c3e]"
      />
      <textarea
        rows={4}
        value={draft.text}
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        className="w-full bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2 text-sm text-[#8b92a5] outline-none focus:border-[#ff5c3e] resize-y"
      />
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5] hover:text-white px-4 py-2 rounded-lg transition-colors">Abbrechen</button>
        <button
          onClick={() => onSave(rule.id, draft)}
          disabled={saving}
          className="text-[10px] font-black uppercase tracking-widest bg-[#ff5c3e] text-white px-4 py-2 rounded-lg hover:bg-[#ff7056] transition-colors disabled:opacity-50"
        >
          {saving ? 'Speichere...' : 'Speichern'}
        </button>
      </div>
    </div>
  );
};

const RuleCard = ({ rule, number, isAdmin, isEditing, onEdit, onCancel, onSave, saving }) => {
  const [, text, hexColor] = colors[rule.color] || colors.blue;

  return (
    <Motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.5, ease: 'easeOut' }} className="group relative pl-16 sm:pl-24 mb-10">
      <div className="absolute left-0 top-0 z-10">
        <HexFrame
          className="w-12 h-12 sm:w-16 sm:h-16 transition-transform duration-300 group-hover:scale-105"
          innerClassName="bg-[#000000]"
          ringColor={hexColor}
          ringWidth={1.8}
        >
          <Icon id={rule.id} className={`w-6 h-6 sm:w-8 sm:h-8 ${text}`} />
        </HexFrame>
      </div>
      <div className="oct-box bg-[#171717] border border-[#2e2e2e] rounded-2xl p-5 sm:p-6 transition-all duration-300 group-hover:border-[#404040] group-hover:translate-x-1 shadow-lg relative">
        {isAdmin && !isEditing && (
          <button
            onClick={() => onEdit(rule.id)}
            className="absolute top-4 right-4 p-2 rounded-lg oct-sm bg-[#000] border border-[#2e2e2e] text-[#8b92a5] hover:text-white hover:border-[#404040] active:scale-95 transition-all z-20"
            title="Regel bearbeiten"
          >
            {PencilIcon}
          </button>
        )}

        {isEditing ? (
          <RuleEditForm rule={rule} onCancel={onCancel} onSave={onSave} saving={saving} />
        ) : (
          <>
            <h3 className="text-lg sm:text-xl font-black text-gray-100 mb-3 uppercase tracking-tight pr-8">{rule.title || `Regel ${number}`}</h3>
            <div className="text-sm sm:text-base text-[#8b92a5] leading-relaxed font-medium whitespace-pre-line">{rule.text}</div>
          </>
        )}
      </div>
    </Motion.div>
  );
};

export default function Rules({ type = 'league', backTo = '/', label = 'Regelkatalog', accent = 'orange' }) {
  const handleBack = useBackNavigation(backTo);
  const { isAdmin } = useAuth();
  const [rules, setRules] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeToRules(setRules), []);
  const cards = rules?.[type] || [];
  const sections = [...new Set(cards.map((rule) => rule.section))];
  const isCup = type === 'cup';

  const handleSaveRule = async (ruleId, updates) => {
    setSaving(true);
    try {
      const updatedList = rules[type].map((r) => (r.id === ruleId ? { ...r, ...updates } : r));
      const updatedRules = { ...rules, [type]: updatedList };
      await saveRules(updatedRules);
      setEditingId(null);
    } catch (error) {
      alert(`Fehler beim Speichern: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 relative overflow-x-hidden">
      <button onClick={handleBack} className="absolute top-4 right-4 sm:top-10 sm:right-0 p-2 text-[#8b92a5] hover:text-white bg-[#171717] border border-[#2e2e2e] rounded-xl oct-md transition-all hover:border-[#404040] shadow-lg z-50" title="Zurück">
        <X size={24} strokeWidth={2.5} />
      </button>
      <Motion.header initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="text-center mb-20 pt-10 sm:pt-0">
        <img
          src={isCup ? pokalLogo : rulesLogo}
          alt={label}
          className="w-16 h-16 sm:w-20 sm:h-20 object-contain mx-auto mb-4"
        />
        <div className={`inline-block px-3 py-1 mb-4 text-[0.85rem] font-extrabold uppercase tracking-[2.5px] border rounded-full oct-pill ${accent === 'purple' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20 oct-bd-purple' : 'text-orange-400 bg-orange-500/10 border-orange-500/20 oct-bd-accent'}`}>{rules?.season || 'Saison 26/27'}</div>
        <h1 className="text-4xl sm:text-[3.5rem] font-black tracking-tighter uppercase leading-[1.1] mb-4 bg-gradient-to-br from-white to-[#9ca3af] bg-clip-text text-transparent">KICKBASE {isCup ? 'POKAL' : 'LIGASYSTEM'}<br />{label}</h1>
      </Motion.header>
      <div className="space-y-16">
        {sections.map((section) => (
          <section key={section}>
            <Motion.h2 initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-[1.8rem] font-black text-[#f8fafc] mb-8 mt-16 first:mt-0 tracking-tight pb-3 border-b border-white/5 uppercase">{section}</Motion.h2>
            {cards.filter((rule) => rule.section === section).map((rule, index) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                number={index + 1}
                isAdmin={isAdmin}
                isEditing={editingId === rule.id}
                onEdit={setEditingId}
                onCancel={() => setEditingId(null)}
                onSave={handleSaveRule}
                saving={saving}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
