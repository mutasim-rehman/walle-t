import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../lib/api';

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState({
    currency: 'USD',
    timezone: 'UTC',
    riskMode: 'moderate',
    notifications: true,
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!currentUser?.id) return;
      try {
        const data = await apiGet(`/settings/${encodeURIComponent(currentUser.id)}`);
        if (mounted) setSettings((prev) => ({ ...prev, ...data.settings }));
      } catch (error) {
        if (mounted) setErr(error.message);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [currentUser?.id]);

  async function save(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await apiPost(`/settings/${encodeURIComponent(currentUser.id)}`, { settings });
      setMsg('Settings saved.');
    } catch (error) {
      setErr(error.message);
    }
  }

  return (
    <AppShell title="Settings" subtitle="Customize your account preferences and risk mode.">
      <form className="finance-card" style={{ padding: 16 }} onSubmit={save}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(200px,1fr))', gap: 10 }}>
          <select className="input-field" value={settings.currency} onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))}>
            <option value="USD">USD</option>
            <option value="PKR">PKR</option>
            <option value="EUR">EUR</option>
          </select>
          <select className="input-field" value={settings.timezone} onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))}>
            <option value="UTC">UTC</option>
            <option value="Asia/Karachi">Asia/Karachi</option>
            <option value="Europe/London">Europe/London</option>
          </select>
          <select className="input-field" value={settings.riskMode} onChange={(e) => setSettings((s) => ({ ...s, riskMode: e.target.value }))}>
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
          <label className="finance-card" style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(settings.notifications)}
              onChange={(e) => setSettings((s) => ({ ...s, notifications: e.target.checked }))}
            />
            Enable notifications
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn-primary" type="submit">Save Settings</button>
        </div>
        {err ? <p style={{ marginTop: 8, color: 'var(--status-negative)' }}>{err}</p> : null}
        {msg ? <p style={{ marginTop: 8, color: 'var(--status-positive)' }}>{msg}</p> : null}
      </form>
    </AppShell>
  );
}

