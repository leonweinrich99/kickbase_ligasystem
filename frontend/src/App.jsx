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
        <div className="min-h-screen bg-[#000000]">
          <ScrollToTop />

          {/* Deckt die Safe-Area oben (Notch/Dynamic Island/Statusleiste) permanent
              mit der Hintergrundfarbe ab - fix positioniert, damit hochgescrollter
              Inhalt nicht darunter/dahinter sichtbar wird. */}
          <div
            className="fixed top-0 left-0 right-0 z-[100] pointer-events-none bg-[#000000]"
            style={{ height: 'env(safe-area-inset-top, 0px)' }}
          ></div>

          <TourProvider>
            <AuthGate>
              <div style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
                <Routes>
                  <Route path="/rules" element={<Rules />} />
                  <Route path="/pokal" element={<Pokal />} />
                  <Route path="/pokal-rules" element={<PokalRules />} />
                  <Route path="/admin" element={<AdminPanel />} />
                  <Route path="/admin/advisor" element={<Advisor />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/account/profile" element={<Profile />} />
                  <Route path="/account/manager-rating" element={<ManagerRatingPage />} />
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
