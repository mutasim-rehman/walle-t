import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import SimpleLineChart from '../components/SimpleLineChart';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../lib/api';

const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'];

export default function ForexMarketPage() {
  const { currentUser } = useAuth();
  const [pair, setPair] = useState('EURUSD');
  const [series, setSeries] = useState([]);
  const [side, setSide] = useState('BUY');
  const [units, setUnits] = useState('1000');
  const [source, setSource] = useState('');
  const [isFallback, setIsFallback] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await apiGet(`/market/forex/${pair}`);
        if (mounted) {
          setSeries(data.series || []);
          setSource(data.source || '');
          setIsFallback(Boolean(data.providerFallback));
        }
      } catch {
        if (mounted) {
          setSeries([]);
          setSource('');
          setIsFallback(false);
        }
      }
    }
    load();
    const timer = setInterval(load, 10000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [pair]);

  async function trade(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const data = await apiPost('/trade/forex', {
        userId: currentUser.id,
        pair,
        side,
        units: Number(units),
      });
      setMsg(`Executed ${data.trade.side} ${data.trade.units} ${data.trade.pair} @ ${Number(data.trade.price).toFixed(5)} (${data.trade.source || 'quote'})`);
    } catch (error) {
      setErr(error.message);
    }
  }

  return (
    <AppShell title="Forex Market" subtitle="Live provider feed with fallback when provider is unavailable.">
      <div className="finance-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PAIRS.map((p) => (
            <button key={p} className="btn-secondary" onClick={() => setPair(p)}>{p}</button>
          ))}
        </div>
      </div>
      <div className="finance-card" style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginBottom: 8 }}>{pair} Live Chart</h3>
        {source ? (
          <p style={{ color: isFallback ? 'var(--status-negative)' : 'var(--status-positive)', marginBottom: 8, fontSize: '0.85rem' }}>
            Source: {source}{isFallback ? ' (fallback mode)' : ''}
          </p>
        ) : null}
        <SimpleLineChart series={series} color="#0ea5e9" />
      </div>
      <div className="finance-card" style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Trade Forex</h3>
        <form onSubmit={trade} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
          <select className="input-field" value={side} onChange={(e) => setSide(e.target.value)} style={{ marginBottom: 0 }}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
          <input className="input-field" value={pair} onChange={(e) => setPair(e.target.value.toUpperCase())} style={{ marginBottom: 0 }} />
          <input className="input-field" type="number" value={units} onChange={(e) => setUnits(e.target.value)} style={{ marginBottom: 0 }} />
          <button className="btn-primary" type="submit">Execute</button>
        </form>
        {err ? <p style={{ marginTop: 8, color: 'var(--status-negative)' }}>{err}</p> : null}
        {msg ? <p style={{ marginTop: 8, color: 'var(--status-positive)' }}>{msg}</p> : null}
      </div>
    </AppShell>
  );
}

