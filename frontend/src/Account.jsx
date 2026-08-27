import React from 'react';
import { Link } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import { BookOpen, Trophy, Archive, Shield, TrendingUp, HelpCircle, Bell, Link2, ChevronRight } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useTour } from './Tour';
import accountLogo from './assets/account_logo.png';
import { SeasonSnapshot } from './AccountStats';
import ManagerRatingBadge from './ManagerRatingBadge';
import PageHeader from './ui/PageHeader';

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.35, delay: i * 0.05, ease: 'easeOut' } }),
};

const MenuRow = ({ to, onClick, icon: Icon, label, color = '#8b92a5' }) => {
  const content = (
    <div className="flex items-center gap-3.5 px-5 py-4 hover:bg-[#1e1e1e] active:bg-[#242424] transition-colors">
      <div className="w-6 h-6 flex items-center justify-center shrink-0" style={{ color }}>
        <Icon size={18} strokeWidth={2.5} />
      </div>
      <span className="text-sm font-bold text-gray-100 flex-1">{label}</span>
      <ChevronRight size={15} strokeWidth={2.5} className="text-[#4b5563]" />
    </div>
  );

  if (onClick) {
    return <button onClick={onClick} className="w-full text-left">{content}</button>;
  }
  return <Link to={to}>{content}</Link>;
};

const MenuGroup = ({ title, children, index }) => (
  <Motion.div variants={fadeUp} initial="hidden" animate="show" custom={index} className="mb-5">
    {title && <div className="text-[10px] font-black uppercase tracking-widest text-[#626978] mb-2 px-1">{title}</div>}
    <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl divide-y divide-[#2a2a2a] overflow-hidden">
      {children}
    </div>
  </Motion.div>
);

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 5) return 'Gute Nacht';
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
};

const Account = () => {
  const { user, profile, isAdmin, isFirebaseConfigured, signOut } = useAuth();
  const tour = useTour();
  const firstName = profile?.displayName?.split(' ')[0];

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-lg mx-auto">
        <Motion.div variants={fadeUp} initial="hidden" animate="show" custom={0} className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-14 sm:h-14 flex items-center justify-center overflow-hidden flex-shrink-0">
              <img src={accountLogo} alt="Account Logo" className="w-full h-full object-contain" />
            </div>
            <PageHeader eyebrow="SAISON 26/27" title={`${getGreeting()}${firstName ? `, ${firstName}` : ''}`} />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {profile?.kickbaseId && <ManagerRatingBadge kickbaseId={profile.kickbaseId} />}
            {isFirebaseConfigured && user && (
              <Link to="/account/profile" className="relative shrink-0" aria-label="Profil öffnen">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#1f1f1f] border-2 border-[#ff5c3e] flex items-center justify-center overflow-hidden">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={profile?.displayName || 'Avatar'} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-base font-black text-[#ff5c3e]">{(profile?.displayName || user.email || '?').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                {isAdmin && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-purple-500 border-2 border-black flex items-center justify-center text-[7px] font-black text-white">A</span>
                )}
              </Link>
            )}
          </div>
        </Motion.div>

        {profile?.kickbaseId ? (
          <Motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}>
            <SeasonSnapshot kickbaseId={profile.kickbaseId} kickbaseName={profile.kickbaseName} photoURL={user?.photoURL} />
          </Motion.div>
        ) : (
          <Motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}>
            <Link
              to="/account/profile"
              className="flex items-center gap-4 border border-dashed border-[#ff5c3e]/40 rounded-2xl p-5 mb-4 hover:border-[#ff5c3e] transition-all active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#ff5c3e]/10 text-[#ff5c3e] flex items-center justify-center shrink-0">
                <Link2 size={20} strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-100">Kickbase-Account verbinden</div>
                <div className="text-xs text-[#8b92a5] mt-0.5">Zeigt dir deine Liga-Statistiken & Pokal-Status hier direkt an.</div>
              </div>
              <ChevronRight size={16} strokeWidth={2.5} className="text-[#ff5c3e] shrink-0" />
            </Link>
          </Motion.div>
        )}

        <MenuGroup title="Liga & Pokal" index={3}>
          <MenuRow to="/rules" icon={BookOpen} label="Regelkatalog" />
          <MenuRow to="/pokal-rules" icon={Trophy} label="Pokal-Regeln" />
          <MenuRow to="/archiv" icon={Archive} label="Quali-Daten (Archiv)" />
        </MenuGroup>

        <MenuGroup title="Persönlich" index={4}>
          <MenuRow to="/account/reminders" icon={Bell} label="Erinnerungen" />
          <MenuRow onClick={tour.start} icon={HelpCircle} label="App-Tutorial ansehen" />
        </MenuGroup>

        {isAdmin && (
          <MenuGroup title="Verwaltung" index={5}>
            <MenuRow to="/admin/advisor" icon={TrendingUp} label="Trading Advisor" color="#22d3ee" />
            <MenuRow to="/admin" icon={Shield} label="Admin Panel" color="#a855f7" />
          </MenuGroup>
        )}

        {isFirebaseConfigured && user && (
          <Motion.button
            variants={fadeUp} initial="hidden" animate="show" custom={6}
            onClick={signOut}
            className="w-full text-center text-xs font-bold uppercase tracking-widest text-red-400/70 hover:text-red-400 py-3 transition-colors"
          >
            Abmelden
          </Motion.button>
        )}
      </div>
    </div>
  );
};

export default Account;
