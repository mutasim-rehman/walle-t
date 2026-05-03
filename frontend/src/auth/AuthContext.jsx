import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../lib/api';

const SESSION_KEY = 'wallet_session_v1';
const API_FALLBACK_BASE = 'http://localhost:4001/api';

function authApiBases() {
  if (API_BASE === API_FALLBACK_BASE) return [API_BASE];
  const localHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (!localHost) return [API_BASE];
  return [API_BASE, API_FALLBACK_BASE];
}

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
  const bases = authApiBases();
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
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function validateSession() {
      const existing = readSession();
      if (!existing?.id) {
        if (!cancelled) setAuthReady(true);
        return;
      }
      const bases = authApiBases();
      let valid = false;
      for (const base of bases) {
        try {
          const res = await fetch(`${base}/auth/session/${encodeURIComponent(existing.id)}`);
          const data = await res.json();
          if (res.ok && data?.ok && data?.valid) {
            valid = true;
            break;
          }
        } catch {
          // try next base
        }
      }
      if (!cancelled) {
        if (!valid) {
          writeSession(null);
          setCurrentUser(null);
        } else {
          setCurrentUser(existing);
        }
        setAuthReady(true);
      }
    }
    validateSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      currentUser,
      authReady,
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
      async signupComplete({ email, username, password, profile, initialHoldings }) {
        const result = await postAuth('/auth/signup-complete', {
          email,
          username,
          password,
          profile,
          initialHoldings,
        });
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
    [authReady, currentUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
