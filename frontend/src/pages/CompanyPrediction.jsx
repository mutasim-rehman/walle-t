import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchPsxTimeseriesRows } from '../lib/psxClient';

const RANGE_OPTIONS = ['1D', '1M', '6M', 'YTD', '1Y', '3Y', '5Y'];

function filterByRange(points, range) {
  if (!points.length) return [];
  if (range === '1D') return points.slice(-Math.min(120, points.length));

  const to = new Date(points[points.length - 1].time);
  const from = new Date(to);
  if (range === '1M') from.setMonth(from.getMonth() - 1);
  else if (range === '6M') from.setMonth(from.getMonth() - 6);
  else if (range === 'YTD') from.setMonth(0, 1);
  else if (range === '1Y') from.setFullYear(from.getFullYear() - 1);
  else if (range === '3Y') from.setFullYear(from.getFullYear() - 3);
  else if (range === '5Y') from.setFullYear(from.getFullYear() - 5);

  return points.filter((p) => p.time >= from && p.time <= to);
}

function toPath(points, width, height, min, max, leftPad = 50, rightPad = 16, topPad = 12, bottomPad = 36) {
  const chartW = width - leftPad - rightPad;
  const chartH = height - topPad - bottomPad;
  const span = Math.max(1, points.length - 1);
  const ySpan = Math.max(1e-9, max - min);

  return points
    .map((p, i) => {
      const x = leftPad + (i / span) * chartW;
      const y = topPad + ((max - p.value) / ySpan) * chartH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function buildPrediction(points, modelProbUp, horizon = 8) {
  if (!points.length || modelProbUp == null) return { curve: [], probUp: null };
  const probUp = Math.max(0, Math.min(1, Number(modelProbUp)));
  const drift = (probUp - 0.5) * 0.012;
  const start = points[points.length - 1];
  const curve = [];
  let prev = start.value;
  for (let i = 1; i <= horizon; i += 1) {
    const t = new Date(start.time);
    t.setDate(t.getDate() + i);
    prev = prev * (1 + drift);
    curve.push({ time: t, value: prev });
  }
  return { curve, probUp };
}

export default function CompanyPrediction() {
  const { symbol: symbolParam } = useParams();
  const navigate = useNavigate();
  const [symbolInput, setSymbolInput] = useState((symbolParam || 'ABOT').toUpperCase());
  const [symbol, setSymbol] = useState((symbolParam || 'ABOT').toUpperCase());
  const [range, setRange] = useState('1Y');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [series, setSeries] = useState([]);
  const [modelProbUp, setModelProbUp] = useState(null);
  const [modelMeta, setModelMeta] = useState(null);

  useEffect(() => {
    setSymbol((symbolParam || 'ABOT').toUpperCase());
    setSymbolInput((symbolParam || 'ABOT').toUpperCase());
  }, [symbolParam]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const type = range === '1D' ? 'int' : 'eod';
        const [rows, modelRes] = await Promise.all([
          fetchPsxTimeseriesRows(type, symbol),
          fetch(`/api/model-prediction/${encodeURIComponent(symbol)}`),
        ]);
        const points = rows
          .map((d) => ({
            time: new Date(Number(d[0]) * 1000),
            value: Number(d[1]),
          }))
          .filter((p) => Number.isFinite(p.value))
          .sort((a, b) => a.time - b.time);
        if (!modelRes.ok) {
          const modelErr = await modelRes.json().catch(() => ({}));
          throw new Error(modelErr?.message || `Model prediction request failed (${modelRes.status})`);
        }
        const modelPayload = await modelRes.json();
        const probUp = Number(modelPayload?.prediction?.prob_up);

        if (!Number.isFinite(probUp)) {
          throw new Error('Model prediction payload is missing a valid probability.');
        }

        if (!ignore) {
          setSeries(points);
          setModelProbUp(probUp);
          setModelMeta({
            model: modelPayload?.model || 'unknown',
            generatedAt: modelPayload?.generatedAt || null,
          });
        }
      } catch (e) {
        if (!ignore) {
          setSeries([]);
          setModelProbUp(null);
          setModelMeta(null);
          setError(e.message || 'Failed to load company data');
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [symbol, range]);

  const visible = useMemo(() => filterByRange(series, range), [series, range]);
  const prediction = useMemo(() => buildPrediction(visible, modelProbUp), [visible, modelProbUp]);

  const chartData = useMemo(() => {
    if (!visible.length) return { actualPath: '', predPath: '', min: 0, max: 1 };
    const combined = [...visible, ...prediction.curve];
    const vals = combined.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return {
      actualPath: toPath(visible, 920, 420, min, max),
      predPath: prediction.curve.length
        ? toPath([visible[visible.length - 1], ...prediction.curve], 920, 420, min, max)
        : '',
      min,
      max,
      last: visible[visible.length - 1]?.value ?? null,
      predicted: prediction.curve[prediction.curve.length - 1]?.value ?? null,
      probUp: prediction.probUp,
    };
  }, [visible, prediction]);

  const goToSymbol = (e) => {
    e.preventDefault();
    const next = symbolInput.trim().toUpperCase();
    if (!next) return;
    navigate(`/company/${encodeURIComponent(next)}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', padding: '24px' }}>
      <div className="finance-card" style={{ maxWidth: 980, margin: '0 auto', padding: 24 }}>
        <form onSubmit={goToSymbol} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <input
            className="input-field"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="Enter PSX symbol (e.g. ABOT)"
            style={{ marginBottom: 0, flex: 1 }}
          />
          <button type="submit" className="btn-primary">Load Company</button>
          <a className="btn-secondary" href={`https://dps.psx.com.pk/company/${symbol}`} target="_blank" rel="noreferrer">
            Open PSX
          </a>
        </form>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              className="btn-secondary"
              onClick={() => setRange(r)}
              style={{ background: r === range ? 'rgba(59,130,246,0.2)' : 'var(--bg-alt)', fontWeight: r === range ? 700 : 500 }}
            >
              {r}
            </button>
          ))}
        </div>

        {loading && <p>Loading chart data for `{symbol}`...</p>}
        {error && <p style={{ color: 'var(--status-negative)' }}>{error}</p>}

        {!loading && !error && visible.length > 0 && (
          <>
            <svg viewBox="0 0 920 420" width="100%" height="420" style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: '#0f172a' }}>
              <path d={chartData.actualPath} fill="none" stroke="#2563eb" strokeWidth="2.5" />
              {chartData.predPath && (
                <path d={chartData.predPath} fill="none" stroke="#f97316" strokeWidth="2.5" strokeDasharray="6 4" />
              )}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, color: 'var(--text-muted)' }}>
              <span>Blue: market price</span>
              <span>Orange dashed: model prediction</span>
            </div>
            {modelMeta?.model && (
              <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                Prediction source: <strong>{modelMeta.model}</strong>
                {modelMeta.generatedAt ? ` · generated ${new Date(modelMeta.generatedAt).toLocaleString()}` : ''}
              </div>
            )}
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div className="finance-card" style={{ padding: 12 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Last Price</div>
                <div style={{ fontWeight: 700 }}>{chartData.last?.toFixed(2)}</div>
              </div>
              <div className="finance-card" style={{ padding: 12 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Predicted Price ({prediction.curve.length}d)</div>
                <div style={{ fontWeight: 700, color: '#f97316' }}>{chartData.predicted?.toFixed(2)}</div>
              </div>
              <div className="finance-card" style={{ padding: 12 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Estimated Up Probability</div>
                <div style={{ fontWeight: 700 }}>{chartData.probUp == null ? '-' : `${(chartData.probUp * 100).toFixed(1)}%`}</div>
              </div>
            </div>
          </>
        )}

        {!loading && !error && visible.length === 0 && <p>No data found for `{symbol}`.</p>}
      </div>
    </div>
  );
}
