import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrthographicCamera, Box, Edges } from '@react-three/drei';

function seededValue(seed) {
  const x = Math.sin(seed * 999.91) * 10000;
  return x - Math.floor(x);
}

const BlockChart = () => {
  const groupRef = useRef();

  // Create heights for a bar chart
  const bars = useMemo(() => {
    return Array.from({ length: 9 }).map((_, i) => ({
      x: (i - 4) * 1.5,
      targetHeight: 1 + seededValue(i + 1) * 4,
      speed: 1 + seededValue(i + 11) * 2,
      offset: seededValue(i + 21) * Math.PI * 2,
    }));
  }, []);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.children.forEach((mesh, index) => {
        const bar = bars[index];
        // Animate scale Y with a sine wave
        const s = ((Math.sin(time * bar.speed + bar.offset) + 1) / 2) * bar.targetHeight + 0.5;
        mesh.scale.y = s;
        // Adjust position so it scales from the bottom
        mesh.position.y = s / 2 - 2;
      });
      // Slowly rotate the entire group for a dynamic look
      groupRef.current.rotation.y = Math.sin(time * 0.2) * 0.2;
    }
  });

  return (
    <group ref={groupRef} rotation={[0.4, -0.5, 0]}>
      {bars.map((bar, i) => (
        <mesh key={i} position={[bar.x, 0, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#2563eb" roughness={0.1} metalness={0.2} />
          <Edges scale={1.05} color="#1d4ed8" />
        </mesh>
      ))}
    </group>
  );
};

const LoadingScreen = () => {
  return (
    <div className="full-center" style={{ background: 'radial-gradient(circle at 20% 20%, #dbeafe 0%, #eff6ff 35%, #f8fafc 75%)', zIndex: 50, position: 'fixed', top: 0, left: 0 }}>
      {/* 3D Canvas Background */}
      <div style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}>
        <Canvas>
          <OrthographicCamera makeDefault position={[0, 0, 10]} zoom={40} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 10]} intensity={1.5} color="#ffffff" />
          <directionalLight position={[-10, -20, -10]} intensity={0.5} color="#94a3b8" />
          <BlockChart />
        </Canvas>
      </div>
      
      {/* Overlay Content */}
      <div style={{ zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none', background: 'rgba(255,255,255,0.82)', padding: '28px 56px', borderRadius: '16px', border: '1px solid #cbd5e1', backdropFilter: 'blur(12px)', boxShadow: 'var(--shadow-lg)' }}>
        <h1 style={{ fontSize: '2.6rem', marginBottom: '8px', color: '#0f172a', letterSpacing: '-1px' }}>
          Walle-T
        </h1>
        <p style={{ marginBottom: 16, color: '#334155', fontWeight: 600 }}>Market intelligence terminal is booting...</p>
        <div style={{ width: 220, height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
          <div className="loading-progress" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="spinner-rect" />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>
            Compiling Financial Models...
          </p>
        </div>
      </div>

      <style>{`
        .spinner-rect {
          width: 16px;
          height: 16px;
          background-color: var(--brand-primary);
          animation: flip 1.2s infinite ease-in-out;
        }
        .loading-progress {
          width: 50%;
          height: 100%;
          background: linear-gradient(90deg, #2563eb, #38bdf8);
          animation: loadingSweep 1.3s ease-in-out infinite;
        }
        @keyframes flip {
          0% { transform: perspective(120px) rotateX(0deg) rotateY(0deg); }
          50% { transform: perspective(120px) rotateX(-180.1deg) rotateY(0deg); }
          100% { transform: perspective(120px) rotateX(-180deg) rotateY(-179.9deg); }
        }
        @keyframes loadingSweep {
          0% { transform: translateX(-120%); }
          50% { transform: translateX(70%); }
          100% { transform: translateX(220%); }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;
