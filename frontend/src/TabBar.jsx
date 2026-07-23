import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const LigaIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5 12 3l9 6.5"></path>
    <path d="M5 8.5V21h14V8.5"></path>
    <path d="M10 21v-6h4v6"></path>
  </svg>
);

const PokalIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
    <path d="M4 22h16"></path>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
    <path d={active ? 'M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z' : 'M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z'} fill={active ? 'currentColor' : 'none'}></path>
  </svg>
);

const AccountIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" fill={active ? 'currentColor' : 'none'}></circle>
    <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill={active ? 'currentColor' : 'none'}></path>
  </svg>
);

const TABS = [
  { to: '/', label: 'Liga', Icon: LigaIcon, tourId: 'tab-liga', match: (p) => p === '/' || p.startsWith('/archiv') || p.startsWith('/user/') || p.startsWith('/compare/') },
  { to: '/pokal', label: 'Pokal', Icon: PokalIcon, tourId: 'tab-pokal', match: (p) => p.startsWith('/pokal') },
  { to: '/account', label: 'Account', Icon: AccountIcon, tourId: 'tab-account', match: (p) => p.startsWith('/account') || p === '/admin' || p === '/rules' }
];

const TabBar = () => {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#12141a]/95 backdrop-blur-xl border-t border-[#2a2e37]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-lg mx-auto flex items-stretch justify-around px-2">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              data-tour={tab.tourId}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 active:scale-95 transition-transform"
            >
              <span className={active ? 'text-[#ff5c3e]' : 'text-[#8b92a5]'}>
                {React.createElement(tab.Icon, { active })}
              </span>
              <span className={`text-[9px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-[#8b92a5]'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default TabBar;
