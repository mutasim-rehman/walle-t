import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import SimpleLineChart from '../components/SimpleLineChart';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../lib/api';

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RiskPage() {
  const { currentUser } = useAuth();
  const [risk, setRisk] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!currentUser?.id) return;
      setError('');
      try {
        const [r, f] = await Promise.all([
          apiGet(`/risk/${encodeURIComponent(currentUser.id)}`),
          apiPost('/forecast', { userId: currentUser.id }),
        ]);
        if (mounted) {
          setRisk(r.risk);
          setForecast(f.series);
        }
      } catch (err) {
        if (mounted) setError(err.message);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [currentUser?.id]);

  return (
    <AppShell title="Risk Analysis" subtitle="Cross-asset exposure, concentration and stress scenario overview.">
      {error ? <p style={{ color: 'var(--status-negative)' }}>{error}</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(160px,1fr))', gap: 12 }}>
        <div className="finance-card" style={{ padding: 14 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Risk Score</p>
          <h3>{risk?.score ?? '-'}/100</h3>
        </div>
        <div className="finance-card" style={{ padding: 14 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Total Exposure</p>
          <h3>{money(risk?.totalExposure)}</h3>
        </div>
        <div className="finance-card" style={{ padding: 14 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Top Concentration</p>
          <h3>{risk?.concentration != null ? `${risk.concentration}%` : '-'}</h3>
        </div>
        <div className="finance-card" style={{ padding: 14 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Stress (Equity -10%)</p>
          <h3>{money(risk?.shocks?.equityMinus10Pct)}</h3>
        </div>
      </div>

      <div className="finance-card" style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Asset Exposure Mix</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(120px,1fr))', gap: 8 }}>
          {Object.entries(risk?.assetMix || {}).map(([k, v]) => (
            <div key={k} className="finance-card" style={{ padding: 10 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'capitalize' }}>{k}</p>
              <h4>{money(v)}</h4>
            </div>
          ))}
        </div>
      </div>

      <div className="finance-card" style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Net Worth Scenarios</h3>
        <SimpleLineChart series={forecast?.base || []} secondarySeries={forecast?.best || []} />
      </div>
    </AppShell>
  );
}

