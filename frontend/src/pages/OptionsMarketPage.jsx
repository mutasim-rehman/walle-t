import React, { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import SimpleLineChart from '../components/SimpleLineChart';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

export default function OptionsMarketPage() {
  const { currentUser } = useAuth();
  const [symbol, setSymbol] = useState('ABOT');
  const [chain, setChain] = useState([]);
  const [series, setSeries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [side, setSide] = useState('BUY');
  const [contracts, setContracts] = useState('1');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await apiGet(`/market/options/${encodeURIComponent(symbol)}`);
        if (mounted) {
          setChain(data.chain || []);
          setSeries(data.series || []);
          setSelected((data.chain || [])[0] || null);
        }
      } catch {
        if (mounted) {
          setChain([]);
          setSeries([]);
          setSelected(null);
        }
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [symbol]);

  const premium = useMemo(() => {
    if (!selected) return null;
    return side === 'BUY'
      ? Number((selected.callPremium + selected.putPremium) / 2)
      : Number((selected.callPremium + selected.putPremium) / 2);
  }, [selected, side]);

  async function execute(e) {
    e.preventDefault();
    if (!selected) return;
    setErr('');
    setMsg('');
    try {
      const data = await apiPost('/trade/options', {
        userId: currentUser.id,
        symbol,
        side,
        contractType: 'CALL',
        strike: selected.strike,
        expiry: selected.expiry,
        contracts: Number(contracts),
        premium,
      });
      setMsg(`Executed ${data.trade.side} ${data.trade.contracts} contracts ${symbol} @ premium ${Number(data.trade.premium).toFixed(2)}`);
    } catch (error) {
      setErr(error.message);
    }
  }

  return (
    <AppShell title="Options Market" subtitle="Contract chain and premium simulation.">
      <div className="finance-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input-field" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} style={{ marginBottom: 0, maxWidth: 220 }} />
          <button className="btn-secondary" onClick={() => setSymbol(symbol)}>Load</button>
        </div>
      </div>

      <div className="finance-card" style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginBottom: 8 }}>{symbol} Underlying Trend</h3>
        <SimpleLineChart series={series} color="#8b5cf6" />
      </div>

      <div className="finance-card" style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Option Chain</h3>
        <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: 10 }}>Expiry</th>
                <th style={{ textAlign: 'right', padding: 10 }}>Strike</th>
                <th style={{ textAlign: 'right', padding: 10 }}>Call</th>
                <th style={{ textAlign: 'right', padding: 10 }}>Put</th>
              </tr>
            </thead>
            <tbody>
              {chain.slice(0, 60).map((row, idx) => (
                <tr key={`${row.expiry}-${row.strike}-${idx}`} onClick={() => setSelected(row)} style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', background: selected === row ? '#eff6ff' : '#fff' }}>
                  <td style={{ padding: 10 }}>{row.expiry}</td>
                  <td style={{ padding: 10, textAlign: 'right' }}>{row.strike}</td>
                  <td style={{ padding: 10, textAlign: 'right' }}>{row.callPremium}</td>
                  <td style={{ padding: 10, textAlign: 'right' }}>{row.putPremium}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="finance-card" style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Trade Selected Contract</h3>
        <form onSubmit={execute} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
          <select className="input-field" value={side} onChange={(e) => setSide(e.target.value)} style={{ marginBottom: 0 }}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
          <input className="input-field" value={contracts} type="number" min="1" step="1" onChange={(e) => setContracts(e.target.value)} style={{ marginBottom: 0 }} />
          <input className="input-field" value={premium == null ? '' : premium.toFixed(2)} readOnly style={{ marginBottom: 0 }} />
          <button className="btn-primary" type="submit" disabled={!selected}>Execute</button>
        </form>
        {selected ? <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>Selected: {selected.expiry} strike {selected.strike}</p> : null}
        {err ? <p style={{ marginTop: 8, color: 'var(--status-negative)' }}>{err}</p> : null}
        {msg ? <p style={{ marginTop: 8, color: 'var(--status-positive)' }}>{msg}</p> : null}
      </div>
    </AppShell>
  );
}

