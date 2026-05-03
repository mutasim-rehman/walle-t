import React from 'react';

/**
 * Full-viewport loader: aurora mesh, drifting grid, dual orbit sparks.
 * Pure CSS — no heavy WebGL (keeps initial bundle lean).
 *
 * @param {'splash'|'compact'} variant
 * @param {string} [primary] — Bold line inside the glass card (optional).
 * @param {string} [detail] — Muted subtitle (defaults by variant).
 */
export default function TerminalLoaderBackdrop({
  variant = 'compact',
  primary,
  detail,
}) {
  const isSplash = variant === 'splash';
  const sub =
    detail || (isSplash ? 'Initializing market terminal…' : 'Syncing workspace…');
  const label = [primary, sub].filter(Boolean).join('. ') || 'Loading';

  return (
    <div
      className="wt-tl-root full-center"
      role="status"
      aria-busy="true"
      aria-label={label}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        minHeight: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: '#020617',
      }}
    >
      <div className="wt-tl-noise" aria-hidden />
      <div className="wt-tl-aurora wt-tl-aurora-a" aria-hidden />
      <div className="wt-tl-aurora wt-tl-aurora-b" aria-hidden />
      <div className="wt-tl-grid" aria-hidden />
      <div className="wt-tl-rings" aria-hidden>
        <span className="wt-tl-ring" />
        <span className="wt-tl-ring wt-tl-ring-delayed" />
        <span className="wt-tl-core" />
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isSplash ? 18 : 14,
          textAlign: 'center',
          padding: '0 28px',
        }}
      >
        <div
          className="wt-tl-wordmark"
          style={{
            fontSize: isSplash ? 'clamp(2.2rem, 6vw, 3.35rem)' : 'clamp(1.35rem, 4vw, 1.75rem)',
            fontWeight: 800,
            letterSpacing: isSplash ? '-0.04em' : '-0.03em',
            background: 'linear-gradient(115deg, #e0f2fe 12%, #38bdf8 38%, #6366f1 72%, #a5b4fc 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Walle-T
        </div>

        <div
          className="wt-tl-scanline-card"
          style={{
            padding: isSplash ? '18px 32px 20px' : '14px 22px 16px',
            borderRadius: 14,
            border: '1px solid rgba(148,163,184,0.22)',
            background: 'linear-gradient(145deg, rgba(15,23,42,0.72), rgba(2,6,23,0.55))',
            backdropFilter: 'blur(14px)',
            boxShadow:
              '0 0 0 1px rgba(56,189,248,0.08), 0 20px 50px rgba(2,6,23,0.65), inset 0 1px 0 rgba(248,250,252,0.06)',
            maxWidth: 420,
          }}
        >
          {primary ? (
            <p
              style={{
                margin: 0,
                color: '#f1f5f9',
                fontWeight: 600,
                fontSize: isSplash ? '1.02rem' : '0.92rem',
                lineHeight: 1.45,
              }}
            >
              {primary}
            </p>
          ) : null}
          <p
            className={isSplash ? 'wt-tl-shimmer-text' : undefined}
            style={{
              margin: primary ? '8px 0 0 0' : 0,
              color: '#94a3b8',
              fontSize: isSplash ? '0.88rem' : '0.82rem',
              fontWeight: 500,
              letterSpacing: isSplash ? '0.06em' : '0.02em',
              textTransform: isSplash ? 'uppercase' : 'none',
              lineHeight: 1.5,
            }}
          >
            {sub}
          </p>
          <div
            aria-hidden
            style={{
              marginTop: isSplash ? 16 : 12,
              height: 4,
              borderRadius: 999,
              background: 'rgba(51,65,85,0.6)',
              overflow: 'hidden',
            }}
          >
            <div className="wt-tl-bar-fill" />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wtTlPulseA {
          0%, 100% { opacity: 0.45; transform: scale(1) translate(0, 0); }
          50% { opacity: 0.75; transform: scale(1.08) translate(3%, -2%); }
        }
        @keyframes wtTlPulseB {
          0%, 100% { opacity: 0.35; transform: scale(1.05) translate(-2%, 2%); }
          50% { opacity: 0.68; transform: scale(1) translate(2%, -3%); }
        }
        @keyframes wtTlGridShift {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-60px, -40px, 0); }
        }
        @keyframes wtTlRing {
          to { transform: rotate(360deg); }
        }
        @keyframes wtTlBarMove {
          0% { transform: translateX(-115%); opacity: 0.7; }
          40% { opacity: 1; }
          100% { transform: translateX(220%); opacity: 0.7; }
        }
        @keyframes wtTlCoreGlow {
          0%, 100% { box-shadow: 0 0 24px rgba(56,189,248,0.35), inset 0 0 22px rgba(99,102,241,0.25); }
          50% { box-shadow: 0 0 36px rgba(99,102,241,0.45), inset 0 0 28px rgba(56,189,248,0.35); }
        }
        @keyframes wtTlShimmer {
          0% { background-position: -120% center; }
          100% { background-position: 220% center; }
        }

        .wt-tl-noise {
          position: absolute;
          inset: -20%;
          opacity: 0.04;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
        }
        .wt-tl-aurora {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          mix-blend-mode: screen;
        }
        .wt-tl-aurora-a {
          width: 68vmin;
          height: 68vmin;
          top: -22%;
          left: -14%;
          background: radial-gradient(circle, rgba(56,189,248,0.55), transparent 68%);
          animation: wtTlPulseA 7s ease-in-out infinite;
        }
        .wt-tl-aurora-b {
          width: 58vmin;
          height: 58vmin;
          bottom: -18%;
          right: -12%;
          background: radial-gradient(circle, rgba(99,102,241,0.5), transparent 70%);
          animation: wtTlPulseB 8.5s ease-in-out infinite;
        }
        .wt-tl-grid {
          position: absolute;
          inset: -4%;
          opacity: 0.11;
          background-image:
            linear-gradient(rgba(148,163,184,0.45) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.45) 1px, transparent 1px);
          background-size: 48px 48px;
          animation: wtTlGridShift 42s linear infinite;
          pointer-events: none;
        }
        .wt-tl-rings {
          position: absolute;
          top: 50%;
          left: 50%;
          width: clamp(260px, 56vmin, 420px);
          height: clamp(260px, 56vmin, 420px);
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .wt-tl-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid rgba(56,189,248,0.18);
          border-top-color: rgba(125,211,252,0.55);
          border-right-color: rgba(129,140,248,0.35);
          animation: wtTlRing 14s linear infinite;
        }
        .wt-tl-ring-delayed {
          inset: 12%;
          border-top-color: rgba(165,180,252,0.45);
          animation-duration: 19s;
          animation-direction: reverse;
          opacity: 0.75;
        }
        .wt-tl-core {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 8px;
          height: 8px;
          margin: -4px 0 0 -4px;
          border-radius: 50%;
          background: radial-gradient(circle, #bae6fd 0%, #6366f1 100%);
          animation: wtTlCoreGlow 2.8s ease-in-out infinite;
        }
        .wt-tl-bar-fill {
          height: 100%;
          width: 42%;
          border-radius: 999;
          background: linear-gradient(90deg, #1d4ed8, #38bdf8, #818cf8);
          animation: wtTlBarMove 1.85s ease-in-out infinite;
        }
        .wt-tl-shimmer-text {
          background: linear-gradient(
            90deg,
            #64748b 0%,
            #e2e8f0 40%,
            #64748b 80%
          );
          background-size: 220% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: wtTlShimmer 2.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
