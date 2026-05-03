import React from 'react';

export default function RouteFallback() {
  return (
    <div
      className="full-center"
      role="status"
      aria-label="Loading"
      style={{ background: 'var(--bg-main)', minHeight: '100vh', width: '100vw' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div className="route-fallback-ring" />
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem', letterSpacing: 0.5 }}>
          Loading Walle-T...
        </p>
      </div>
      <style>{`
        .route-fallback-ring {
          width: 36px;
          height: 36px;
          border: 3px solid #e2e8f0;
          border-top-color: var(--brand-primary);
          border-radius: 50%;
          animation: routeFallbackSpin 0.9s linear infinite;
        }
        @keyframes routeFallbackSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
