import React from 'react';

/**
 * Lightweight CSS loading screen used as the Suspense fallback alternative.
 * The previous WebGL-heavy version was removed pre-deployment to keep the main
 * bundle small. Re-introduce a 3D loader behind a dynamic import only if needed.
 */
export default function LoadingScreen() {
  return (
    <div
      className="full-center"
      role="status"
      aria-label="Loading"
      style={{
        background:
          'radial-gradient(circle at 20% 20%, #dbeafe 0%, #eff6ff 35%, #f8fafc 75%)',
        zIndex: 50,
        position: 'fixed',
        top: 0,
        left: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.82)',
          padding: '28px 56px',
          borderRadius: 16,
          border: '1px solid #cbd5e1',
          backdropFilter: 'blur(12px)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h1 style={{ fontSize: '2.4rem', marginBottom: 8, color: '#0f172a', letterSpacing: -1 }}>
          Walle-T
        </h1>
        <p style={{ marginBottom: 16, color: '#334155', fontWeight: 600 }}>
          Loading market terminal...
        </p>
        <div
          style={{
            width: 220,
            height: 6,
            background: '#e2e8f0',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div className="loading-progress" />
        </div>
      </div>

      <style>{`
        .loading-progress {
          width: 50%;
          height: 100%;
          background: linear-gradient(90deg, #2563eb, #38bdf8);
          animation: loadingSweep 1.3s ease-in-out infinite;
        }
        @keyframes loadingSweep {
          0% { transform: translateX(-120%); }
          50% { transform: translateX(70%); }
          100% { transform: translateX(220%); }
        }
      `}</style>
    </div>
  );
}
