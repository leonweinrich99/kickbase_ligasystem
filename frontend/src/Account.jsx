import React from 'react';
import { Link } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import { useAuth } from './AuthContext';
import { useTour } from './Tour';
import accountLogo from './assets/account_logo.png';
import { SeasonSnapshot } from './AccountStats';
import ManagerRatingBadge from './ManagerRatingBadge';

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.35, delay: i * 0.05, ease: 'easeOut' } }),
};

const MenuRow = ({ to, onClick, icon, label, color = '#8b92a5' }) => {
  const content = (
    <div className="flex items-center gap-3.5 px-5 py-4 hover:bg-[#1e1e1e] active:bg-[#242424] transition-colors">
      <div className="w-6 h-6 flex items-center justify-center shrink-0" style={{ color }}>
        {icon}
      </div>
      <span className="text-sm font-bold text-gray-100 flex-1">{label}</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
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

const RulesIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
);

const TrophyIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
    <path d="M4 22h16"></path>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
    <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z"></path>
  </svg>
);

const ArchiveIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8v13H3V8"></path>
    <path d="M1 3h22v5H1z"></path>
    <path d="M10 12h4"></path>
  </svg>
);

const ShieldIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 3 6v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V6l-9-4z"></path>
  </svg>
);

const AdvisorIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
    <polyline points="17 6 23 6 23 12"></polyline>
  </svg>
);

const TutorialIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

const BellIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
  </svg>
);

const LinkIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
  </svg>
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
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[11px] font-bold tracking-wider text-[#ff5c3e] mb-1">SAISON 26/27</div>
              <h1 className="text-[17px] sm:text-2xl font-black tracking-tight leading-[1.1] truncate">
                {getGreeting()}{firstName ? `, ${firstName}` : ''}
              </h1>
            </div>
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
                {LinkIcon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-100">Kickbase-Account verbinden</div>
                <div className="text-xs text-[#8b92a5] mt-0.5">Zeigt dir deine Liga-Statistiken & Pokal-Status hier direkt an.</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff5c3e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </Link>
          </Motion.div>
        )}

        <MenuGroup title="Liga & Pokal" index={3}>
          <MenuRow to="/rules" icon={RulesIcon} label="Regelkatalog" />
          <MenuRow to="/pokal-rules" icon={TrophyIcon} label="Pokal-Regeln" />
          <MenuRow to="/archiv" icon={ArchiveIcon} label="Quali-Daten (Archiv)" />
        </MenuGroup>

        <MenuGroup title="Persönlich" index={4}>
          <MenuRow to="/account/reminders" icon={BellIcon} label="Erinnerungen" />
          <MenuRow onClick={tour.start} icon={TutorialIcon} label="App-Tutorial ansehen" />
        </MenuGroup>

        {isAdmin && (
          <MenuGroup title="Verwaltung" index={5}>
            <MenuRow to="/admin/advisor" icon={AdvisorIcon} label="Trading Advisor" color="#22d3ee" />
            <MenuRow to="/admin" icon={ShieldIcon} label="Admin Panel" color="#a855f7" />
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
