import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Rules from './Rules';
import Pokal from './Pokal';
import PokalRules from './PokalRules';
import SeasonView from './SeasonView';
import AdminPanel from './AdminPanel';
import Advisor from './Advisor';
import Account from './Account';
import Profile from './Profile';
import ManagerRatingPage from './ManagerRatingPage';
import LiveLineupPage from './LiveLineupPage';
import PlayerLiveDetailPage from './PlayerLiveDetailPage';
import PlayerDetailPage from './PlayerDetailPage';
import FeedPage from './FeedPage';
import FeedArticlePage from './FeedArticlePage';
import WeeklyArticlePage from './WeeklyArticlePage';
import Reminders from './Reminders';
import TabBar from './TabBar';
import ScrollToTop from './ScrollToTop';
import { AuthProvider } from './AuthContext';
import AuthGate from './AuthGate';
import { TourProvider } from './Tour';

function App() {
  useEffect(() => {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }, []);

  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#000000]">
          <ScrollToTop />

          {/* Progressiver iOS-Safe-Area-Blur (angelehnt an Apples Liquid-Glass
              Scroll-Edge-Effekt ab iOS 26): statt eines harten schwarzen Balkens
              gleiten hochgescrollte Inhalte weich und zunehmend unscharf unter
              Notch / Dynamic Island aus. Auf Geraeten ohne Notch (safe-area=0)
              automatisch 0px hoch und unsichtbar. */}
          <div className="ios-top-progressive-blur" aria-hidden="true">
            <div className="ios-top-blur-layer ios-top-blur-1" />
            <div className="ios-top-blur-layer ios-top-blur-2" />
            <div className="ios-top-blur-layer ios-top-blur-3" />
            <div className="ios-top-blur-tint" />
          </div>

          <TourProvider>
            <AuthGate>
              <div style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>
                <Routes>
                  <Route path="/rules" element={<Rules />} />
                  <Route path="/pokal" element={<Pokal />} />
                  <Route path="/pokal-rules" element={<PokalRules />} />
                  <Route path="/admin" element={<AdminPanel />} />
                  <Route path="/admin/advisor" element={<Advisor />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/account/profile" element={<Profile />} />
                  <Route path="/account/manager-rating" element={<ManagerRatingPage />} />
                  <Route path="/live" element={<LiveLineupPage />} />
                  <Route path="/live-player" element={<PlayerLiveDetailPage />} />
                  <Route path="/player/:playerId" element={<PlayerDetailPage />} />
                  <Route path="/feed" element={<FeedPage />} />
                  <Route path="/feed/weekly/:slug" element={<WeeklyArticlePage />} />
                  <Route path="/feed/:slug" element={<FeedArticlePage />} />
                  <Route path="/account/reminders" element={<Reminders />} />

                  {/* Archiv: eingefrorener Stand der Qualifikationsrunde 25/26 (nur Lesezugriff) */}
                  <Route
                    path="/archiv/*"
                    element={<SeasonView dataBase="/archive/quali-2025-26" routeBase="/archiv" mode="archive" />}
                  />

                  {/* Live: neues, unabhängiges Ligasystem 26/27 */}
                  <Route
                    path="/*"
                    element={<SeasonView dataBase="" routeBase="" mode="live" />}
                  />
                </Routes>
              </div>
              <TabBar />
            </AuthGate>
          </TourProvider>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
