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
  const chartW = width - left - right;
  const chartH = height - top - bottom;

  const yTicks = Array.from({ length: 5 }).map((_, i) => {
    const ratio = i / 4;
    const value = max - ratio * span;
    const y = top + ratio * chartH;
    return { value, y };
  });

  const toPath = (points) => {
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
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: '#0f172a' }}>
        {yTicks.map((tick) => (
          <g key={tick.y}>
            <line x1={left} y1={tick.y} x2={width - right} y2={tick.y} stroke="#1e293b" strokeWidth="1" />
            <text x={left - 8} y={tick.y + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {tick.value.toFixed(2)}
            </text>
          </g>
        ))}

        <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="#94a3b8" strokeWidth="1.2" />
        <line x1={left} y1={top} x2={left} y2={height - bottom} stroke="#94a3b8" strokeWidth="1.2" />

        <path d={toPath(series)} fill="none" stroke={color} strokeWidth="2.5" />
        {secondarySeries?.length ? (
          <path d={toPath(secondarySeries)} fill="none" stroke={secondaryColor} strokeWidth="2.5" strokeDasharray="6 4" />
        ) : null}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <span>Min: {min.toFixed(4)} | Max: {max.toFixed(4)}</span>
        <span>Data points: {series.length}</span>
      </div>
    </div>
  );
}

