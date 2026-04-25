import React, { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import SimpleLineChart from '../components/SimpleLineChart';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../lib/api';

const QUICK = ['ABOT', 'ENGRO', 'LUCK', 'HBL', 'OGDC', 'PPL', 'TRG', 'FFC', 'MCB', 'UBL'];

export default function StocksMarketPage() {
  const { currentUser } = useAuth();
  const [symbol, setSymbol] = useState('ABOT');
  const [series, setSeries] = useState([]);
  const [portfolioCash, setPortfolioCash] = useState(null);
  const [side, setSide] = useState('BUY');
  const [qty, setQty] = useState('1');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch(`/psx/timeseries/eod/${encodeURIComponent(symbol)}`);
        const payload = await res.json();
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        const mapped = rows
          .map((r) => ({ time: new Date(Number(r[0]) * 1000).toISOString(), value: Number(r[1]) }))
          .filter((p) => Number.isFinite(p.value));
        if (!ignore) setSeries(mapped.slice(-180));
      } catch {
        if (!ignore) setSeries([]);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [symbol]);

  useEffect(() => {
    async function loadCash() {
      if (!currentUser?.id) return;
      try {
        const data = await apiGet(`/portfolio/${encodeURIComponent(currentUser.id)}`);
        setPortfolioCash(data.cash);
      } catch {
        setPortfolioCash(null);
      }
    }
    loadCash();
  }, [currentUser?.id, msg]);

  const latest = useMemo(() => series[series.length - 1]?.value ?? null, [series]);

  async function placeTrade(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const data = await apiPost('/trade', {
        userId: currentUser.id,
        side,
        symbol,
        qty: Number(qty),
      });
      setMsg(`Executed ${side} ${qty} ${symbol} @ ${Number(data.trade.price).toFixed(2)}`);
    } catch (error) {
      setErr(error.message);
    }
  }

  return (
    <AppShell title="Stock Marketplace" subtitle="Buy/sell equities with live charting.">
      <div className="finance-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {QUICK.map((s) => (
            <button key={s} className="btn-secondary" onClick={() => setSymbol(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }} className="finance-card">
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)' }}>
          <h3>{symbol} Live Chart</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Latest: {latest == null ? '-' : latest.toFixed(2)}</p>
        </div>
        <div style={{ padding: 16 }}>
          <SimpleLineChart series={series} />
        </div>
      </div>

      <div className="finance-card" style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Trade</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 10 }}>Available simulated cash: {portfolioCash == null ? '-' : `$${Number(portfolioCash).toFixed(2)}`}</p>
        <form onSubmit={placeTrade} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
          <select className="input-field" value={side} onChange={(e) => setSide(e.target.value)} style={{ marginBottom: 0 }}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
          <input className="input-field" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} style={{ marginBottom: 0 }} />
          <input className="input-field" type="number" value={qty} min="1" step="1" onChange={(e) => setQty(e.target.value)} style={{ marginBottom: 0 }} />
          <button className="btn-primary" type="submit">Execute</button>
        </form>
        {err ? <p style={{ marginTop: 8, color: 'var(--status-negative)' }}>{err}</p> : null}
        {msg ? <p style={{ marginTop: 8, color: 'var(--status-positive)' }}>{msg}</p> : null}
      </div>
    </AppShell>
  );
}

