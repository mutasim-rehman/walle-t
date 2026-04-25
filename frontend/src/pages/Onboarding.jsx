import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

function toNum(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [age, setAge] = useState('');
  const [country, setCountry] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [monthlyExpenses, setMonthlyExpenses] = useState('');
  const [currentCash, setCurrentCash] = useState('');

  const [landValue, setLandValue] = useState('');
  const [apartmentValue, setApartmentValue] = useState('');
  const [vehicleValue, setVehicleValue] = useState('');
  const [otherAssetsValue, setOtherAssetsValue] = useState('');
  const [loanBalance, setLoanBalance] = useState('');
  const [creditBalance, setCreditBalance] = useState('');
  const [otherLiabilitiesValue, setOtherLiabilitiesValue] = useState('');
  const [medicalInsurance, setMedicalInsurance] = useState('no');

  const [holdings, setHoldings] = useState([{ symbol: '', qty: '' }]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const canSubmit = useMemo(() => {
    return Boolean(
      currentUser?.id &&
      toNum(age) != null &&
      String(country).trim() &&
      toNum(monthlyIncome) != null &&
      toNum(monthlyExpenses) != null &&
      toNum(currentCash) != null
    );
  }, [age, country, currentCash, currentUser?.id, monthlyExpenses, monthlyIncome]);

  const addHolding = () => setHoldings((prev) => [...prev, { symbol: '', qty: '' }]);
  const removeHolding = (idx) =>
    setHoldings((prev) => prev.filter((_h, i) => i !== idx).length ? prev.filter((_h, i) => i !== idx) : [{ symbol: '', qty: '' }]);

  const updateHolding = (idx, patch) =>
    setHoldings((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) {
      setIsError(true);
      setMessage('Please fill all required fields.');
      return;
    }

    setLoading(true);
    setIsError(false);
    setMessage('');

    const initialHoldings = holdings
      .map((h) => ({
        symbol: String(h.symbol || '').trim().toUpperCase(),
        qty: toNum(h.qty),
      }))
      .filter((h) => h.symbol && h.qty != null && h.qty > 0);

    try {
      const res = await fetch(`${API_BASE}/onboarding/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          profile: {
            age: toNum(age),
            country: String(country).trim(),
            monthlyIncome: toNum(monthlyIncome),
            monthlyExpenses: toNum(monthlyExpenses),
            currentCash: toNum(currentCash),
            assets: {
              land: toNum(landValue) || 0,
              apartments: toNum(apartmentValue) || 0,
              vehicles: toNum(vehicleValue) || 0,
              other: toNum(otherAssetsValue) || 0,
              total:
                (toNum(landValue) || 0) +
                (toNum(apartmentValue) || 0) +
                (toNum(vehicleValue) || 0) +
                (toNum(otherAssetsValue) || 0),
            },
            liabilities: {
              loans: toNum(loanBalance) || 0,
              credit: toNum(creditBalance) || 0,
              other: toNum(otherLiabilitiesValue) || 0,
              total: (toNum(loanBalance) || 0) + (toNum(creditBalance) || 0) + (toNum(otherLiabilitiesValue) || 0),
            },
            extras: {
              medicalInsurance: medicalInsurance === 'yes',
            },
          },
          initialHoldings,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setIsError(true);
        setMessage(data?.message || 'Onboarding failed.');
        return;
      }
      setIsError(false);
      setMessage('Onboarding completed. Your $10,000 simulated investment balance is now available.');
      setTimeout(() => navigate('/dashboard'), 600);
    } catch {
      setIsError(true);
      setMessage('Could not reach the onboarding service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="full-center" style={{ minHeight: '100vh', background: 'var(--bg-main)', padding: 24 }}>
      <div className="finance-card" style={{ width: '100%', maxWidth: 820, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ background: 'var(--brand-primary)', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building size={18} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0 }}>First-time Setup</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Add your baseline details so we can compute wealth and run forecasts.
            </p>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Age (required)</label>
              <input className="input-field" type="number" min="0" value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Country (required)</label>
              <input className="input-field" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Pakistan" />
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Monthly income (required)</label>
              <input className="input-field" type="number" min="0" step="0.01" value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value)} />
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Monthly expenses (required)</label>
              <input className="input-field" type="number" min="0" step="0.01" value={monthlyExpenses} onChange={(e) => setMonthlyExpenses(e.target.value)} />
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Current cash (required)</label>
              <input className="input-field" type="number" step="0.01" value={currentCash} onChange={(e) => setCurrentCash(e.target.value)} />
              <p style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                This is your real-world cash (not the simulated investment balance).
              </p>
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Simulated investment balance</label>
              <div className="input-field" style={{ background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="var(--status-positive)" />
                <span style={{ fontWeight: 700 }}>$10,000 USD</span>
                <span style={{ color: 'var(--text-muted)' }}>(auto-deposited)</span>
              </div>
            </div>
          </div>

          <div className="finance-card" style={{ padding: 16, background: 'var(--bg-alt)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.05rem' }}>Assets (optional but recommended)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Land value</label>
                <input className="input-field" type="number" step="0.01" value={landValue} onChange={(e) => setLandValue(e.target.value)} />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Apartments / property value</label>
                <input className="input-field" type="number" step="0.01" value={apartmentValue} onChange={(e) => setApartmentValue(e.target.value)} />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Vehicles value</label>
                <input className="input-field" type="number" step="0.01" value={vehicleValue} onChange={(e) => setVehicleValue(e.target.value)} />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Other assets</label>
                <input className="input-field" type="number" step="0.01" value={otherAssetsValue} onChange={(e) => setOtherAssetsValue(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="finance-card" style={{ padding: 16, background: 'var(--bg-alt)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.05rem' }}>Liabilities (optional but recommended)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Loans balance</label>
                <input className="input-field" type="number" step="0.01" value={loanBalance} onChange={(e) => setLoanBalance(e.target.value)} />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Credit balance</label>
                <input className="input-field" type="number" step="0.01" value={creditBalance} onChange={(e) => setCreditBalance(e.target.value)} />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Other liabilities</label>
                <input className="input-field" type="number" step="0.01" value={otherLiabilitiesValue} onChange={(e) => setOtherLiabilitiesValue(e.target.value)} />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Medical insurance</label>
                <select className="input-field" value={medicalInsurance} onChange={(e) => setMedicalInsurance(e.target.value)}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
          </div>

          <div className="finance-card" style={{ padding: 16, background: 'var(--bg-alt)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Optional: import current portfolio holdings</h3>
                <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)' }}>
                  These holdings will be added to your portfolio without changing your simulated cash.
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={addHolding}>
                <Plus size={16} /> Add holding
              </button>
            </div>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {holdings.map((h, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">Symbol</label>
                    <input
                      className="input-field"
                      value={h.symbol}
                      onChange={(e) => updateHolding(idx, { symbol: e.target.value })}
                      placeholder="e.g. ABOT"
                    />
                  </div>
                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">Qty</label>
                    <input
                      className="input-field"
                      type="number"
                      min="0"
                      step="1"
                      value={h.qty}
                      onChange={(e) => updateHolding(idx, { qty: e.target.value })}
                    />
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => removeHolding(idx)} style={{ padding: '10px 12px' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {message && (
            <p style={{ margin: 0, color: isError ? 'var(--status-negative)' : 'var(--status-positive)', fontWeight: 700 }}>
              {message}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/dashboard')}>
              Skip for now
            </button>
            <button type="submit" className="btn-primary" disabled={loading || !canSubmit}>
              {loading ? 'Saving...' : 'Complete setup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

