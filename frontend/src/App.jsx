import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Rules from './Rules';
import Pokal from './Pokal';
import PokalRules from './PokalRules';
import SeasonView from './SeasonView';
import AdminPanel from './AdminPanel';
import { AuthProvider } from './AuthContext';
import AuthGate from './AuthGate';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-[#0f1115]">
          <AuthGate>
            <Routes>
              <Route path="/rules" element={<Rules />} />
              <Route path="/pokal" element={<Pokal />} />
              <Route path="/pokal-rules" element={<PokalRules />} />
              <Route path="/admin" element={<AdminPanel />} />

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
          </AuthGate>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
