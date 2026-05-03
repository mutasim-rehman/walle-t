import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../lib/api';

const SESSION_KEY = 'wallet_session_v1';

const AuthContext = createContext(null);

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function postAuth(path, payload) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, message: data?.message || 'Request failed.' };
    }
    return { ok: true, user: data.user, sessionToken: data.sessionToken || null };
  } catch (error) {
    return { ok: false, message: 'Cannot reach auth server.', error };
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function clear() {
      writeSession(null);
      setSession(null);
    }

    async function validateSession() {
      const existing = readSession();
      if (!existing?.user?.id || !existing?.token) {
        if (!cancelled) setAuthReady(true);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/auth/session`, {
          headers: { Authorization: `Bearer ${existing.token}` },
        });
        if (cancelled) return;
        if (res.status === 401) {
          clear();
        } else if (res.ok) {
          // keep existing session, optionally refresh user
          try {
            const data = await res.json();
            if (data?.user) {
              const next = { ...existing, user: data.user };
              writeSession(next);
              setSession(next);
            }
          } catch {
            /* ignore parse */
          }
        }
        // any other failure (network/5xx): keep existing session, treat as offline
      } catch {
        // network error: keep session, treat as offline
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }

    function onAuthCleared() {
      clear();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('walle-t:auth-cleared', onAuthCleared);
    }

    validateSession();
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('walle-t:auth-cleared', onAuthCleared);
      }
    };
  }, []);

  const value = useMemo(() => {
    const currentUser = session?.user || null;
    return {
      currentUser,
      authReady,
      isAuthenticated: Boolean(session?.user && session?.token),
      async signup({ email, username, password }) {
        const result = await postAuth('/auth/signup', { email, username, password });
        if (!result.ok || !result.sessionToken) {
          return { ok: false, message: result.message || 'Signup failed.' };
        }
        const next = { user: result.user, token: result.sessionToken };
        writeSession(next);
        setSession(next);
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
        if (!result.ok || !result.sessionToken) {
          return { ok: false, message: result.message || 'Signup failed.' };
        }
        const next = { user: result.user, token: result.sessionToken };
        writeSession(next);
        setSession(next);
        return { ok: true };
      },
      async login({ usernameOrEmail, password }) {
        const result = await postAuth('/auth/login', { usernameOrEmail, password });
        if (!result.ok || !result.sessionToken) {
          return { ok: false, message: result.message || 'Login failed.' };
        }
        const next = { user: result.user, token: result.sessionToken };
        writeSession(next);
        setSession(next);
        return { ok: true };
      },
      logout() {
        writeSession(null);
        setSession(null);
      },
    };
  }, [authReady, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
