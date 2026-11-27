import React from 'react';
import { Link } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import { HelpCircle, Link2, ChevronRight, Pencil } from './ui/icons';
import { useAuth } from './AuthContext';
import { useTour } from './Tour';
import { useNextMatchday } from './useNextMatchday';
import accountLogo from './assets/account_logo.png';
import rulesLogo from './assets/rules_logo.png';
import pokalLogo from './assets/pokal_logo.png';
import archiveLogo from './assets/archive_logo.png';
import remindersLogo from './assets/reminders_logo.png';
import advisorLogo from './assets/advisor_logo.png';
import adminLogo from './assets/admin_logo.png';
import { SeasonSnapshot } from './AccountStats';
import TabPageHeader from './ui/TabPageHeader';

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.32, delay: i * 0.045, ease: 'easeOut' } }),
};

const BentoTile = ({ to, image, label, subtitle, accentBorder }) => (
  <Link
    to={to}
    className="card-surface oct-md rounded-2xl p-3.5 flex items-center gap-3 hover:bg-[#1d1e24] active:scale-[0.98] transition-all group min-w-0"
    style={accentBorder ? { borderColor: accentBorder, '--oct-bd': accentBorder } : undefined}
  >
    <div className="w-8 h-8 flex items-center justify-center shrink-0">
      <img src={image} alt="" className="w-7 h-7 object-contain group-hover:scale-105 transition-transform" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-bold text-gray-100 leading-tight truncate">{label}</div>
      {subtitle && (
        <div className="text-[10px] font-medium text-[#7e8596] mt-0.5 truncate">{subtitle}</div>
      )}
    </div>
  </Link>
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
  const nextMatchday = useNextMatchday();
  const firstName = profile?.displayName?.split(' ')[0];

  const eyebrow = nextMatchday
    ? `SAISON 26/27 · ST ${nextMatchday.number}`
    : 'SAISON 26/27';

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-lg mx-auto">
        {/* Top Header */}
        <Motion.div variants={fadeUp} initial="hidden" animate="show" custom={0} className="mb-5">
          <TabPageHeader
            bordered={false}
            logo={<img src={accountLogo} alt="Account Logo" className="w-full h-full object-contain" />}
            eyebrow={eyebrow}
            title={`${getGreeting()}${firstName ? `, ${firstName}` : ''}`}
            right={
              isFirebaseConfigured && user ? (
                <Link
                  to="/account/profile"
                  aria-label="Profil bearbeiten"
                  className="oct-pill inline-flex items-center gap-1.5 rounded-full bg-[#17181f] border border-white/15 hover:border-[#ff5c3e]/60 px-3 py-1.5 text-[11px] font-bold text-gray-200 hover:text-white transition-all active:scale-95 shrink-0 shadow-md"
                >
                  <span>Profil</span>
                  <Pencil size={11} className="text-[#ff5c3e]" />
                </Link>
              ) : null
            }
          />
        </Motion.div>

        {/* 1. Manager-Hero-Card + Pokal-Duell-Kachel */}
        {profile?.kickbaseId ? (
          <Motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}>
            <SeasonSnapshot
              kickbaseId={profile.kickbaseId}
              kickbaseName={profile.kickbaseName}
              photoURL={user?.photoURL}
            />
          </Motion.div>
        ) : (
          <Motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}>
            <Link
              to="/account/profile"
              className="oct-box oct-bd-accent flex items-center gap-4 border border-dashed border-[#ff5c3e]/40 rounded-2xl p-5 mb-5 bg-[#141418]/70 hover:border-[#ff5c3e] transition-all active:scale-[0.98]"
            >
              <div className="oct-sm oct-bd-none w-10 h-10 rounded-xl bg-[#ff5c3e]/10 text-[#ff5c3e] flex items-center justify-center shrink-0">
                <Link2 size={20} strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-100">Kickbase-Account verbinden</div>
                <div className="text-xs text-[#8b92a5] mt-0.5">
                  Zeigt dir deine Liga-Statistiken, dein Rating & deinen Pokal-Status direkt hier im Cockpit an.
                </div>
              </div>
              <ChevronRight size={16} strokeWidth={2.5} className="text-[#ff5c3e] shrink-0" />
            </Link>
          </Motion.div>
        )}

        {/* 2. 2x2 Bento-Grid: Liga & Mehr */}
        <Motion.div variants={fadeUp} initial="hidden" animate="show" custom={2} className="mb-5" data-tour="account-menu">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#626978] mb-2.5 px-1">
            Liga & Mehr
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <BentoTile to="/rules" image={rulesLogo} label="Regelkatalog" subtitle="Liga-Regeln" />
            <BentoTile to="/pokal-rules" image={pokalLogo} label="Pokal-Regeln" subtitle="Modus & Ablauf" />
            <BentoTile to="/archiv" image={archiveLogo} label="Quali-Archiv" subtitle="Saison 25/26" />
            <BentoTile to="/account/reminders" image={remindersLogo} label="Push-Alarme" subtitle="Erinnerungen" />
          </div>
        </Motion.div>

        {/* 3. Admin-Bento (nur für Admins sichtbar) */}
        {isAdmin && (
          <Motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="mb-5">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#626978]">Verwaltung</span>
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-purple-400">Admin</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <BentoTile
                to="/admin/advisor"
                image={advisorLogo}
                label="Trading Advisor"
                subtitle="KI & Markt"
                accentBorder="rgba(167, 139, 250, 0.28)"
              />
              <BentoTile
                to="/admin"
                image={adminLogo}
                label="Admin Panel"
                subtitle="Steuerung"
                accentBorder="rgba(167, 139, 250, 0.28)"
              />
            </div>
          </Motion.div>
        )}

        {/* 4. Kompakter Footer: App-Tutorial & Abmelden */}
        <Motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={4}
          className="mt-6 pt-4 border-t border-white/[0.07] flex items-center justify-between gap-3 px-1"
        >
          <button
            type="button"
            onClick={tour.start}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8b92a5] hover:text-white transition-colors py-1.5 cursor-pointer"
          >
            <HelpCircle size={14} strokeWidth={2.2} />
            <span>App-Tutorial</span>
          </button>

          {isFirebaseConfigured && user && (
            <button
              type="button"
              onClick={signOut}
              className="text-[11px] font-extrabold uppercase tracking-widest text-red-400/75 hover:text-red-400 py-1.5 transition-colors cursor-pointer"
            >
              Abmelden
            </button>
          )}
        </Motion.div>
      </div>
    </div>
  );
};

export default Account;
