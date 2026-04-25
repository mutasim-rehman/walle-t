import React from 'react';

export default function SimpleLineChart({ series = [], height = 260, color = '#2563eb', secondarySeries = null, secondaryColor = '#f97316' }) {
  if (!Array.isArray(series) || series.length < 2) {
    return <p style={{ color: 'var(--text-muted)' }}>No chart data available.</p>;
  }

  const width = 900;
  const left = 42;
  const right = 18;
  const top = 12;
  const bottom = 28;

  const all = secondarySeries?.length ? [...series, ...secondarySeries] : [...series];
  const values = all.map((p) => Number(p.value)).filter((v) => Number.isFinite(v));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);

  const toPath = (points) => {
    const chartW = width - left - right;
    const chartH = height - top - bottom;
    const n = Math.max(1, points.length - 1);
    return points
      .map((p, i) => {
        const x = left + (i / n) * chartW;
        const y = top + ((max - Number(p.value)) / span) * chartH;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  };

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: '#fff' }}>
        <path d={toPath(series)} fill="none" stroke={color} strokeWidth="2.5" />
        {secondarySeries?.length ? (
          <path d={toPath(secondarySeries)} fill="none" stroke={secondaryColor} strokeWidth="2.5" strokeDasharray="6 4" />
        ) : null}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <span>Min: {min.toFixed(4)}</span>
        <span>Max: {max.toFixed(4)}</span>
      </div>
    </div>
  );
}

