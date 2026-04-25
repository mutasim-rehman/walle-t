export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    const message = data?.message || 'Request failed.';
    const details = data?.details ? ` (${data.details})` : '';
    throw new Error(`${message}${details}`);
  }
  return data;
}

export async function apiPost(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    const message = data?.message || 'Request failed.';
    const details = data?.details ? ` (${data.details})` : '';
    throw new Error(`${message}${details}`);
  }
  return data;
}

