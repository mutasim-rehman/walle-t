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

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!currentUser?.id) return;
      try {
        const [p, r] = await Promise.all([
          apiGet(`/portfolio/${encodeURIComponent(currentUser.id)}`),
          apiGet(`/risk/${encodeURIComponent(currentUser.id)}`),
        ]);
        if (mounted) {
          setPortfolio(p);
          setRisk(r.risk);
        }
      } catch {
        // Ignore on home.
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [currentUser?.id]);

  return (
    <AppShell title="Dashboard" subtitle="Your trading and wealth command center.">
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
          <h3>{risk?.score ?? '-'}/100</h3>
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
        <Link to="/market/options" className="finance-card" style={{ padding: 18, textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{ marginBottom: 6 }}>Options Trading</h3>
          <p style={{ color: 'var(--text-muted)' }}>Contracts, strikes, expiry, premium simulation.</p>
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

