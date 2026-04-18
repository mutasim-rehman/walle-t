import React, { createContext, useContext, useMemo, useState } from 'react';

const SESSION_KEY = 'wallet_session_v1';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const AuthContext = createContext(null);

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(user) {
  if (!user) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(readSession());

  const value = useMemo(
    () => ({
      currentUser,
      isAuthenticated: Boolean(currentUser),
      async signup({ email, username, password }) {
        try {
          const res = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password }),
          });
          const data = await res.json();
          if (!res.ok || !data?.ok) {
            return { ok: false, message: data?.message || 'Signup failed.' };
          }
          const sessionUser = data.user;
          writeSession(sessionUser);
          setCurrentUser(sessionUser);
          return { ok: true };
        } catch {
          return { ok: false, message: 'Cannot reach auth server.' };
        }
      },
      async login({ usernameOrEmail, password }) {
        try {
          const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernameOrEmail, password }),
          });
          const data = await res.json();
          if (!res.ok || !data?.ok) {
            return { ok: false, message: data?.message || 'Login failed.' };
          }
          const sessionUser = data.user;
          writeSession(sessionUser);
          setCurrentUser(sessionUser);
          return { ok: true };
        } catch {
          return { ok: false, message: 'Cannot reach auth server.' };
        }
      },
      logout() {
        writeSession(null);
        setCurrentUser(null);
      },
    }),
    [currentUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
