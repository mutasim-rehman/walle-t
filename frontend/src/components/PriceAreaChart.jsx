import React, { useId } from "react";

function fmtPrice(n, decimals) {
  return n == null ? "—" : Number(n).toFixed(decimals);
}

/**
 * Area + line chart for OHLC-style numeric series: [{ time, value }, ...]
 */
export default function PriceAreaChart({ series, height = 300, valueDecimals = 2 }) {
  const gradId = useId().replace(/:/g, "");

  if (!series || series.length < 2) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748b",
          background: "#0f172a",
          borderRadius: 8,
        }}
      >
        <span>Loading chart…</span>
      </div>
    );
  }

  const W = 900,
    padL = 56,
    padR = 16,
    padT = 12,
    padB = 28;
  const chartW = W - padL - padR,
    chartH = height - padT - padB;
  const vals = series.map((p) => Number(p.value)).filter(Number.isFinite);
  const min = Math.min(...vals),
    max = Math.max(...vals),
    span = Math.max(1e-9, max - min);
  const toY = (v) => padT + ((max - v) / span) * chartH;
  const toX = (i) => padL + (i / (series.length - 1)) * chartW;
  const path = series
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${toX(series.length - 1).toFixed(1)},${padT + chartH} L${toX(0).toFixed(1)},${padT + chartH} Z`;
  const first = vals[0],
    last = vals[vals.length - 1];
  const up = last >= first;
  const lineColor = up ? "#10b981" : "#ef4444";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({ v: max - r * span, y: padT + r * chartH }));

  const xLabels = [0, 0.2, 0.4, 0.6, 0.8, 1].map((r) => {
    const i = Math.round(r * (series.length - 1));
    return {
      x: toX(i),
      label: series[i]?.time ? new Date(series[i].time).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
    };
  });

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} style={{ background: "#0f172a", borderRadius: 8, display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#1e293b" strokeWidth="1" />
          <text x={padL - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#475569">
            {fmtPrice(t.v, valueDecimals)}
          </text>
        </g>
      ))}
      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={height - 6} textAnchor="middle" fontSize="10" fill="#475569">
          {l.label}
        </text>
      ))}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={toX(series.length - 1)} cy={toY(last)} r="4" fill={lineColor} />
    </svg>
  );
}
