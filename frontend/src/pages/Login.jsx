import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, Building, ShieldCheck, Mail, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

function toNum(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validateSignupPassword(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Password must be at least 8 characters.';
  if (!/\d/.test(p)) return 'Password must include at least one number.';
  if (!/[^A-Za-z0-9]/.test(p)) return 'Password must include at least one symbol.';
  return null;
}

const Login = () => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [age, setAge] = useState('');
  const [country, setCountry] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [monthlyExpenses, setMonthlyExpenses] = useState('');
  const [currentCash, setCurrentCash] = useState('');
  const [landValue, setLandValue] = useState('');
  const [apartmentsValue, setApartmentsValue] = useState('');
  const [loanBalance, setLoanBalance] = useState('');
  const [medicalInsurance, setMedicalInsurance] = useState('no');
  const [holdings, setHoldings] = useState([{ symbol: '', qty: '' }]);
  const navigate = useNavigate();
  const { login, signupComplete, isAuthenticated, authReady } = useAuth();

  useEffect(() => {
    if (authReady && isAuthenticated) navigate('/dashboard');
  }, [authReady, isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
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
      const pwErr = validateSignupPassword(password);
      if (pwErr) {
        setIsError(true);
        setMessage(pwErr);
        return;
      }
      if (password !== confirmPassword) {
        setIsError(true);
        setMessage('Passwords do not match.');
        return;
      }
      if (toNum(age) == null || !country.trim() || toNum(monthlyIncome) == null || toNum(monthlyExpenses) == null || toNum(currentCash) == null) {
        setIsError(true);
        setMessage('For signup, fill required profile fields (age, country, income, expenses, current cash).');
        return;
      }
      const initialHoldings = holdings
        .map((h) => ({ symbol: String(h.symbol || '').trim().toUpperCase(), qty: toNum(h.qty) }))
        .filter((h) => h.symbol && h.qty != null && h.qty > 0);

      setBusy(true);
      const result = await signupComplete({
        email,
        username,
        password,
        profile: {
          age: toNum(age),
          country: country.trim(),
          monthlyIncome: toNum(monthlyIncome),
          monthlyExpenses: toNum(monthlyExpenses),
          currentCash: toNum(currentCash),
          assets: {
            land: toNum(landValue) || 0,
            apartments: toNum(apartmentsValue) || 0,
            total: (toNum(landValue) || 0) + (toNum(apartmentsValue) || 0),
          },
          liabilities: {
            loans: toNum(loanBalance) || 0,
            total: toNum(loanBalance) || 0,
          },
          extras: {
            medicalInsurance: medicalInsurance === 'yes',
          },
        },
        initialHoldings,
      });
      setBusy(false);
      if (!result.ok) {
        setIsError(true);
        setMessage(result.message);
        return;
      }
      navigate('/dashboard');
    } else {
      setBusy(true);
      const result = await login({ usernameOrEmail: username, password });
      setBusy(false);
      if (!result.ok) {
        setIsError(true);
        setMessage(result.message);
        return;
      }
      navigate('/dashboard');
    }
  };

  return (
    <div className="full-center" style={{ position: 'relative', padding: '40px 0', background: 'radial-gradient(circle at top right, #1e3a5f 0%, #0f172a 48%, #020617 92%)' }}>
      {/* Background Decor */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '34vh', background: 'linear-gradient(135deg, #2563eb, #020617)', zIndex: 0 }} />
      
      <div className={`finance-card animate-fade-in ${isError ? 'animate-shake' : ''}`} style={{ width: '100%', maxWidth: mode === 'signup' ? '620px' : '460px', padding: '48px 40px', zIndex: 10, position: 'relative', borderRadius: 14 }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ background: 'rgba(59,130,246,0.12)', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
            <Building size={32} color="var(--brand-primary)" />
          </div>
          <h2 style={{ fontSize: '1.9rem', marginBottom: '8px' }}>Walle-T Terminal</h2>
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

          {mode === 'signup' && (
            <>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12, marginBottom: 14, background: 'var(--bg-alt)' }}>
                <p style={{ margin: '0 0 10px 0', fontWeight: 700 }}>Signup + Onboarding (single step)</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <input className="input-field" style={{ marginBottom: 0 }} type="number" placeholder="Age *" value={age} onChange={(e) => setAge(e.target.value)} />
                  <input className="input-field" style={{ marginBottom: 0 }} placeholder="Country *" value={country} onChange={(e) => setCountry(e.target.value)} />
                  <input className="input-field" style={{ marginBottom: 0 }} type="number" step="0.01" placeholder="Monthly income *" value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value)} />
                  <input className="input-field" style={{ marginBottom: 0 }} type="number" step="0.01" placeholder="Monthly expenses *" value={monthlyExpenses} onChange={(e) => setMonthlyExpenses(e.target.value)} />
                  <input className="input-field" style={{ marginBottom: 0 }} type="number" step="0.01" placeholder="Current cash *" value={currentCash} onChange={(e) => setCurrentCash(e.target.value)} />
                  <div className="input-field" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', fontWeight: 700 }}>$10,000 simulated balance (auto)</div>
                  <input className="input-field" style={{ marginBottom: 0 }} type="number" step="0.01" placeholder="Land value (optional)" value={landValue} onChange={(e) => setLandValue(e.target.value)} />
                  <input className="input-field" style={{ marginBottom: 0 }} type="number" step="0.01" placeholder="Apartments value (optional)" value={apartmentsValue} onChange={(e) => setApartmentsValue(e.target.value)} />
                  <input className="input-field" style={{ marginBottom: 0 }} type="number" step="0.01" placeholder="Loans balance (optional)" value={loanBalance} onChange={(e) => setLoanBalance(e.target.value)} />
                  <select className="input-field" style={{ marginBottom: 0 }} value={medicalInsurance} onChange={(e) => setMedicalInsurance(e.target.value)}>
                    <option value="no">Medical insurance: No</option>
                    <option value="yes">Medical insurance: Yes</option>
                  </select>
                </div>
                <div style={{ marginTop: 10 }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Optional initial holdings:</p>
                  {holdings.map((h, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                      <input className="input-field" style={{ marginBottom: 0 }} placeholder="Symbol (e.g. ABOT)" value={h.symbol} onChange={(e) => setHoldings((prev) => prev.map((x, i) => (i === idx ? { ...x, symbol: e.target.value } : x)))} />
                      <input className="input-field" style={{ marginBottom: 0 }} type="number" placeholder="Qty" value={h.qty} onChange={(e) => setHoldings((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                      <button type="button" className="btn-secondary" onClick={() => setHoldings((prev) => (prev.filter((_x, i) => i !== idx).length ? prev.filter((_x, i) => i !== idx) : [{ symbol: '', qty: '' }]))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn-secondary" onClick={() => setHoldings((prev) => [...prev, { symbol: '', qty: '' }])}>
                    <Plus size={14} /> Add holding
                  </button>
                </div>
              </div>
            </>
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
                type={showPassword ? 'text' : 'password'}
                className="input-field"
                style={{ paddingLeft: '44px', paddingRight: '44px', borderColor: isError ? 'var(--status-negative)' : '' }}
                placeholder={mode === 'signup' ? 'Min 8 chars, include a number and symbol' : 'Enter password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} color="var(--text-muted)" /> : <Eye size={18} color="var(--text-muted)" />}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div className="input-group">
              <label className="input-label">Confirm password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  style={{ paddingLeft: '44px', paddingRight: '12px', borderColor: isError ? 'var(--status-negative)' : '' }}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          )}

          {message && (
            <div style={{ background: 'var(--status-negative-bg)', padding: '10px 14px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
               <ShieldCheck size={16} color={isError ? 'var(--status-negative)' : 'var(--status-positive)'} />
               <p style={{ color: isError ? 'var(--status-negative)' : 'var(--status-positive)', fontSize: '0.85rem', fontWeight: 500 }}>{message}</p>
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={busy} style={{ width: '100%', marginTop: message ? '0' : '8px', padding: '14px', fontWeight: 700 }}>
            {busy ? 'Working...' : (mode === 'signup' ? 'Create Account' : 'Authenticate')} <ArrowRight size={18} />
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
              setConfirmPassword('');
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
