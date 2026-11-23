import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import ligaLogo from './assets/logo.png';
import pokalLogo from './assets/pokal_logo.png';
import accountLogo from './assets/account_logo.png';

const LigaIcon = ({ active }) => (
  <img
    src={ligaLogo}
    alt="Liga"
    className="w-6 h-6 object-contain transition-all duration-200"
    style={active ? {} : { filter: 'grayscale(1)', opacity: 0.5 }}
  />
);

const PokalIcon = ({ active }) => (
  <img
    src={pokalLogo}
    alt="Pokal"
    className="w-6 h-6 object-contain transition-all duration-200"
    style={active ? {} : { filter: 'grayscale(1)', opacity: 0.5 }}
  />
);

const AccountIcon = ({ active }) => (
  <img
    src={accountLogo}
    alt="Account"
    className="w-6 h-6 object-contain transition-all duration-200"
    style={active ? {} : { filter: 'grayscale(1)', opacity: 0.5 }}
  />
);

const TABS = [
  { to: '/', label: 'Liga', Icon: LigaIcon, tourId: 'tab-liga', match: (p) => p === '/' || p.startsWith('/archiv') || p.startsWith('/user/') || p.startsWith('/compare/') },
  { to: '/pokal', label: 'Pokal', Icon: PokalIcon, tourId: 'tab-pokal', match: (p) => p.startsWith('/pokal') },
  { to: '/account', label: 'Account', Icon: AccountIcon, tourId: 'tab-account', match: (p) => p.startsWith('/account') || p === '/admin' || p === '/rules' }
];

// "Liquid Glass"-Tabbar (Apple-Designsprache seit iOS 26, WWDC 2025, Owner-
// Wunsch 23.11.2026): statt der frueheren randstaendigen, blickdichten Leiste
// jetzt eine freischwebende, abgerundete Kapsel mit Abstand zum Bildschirmrand.
// echte optische Lichtbrechung ("Refraction") kann CSS/backdrop-filter nicht
// nachbilden (das macht nur SwiftUIs natives .glassEffect()) - angenaehert
// ueber die ueblichen Web-Bausteine dieses Looks: starker backdrop-blur +
// -saturate, sehr helle, durchscheinende Fuellung, ein heller Rand (Kante
// des "Glases") und ein eingeschriebener heller Hoehen-Glanz oben
// (inset-Shadow) kombiniert mit einem weichen Tiefen-Schatten darunter, der
// die Kapsel vom Inhalt abhebt. Aktiver Tab bekommt eine eigene kleine
// Glas-Kapsel in der App-Akzentfarbe dahinter (wie Apples eigener
// "Glass-Capsule"-Indikator fuer den selektierten Tab).
const TabBar = () => {
  const { pathname } = useLocation();

  return (
    <nav
      data-tabbar="true"
      className="fixed left-1/2 -translate-x-1/2 z-40 flex items-stretch gap-1 px-2 py-1.5 rounded-full bg-white/10 border border-white/25 backdrop-blur-xl backdrop-saturate-[1.8] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_20px_40px_-16px_rgba(0,0,0,0.85)]"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            data-tour={tab.tourId}
            className={`relative flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-full active:scale-95 transition-all duration-200 ${
              active ? 'bg-[#ff5c3e]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]' : ''
            }`}
          >
            <span className={active ? 'text-[#ff5c3e]' : 'text-[#8b92a5]'}>
              {React.createElement(tab.Icon, { active })}
            </span>
            <span className={`text-[8px] font-semibold uppercase tracking-widest ${active ? 'text-white' : 'text-[#8b92a5]'}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};

export default TabBar;
