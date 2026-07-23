import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import ligaLogo from './assets/logo.png';
import pokalLogo from './assets/pokal_logo.png';
import accountLogo from './assets/account_logo.png';

const LigaIcon = ({ active }) => (
  <img
    src={ligaLogo}
    alt="Liga"
    className="w-7 h-7 object-contain transition-all duration-200"
    style={active ? {} : { filter: 'grayscale(1)', opacity: 0.5 }}
  />
);

const PokalIcon = ({ active }) => (
  <img
    src={pokalLogo}
    alt="Pokal"
    className="w-7 h-7 object-contain transition-all duration-200"
    style={active ? {} : { filter: 'grayscale(1)', opacity: 0.5 }}
  />
);

const AccountIcon = ({ active }) => (
  <img
    src={accountLogo}
    alt="Account"
    className="w-7 h-7 object-contain transition-all duration-200"
    style={active ? {} : { filter: 'grayscale(1)', opacity: 0.5 }}
  />
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
      data-tabbar="true"
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
