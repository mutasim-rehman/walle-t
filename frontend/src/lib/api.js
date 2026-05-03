const backendLink = (import.meta.env.VITE_BACKEND_LINK || '').trim();
const normalizedBackend = backendLink ? backendLink.replace(/\/+$/, '') : '';

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (normalizedBackend ? `${normalizedBackend}/api` : '/api');

const SESSION_KEY = 'wallet_session_v1';

export class AuthError extends Error {
  constructor(message) {
    super(message || 'Authentication required.');
    this.name = 'AuthError';
  }
}

function readSessionToken() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
}

function clearSessionLocal() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('walle-t:auth-cleared'));
    }
  } catch {
    /* ignore */
  }
}

function buildHeaders(extra) {
  const headers = { ...(extra || {}) };
  const token = readSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function apiFetch(path, options = {}) {
  const headers = { ...buildHeaders(options.headers) };
  if (options.body && !headers['Content-Type'] && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await parseJsonSafe(res);
  if (res.status === 401) {
    clearSessionLocal();
    throw new AuthError(data?.message || 'Session expired. Please log in again.');
  }
  if (!res.ok || (data && data.ok === false)) {
    const message = data?.message || `Request failed (${res.status}).`;
    const details = data?.details ? ` (${data.details})` : '';
    const error = new Error(`${message}${details}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function apiGet(path) {
  return apiFetch(path, { method: 'GET' });
}

export async function apiPost(path, payload) {
  return apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });
}

/** No auth required — used before login from the Forgot password screen. */
export async function requestForgotPassword({ usernameOrEmail }) {
  return apiPost('/auth/forgot-password', { usernameOrEmail });
}
