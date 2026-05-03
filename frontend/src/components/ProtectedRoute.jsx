import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import TerminalLoaderBackdrop from './TerminalLoaderBackdrop.jsx';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, authReady } = useAuth();
  if (!authReady) {
    return (
      <TerminalLoaderBackdrop variant="compact" primary="Checking session" detail="Hold on—we are verifying credentials…" />
    );
  }
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return children;
}
