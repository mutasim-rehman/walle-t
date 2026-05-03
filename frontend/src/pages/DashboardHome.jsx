import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useAuth } from '../auth/AuthContext';
import { apiGet } from '../lib/api';

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardHome() {
  const { currentUser } = useAuth();
  const [portfolio, setPortfolio] = useState(null);
  const [risk, setRisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!currentUser?.id) return;
      setLoading(true);
      setError('');
      try {
        const [p, r] = await Promise.all([
          apiGet(`/portfolio/${encodeURIComponent(currentUser.id)}`),
          apiGet(`/risk/${encodeURIComponent(currentUser.id)}`),
        ]);
        if (mounted) {
          setPortfolio(p);
          setRisk(r.risk);
        }
      } catch (err) {
        if (mounted) setError(err?.message || 'Failed to load dashboard.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [currentUser?.id, reloadKey]);

  return (
    <AppShell title="Dashboard" subtitle="Your trading and wealth command center.">
      {error ? (
        <div
          className="finance-card"
          style={{ padding: 12, marginBottom: 12, borderColor: '#fca5a5', background: '#fef2f2' }}
        >
          <p style={{ margin: 0, color: '#991b1b', fontWeight: 600 }}>{error}</p>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 8 }}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}
      {loading && !error ? (
        <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>Loading dashboard...</p>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px,1fr))', gap: 14 }}>
        <div className="finance-card" style={{ padding: 16 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Simulated Cash</p>
          <h3>{money(portfolio?.cash)}</h3>
        </div>
        <div className="finance-card" style={{ padding: 16 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Open Holdings</p>
          <h3>{portfolio?.holdings?.length ?? '-'}</h3>
        </div>
        <div className="finance-card" style={{ padding: 16 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Risk Score</p>
          <h3>{risk?.score == null ? '-' : `${risk.score}/100`}</h3>
        </div>
        <div className="finance-card" style={{ padding: 16 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Top Concentration</p>
          <h3>{risk?.concentration != null ? `${risk.concentration}%` : '-'}</h3>
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(260px,1fr))', gap: 14 }}>
        <Link to="/market/stocks" className="finance-card" style={{ padding: 18, textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{ marginBottom: 6 }}>Stock Marketplace</h3>
          <p style={{ color: 'var(--text-muted)' }}>Live PSX charts + buy/sell simulation.</p>
        </Link>
        <Link to="/market/forex" className="finance-card" style={{ padding: 18, textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{ marginBottom: 6 }}>Forex Trading</h3>
          <p style={{ color: 'var(--text-muted)' }}>Major pairs with live synthetic feed.</p>
        </Link>
        <Link to="/risk" className="finance-card" style={{ padding: 18, textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{ marginBottom: 6 }}>Risk Analysis</h3>
          <p style={{ color: 'var(--text-muted)' }}>Exposure mix, concentration and shocks.</p>
        </Link>
        <Link to="/advisor" className="finance-card" style={{ padding: 18, textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{ marginBottom: 6 }}>Advisor Chatbot</h3>
          <p style={{ color: 'var(--text-muted)' }}>Ask Gemini for advice based on your portfolio and assets/liabilities.</p>
        </Link>
      </div>
    </AppShell>
  );
}

