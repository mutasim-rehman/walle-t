import React, { createContext, useContext, useMemo, useState } from 'react';

const SESSION_KEY = 'wallet_session_v1';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const API_FALLBACK_BASE = 'http://localhost:4001/api';

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

async function postAuth(path, payload) {
  const bases = API_BASE === API_FALLBACK_BASE ? [API_BASE] : [API_BASE, API_FALLBACK_BASE];
  let lastError = null;

  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        return { ok: false, message: data?.message || 'Request failed.' };
      }
      return { ok: true, user: data.user };
    } catch (error) {
      lastError = error;
    }
  }

  return { ok: false, message: 'Cannot reach auth server.', error: lastError };
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(readSession());

  const value = useMemo(
    () => ({
      currentUser,
      isAuthenticated: Boolean(currentUser),
      async signup({ email, username, password }) {
        const result = await postAuth('/auth/signup', { email, username, password });
        if (!result.ok) {
          return { ok: false, message: result.message || 'Signup failed.' };
        }
        const sessionUser = result.user;
        writeSession(sessionUser);
        setCurrentUser(sessionUser);
        return { ok: true };
      },
      async login({ usernameOrEmail, password }) {
        const result = await postAuth('/auth/login', { usernameOrEmail, password });
        if (!result.ok) {
          return { ok: false, message: result.message || 'Login failed.' };
        }
        const sessionUser = result.user;
        writeSession(sessionUser);
        setCurrentUser(sessionUser);
        return { ok: true };
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
