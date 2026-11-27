import React, { Component, Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SeasonView from './SeasonView';
import TabBar from './TabBar';
import ScrollToTop from './ScrollToTop';
import { AuthProvider } from './AuthContext';
import AuthGate from './AuthGate';
import { TourProvider } from './Tour';
import PushPromptModal from './PushPromptModal';
import { useAppAnalytics } from './appAnalytics';

function AppAnalyticsTracker() {
  useAppAnalytics();
  return null;
}

// Schuetzt alle lazy()-Routen vor veralteten Chunk-Hashes nach einem neuen
// Vercel-Deployment (z.B. wenn die PWA noch offen war): laedt einmalig neu.
function lazyWithRetry(importer) {
  return lazy(() =>
    importer().catch((err) => {
      try {
        const key = 'kb_chunk_reload_ts';
        const last = Number(window.sessionStorage.getItem(key) || 0);
        if (Date.now() - last > 15000) {
          window.sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
          return new Promise(() => {});
        }
      } catch {
        // ignore storage errors
      }
      throw err;
    })
  );
}

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#000000] flex items-center justify-center p-6">
          <div className="card-surface rounded-2xl p-6 max-w-md w-full text-center space-y-3">
            <h1 className="text-base font-black text-white uppercase tracking-wider">
              Ansicht konnte nicht geladen werden
            </h1>
            <p className="text-xs text-[#8b92a5] leading-relaxed">
              Möglicherweise gab es gerade ein App-Update. Ein kurzes Neuladen behebt das Problem.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-[#ff5c3e] text-white text-xs font-black uppercase tracking-widest cursor-pointer"
            >
              Neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Route-Level Code Splitting: schwere Unterseiten (Recharts, Trading Advisor,
// Pokal, Live, Newsfeed, Admin) werden erst beim Besuch nachgeladen.
const Rules = lazyWithRetry(() => import('./Rules'));
const Pokal = lazyWithRetry(() => import('./Pokal'));
const PokalRules = lazyWithRetry(() => import('./PokalRules'));
const AdminPanel = lazyWithRetry(() => import('./AdminPanel'));
const Advisor = lazyWithRetry(() => import('./Advisor'));
const Account = lazyWithRetry(() => import('./Account'));
const Profile = lazyWithRetry(() => import('./Profile'));
const ManagerRatingPage = lazyWithRetry(() => import('./ManagerRatingPage'));
const LiveLineupPage = lazyWithRetry(() => import('./LiveLineupPage'));
const PlayerLiveDetailPage = lazyWithRetry(() => import('./PlayerLiveDetailPage'));
const PlayerDetailPage = lazyWithRetry(() => import('./PlayerDetailPage'));
const FeedPage = lazyWithRetry(() => import('./FeedPage'));
const FeedArticlePage = lazyWithRetry(() => import('./FeedArticlePage'));
const WeeklyArticlePage = lazyWithRetry(() => import('./WeeklyArticlePage'));
const Reminders = lazyWithRetry(() => import('./Reminders'));

const RouteFallback = () => <div className="min-h-screen bg-[#000000]" />;

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
              <AppAnalyticsTracker />
              <div style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>
                <RouteErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/rules" element={<Rules />} />
                    <Route path="/pokal" element={<Pokal />} />
                    <Route path="/pokal-rules" element={<PokalRules />} />
                    <Route path="/admin" element={<AdminPanel />} />
                    <Route path="/admin/advisor" element={<Advisor />} />
                    <Route path="/account" element={<Account />} />
                    <Route path="/account/profile" element={<Profile />} />
                    <Route path="/account/manager-rating" element={<ManagerRatingPage />} />
                    <Route path="/manager-rating/:kickbaseId" element={<ManagerRatingPage />} />
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
                </Suspense>
                </RouteErrorBoundary>
              </div>
              <TabBar />
              <PushPromptModal />
            </AuthGate>
          </TourProvider>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
