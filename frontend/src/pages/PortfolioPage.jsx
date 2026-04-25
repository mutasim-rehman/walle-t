import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAuth } from '../auth/AuthContext';
import { apiGet } from '../lib/api';

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PortfolioPage() {
  const { currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    if (!currentUser?.id) return;
    setError('');
    try {
      const res = await apiGet(`/portfolio/${encodeURIComponent(currentUser.id)}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [currentUser?.id]);

  return (
    <AppShell
      title="Portfolio"
      subtitle="All holdings and transaction history across stocks, forex and options."
      actions={<button className="btn-secondary" onClick={load}>Refresh</button>}
    >
      {error ? <p style={{ color: 'var(--status-negative)' }}>{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px,1fr))', gap: 12 }}>
        <div className="finance-card" style={{ padding: 14 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Cash</p>
          <h3>{money(data?.cash)}</h3>
        </div>
        <div className="finance-card" style={{ padding: 14 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Holdings</p>
          <h3>{data?.holdings?.length ?? '-'}</h3>
        </div>
        <div className="finance-card" style={{ padding: 14 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Transactions</p>
          <h3>{data?.transactions?.length ?? '-'}</h3>
        </div>
      </div>

      <div className="finance-card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--border-color)', background: 'var(--bg-alt)' }}>
          <h3>Holdings</h3>
        </div>
        {(data?.holdings?.length || 0) === 0 ? (
          <p style={{ padding: 14, color: 'var(--text-muted)' }}>No holdings yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: 12 }}>Symbol</th>
                <th style={{ textAlign: 'right', padding: 12 }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h) => (
                <tr key={h.symbol} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: 12 }}>{h.symbol}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{Number(h.qty).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="finance-card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--border-color)', background: 'var(--bg-alt)' }}>
          <h3>Recent Transactions</h3>
        </div>
        {(data?.transactions?.length || 0) === 0 ? (
          <p style={{ padding: 14, color: 'var(--text-muted)' }}>No transactions found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: 12 }}>Date</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Type</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Symbol</th>
                <th style={{ textAlign: 'right', padding: 12 }}>Amount</th>
                <th style={{ textAlign: 'right', padding: 12 }}>Cash After</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.slice(0, 50).map((t, idx) => (
                <tr key={`${t.createdAt}-${idx}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: 12 }}>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '-'}</td>
                  <td style={{ padding: 12 }}>{t.type}</td>
                  <td style={{ padding: 12 }}>{t.symbol || '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{t.amount == null ? '-' : money(t.amount)}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{t.cashAfter == null ? '-' : money(t.cashAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}

