import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, Building, ShieldCheck, Mail } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const Login = () => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const navigate = useNavigate();
  const { login, signup, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setIsError(true);
      setMessage('Username/email and password are required.');
      return;
    }
    if (mode === 'signup') {
      if (!email.trim()) {
        setIsError(true);
        setMessage('Email is required.');
        return;
      }
      if (password.length < 6) {
        setIsError(true);
        setMessage('Password must be at least 6 characters.');
        return;
      }
      const result = await signup({ email, username, password });
      if (!result.ok) {
        setIsError(true);
        setMessage(result.message);
        return;
      }
      navigate('/dashboard');
    } else {
      const result = await login({ usernameOrEmail: username, password });
      if (!result.ok) {
        setIsError(true);
        setMessage(result.message);
        return;
      }
      navigate('/dashboard');
    }
  };

  return (
    <div className="full-center" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Background Decor */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '30vh', background: 'linear-gradient(135deg, var(--brand-primary), #1e3a8a)', zIndex: 0 }} />
      
      <div className={`finance-card animate-fade-in ${isError ? 'animate-shake' : ''}`} style={{ width: '100%', maxWidth: '440px', padding: '48px 40px', zIndex: 10, position: 'relative', marginTop: '10vh' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #bfdbfe' }}>
            <Building size={32} color="var(--brand-primary)" />
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '8px' }}>Walle-T Terminal</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            {mode === 'signup' ? 'Create your account' : 'Secure Financial Simulation Engine'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="input-group">
              <label className="input-label">Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="email"
                  className="input-field"
                  style={{ paddingLeft: '44px', borderColor: isError ? 'var(--status-negative)' : '' }}
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">{mode === 'signup' ? 'Username' : 'Username or Email'}</label>
            <div style={{ position: 'relative' }}>
              <User size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="input-field"
                style={{ paddingLeft: '44px', borderColor: isError ? 'var(--status-negative)' : '' }}
                placeholder={mode === 'signup' ? 'Choose a username' : 'Enter username or email'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="password"
                className="input-field"
                style={{ paddingLeft: '44px', borderColor: isError ? 'var(--status-negative)' : '' }}
                placeholder={mode === 'signup' ? 'Create password (min 6 chars)' : 'Enter password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {message && (
            <div style={{ background: 'var(--status-negative-bg)', padding: '10px 14px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
               <ShieldCheck size={16} color={isError ? 'var(--status-negative)' : 'var(--status-positive)'} />
               <p style={{ color: isError ? 'var(--status-negative)' : 'var(--status-positive)', fontSize: '0.85rem', fontWeight: 500 }}>{message}</p>
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: message ? '0' : '8px', padding: '14px' }}>
            {mode === 'signup' ? 'Create Account' : 'Authenticate'} <ArrowRight size={18} />
          </button>

          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%', marginTop: '10px' }}
            onClick={() => {
              setMode((m) => (m === 'login' ? 'signup' : 'login'));
              setIsError(false);
              setMessage('');
              setPassword('');
            }}
          >
            {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
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
