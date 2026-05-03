import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import RouteFallback from './components/RouteFallback';
import ProtectedRoute from './components/ProtectedRoute';

const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const DashboardHome = lazy(() => import('./pages/DashboardHome'));
const StocksMarketPage = lazy(() => import('./pages/StocksMarketPage'));
const ForexMarketPage = lazy(() => import('./pages/ForexMarketPage'));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const RiskPage = lazy(() => import('./pages/RiskPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdvisorPage = lazy(() => import('./pages/AdvisorPage'));
const CompanyPrediction = lazy(() => import('./pages/CompanyPrediction'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));

function App() {
  return (
    <Router>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/onboarding"
            element={(
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/dashboard"
            element={(
              <ProtectedRoute>
                <DashboardHome />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/market/stocks"
            element={(
              <ProtectedRoute>
                <StocksMarketPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/market/forex"
            element={(
              <ProtectedRoute>
                <ForexMarketPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/market/options"
            element={(
              <ProtectedRoute>
                <Navigate to="/dashboard" replace />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/portfolio"
            element={(
              <ProtectedRoute>
                <PortfolioPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/risk"
            element={(
              <ProtectedRoute>
                <RiskPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/profile"
            element={(
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/settings"
            element={(
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/advisor"
            element={(
              <ProtectedRoute>
                <AdvisorPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/company/:symbol"
            element={(
              <ProtectedRoute>
                <CompanyPrediction />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin"
            element={(
              <ProtectedRoute>
                <AdminPanel />
              </ProtectedRoute>
            )}
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
