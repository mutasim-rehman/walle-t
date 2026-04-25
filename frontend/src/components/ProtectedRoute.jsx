import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, authReady } = useAuth();
  if (!authReady) return null;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return children;
}
