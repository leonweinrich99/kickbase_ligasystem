import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useTour } from './Tour';
import accountLogo from './assets/account_logo.png';

const MenuLink = ({ to, onClick, icon, label, color = '#8b92a5' }) => {
  const content = (
    <div className="flex items-center gap-4 bg-[#171717] border border-[#2e2e2e] rounded-2xl px-5 py-4 hover:border-[#404040] transition-all active:scale-[0.98]">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1A`, color }}>
        {icon}
      </div>
      <span className="text-sm font-bold text-gray-100 flex-1">{label}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </div>
  );

  if (onClick) {
    return <button onClick={onClick} className="w-full text-left">{content}</button>;
  }
  return <Link to={to}>{content}</Link>;
};

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

const TutorialIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

const LogoutIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

const Account = () => {
  const { user, profile, isAdmin, isFirebaseConfigured, signOut } = useAuth();
  const tour = useTour();

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 sm:gap-6 mb-8">
          <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center p-0.5 sm:p-1 overflow-hidden flex-shrink-0">
            <img src={accountLogo} alt="Account Logo" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] sm:text-[11px] font-bold tracking-wider text-[#ff5c3e] mb-1">SAISON 26/27</div>
            <h1 className="text-[17px] sm:text-3xl font-black tracking-tight uppercase leading-[1.1]">Account</h1>
          </div>
        </div>

        {isFirebaseConfigured && user && (
          <div className="flex items-center gap-4 bg-[#171717] border border-[#2e2e2e] rounded-2xl p-5 mb-8">
            <div className="w-14 h-14 rounded-full bg-[#1f1f1f] border border-[#2e2e2e] flex items-center justify-center overflow-hidden shrink-0">
              {user.photoURL ? (
                <img src={user.photoURL} alt={profile?.displayName || 'Avatar'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-black text-[#ff5c3e]">{(profile?.displayName || user.email || '?').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-gray-100 truncate flex items-center gap-2">
                {profile?.displayName || 'Unbenannt'}
                {isAdmin && <span className="text-[8px] font-black uppercase tracking-widest bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full px-1.5 py-0.5">Admin</span>}
              </div>
              <div className="text-xs text-[#8b92a5] truncate">{user.email}</div>
            </div>
          </div>
        )}

        <div data-tour="account-menu" className="flex flex-col gap-3 mb-8">
          <MenuLink onClick={tour.start} icon={TutorialIcon} label="App-Tutorial ansehen" color="#eab308" />
          <MenuLink to="/rules" icon={RulesIcon} label="Regelkatalog" color="#ff5c3e" />
          <MenuLink to="/pokal-rules" icon={TrophyIcon} label="Pokal-Regeln" color="#8b5cf6" />
          <MenuLink to="/archiv" icon={ArchiveIcon} label="Quali-Daten (Archiv)" color="#8b92a5" />
          {isAdmin && (
            <MenuLink to="/admin" icon={ShieldIcon} label="Admin Panel" color="#a855f7" />
          )}
        </div>

        {isFirebaseConfigured && user && (
          <MenuLink onClick={signOut} icon={LogoutIcon} label="Abmelden" color="#ef4444" />
        )}
      </div>
    </div>
  );
};

export default Account;
