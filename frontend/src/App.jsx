import React, { Suspense, lazy, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoadingScreen from './components/LoadingScreen';
import ProtectedRoute from './components/ProtectedRoute';

const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const DashboardHome = lazy(() => import('./pages/DashboardHome'));
const StocksMarketPage = lazy(() => import('./pages/StocksMarketPage'));
const ForexMarketPage = lazy(() => import('./pages/ForexMarketPage'));
const OptionsMarketPage = lazy(() => import('./pages/OptionsMarketPage'));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const RiskPage = lazy(() => import('./pages/RiskPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CompanyPrediction = lazy(() => import('./pages/CompanyPrediction'));

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Show 3D loading screen for 3 seconds before revealing the app
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Router>
      {isLoading && <LoadingScreen />}
      <div style={{ opacity: isLoading ? 0 : 1, transition: 'opacity 0.8s ease-in-out', width: '100%', height: '100%' }}>
        <Suspense fallback={<LoadingScreen />}>
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
                  <OptionsMarketPage />
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
              path="/company/:symbol"
              element={(
                <ProtectedRoute>
                  <CompanyPrediction />
                </ProtectedRoute>
              )}
            />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
