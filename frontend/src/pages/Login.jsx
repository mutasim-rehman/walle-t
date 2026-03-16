import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, Building, ShieldCheck } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (username === 'admin' && password === 'password') {
      navigate('/dashboard');
    } else {
      setError(true);
      setTimeout(() => setError(false), 500);
    }
  };

  return (
    <div className="full-center" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Background Decor */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '30vh', background: 'linear-gradient(135deg, var(--brand-primary), #1e3a8a)', zIndex: 0 }} />
      
      <div className={`finance-card animate-fade-in ${error ? 'animate-shake' : ''}`} style={{ width: '100%', maxWidth: '440px', padding: '48px 40px', zIndex: 10, position: 'relative', marginTop: '10vh' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #bfdbfe' }}>
            <Building size={32} color="var(--brand-primary)" />
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '8px' }}>Walle-T Terminal</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Secure Financial Simulation Engine</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label className="input-label">Operator ID</label>
            <div style={{ position: 'relative' }}>
              <User size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="input-field"
                style={{ paddingLeft: '44px', borderColor: error ? 'var(--status-negative)' : '' }}
                placeholder="Enter operator ID (admin)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Security Key</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="password"
                className="input-field"
                style={{ paddingLeft: '44px', borderColor: error ? 'var(--status-negative)' : '' }}
                placeholder="Enter security key (password)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div style={{ background: 'var(--status-negative-bg)', padding: '10px 14px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
               <ShieldCheck size={16} color="var(--status-negative)" />
               <p style={{ color: 'var(--status-negative)', fontSize: '0.85rem', fontWeight: 500 }}>Authentication failed. Verify credentials.</p>
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: error ? '0' : '8px', padding: '14px' }}>
            Authenticate <ArrowRight size={18} />
          </button>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={12} /> Encrypted Connection
            </p>
          </div>
        </form>

      </div>
    </div>
  );
};

export default Login;
