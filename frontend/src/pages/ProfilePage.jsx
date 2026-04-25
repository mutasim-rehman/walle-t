import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../lib/api';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function ProfilePage() {
  const { currentUser } = useAuth();
  const [form, setForm] = useState({
    age: '',
    country: '',
    monthlyIncome: '',
    monthlyExpenses: '',
    currentCash: '',
    assetsLand: '',
    assetsApartments: '',
    liabilitiesLoans: '',
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!currentUser?.id) return;
      setErr('');
      try {
        const data = await apiGet(`/profile/${encodeURIComponent(currentUser.id)}`);
        const p = data.profile || {};
        if (!mounted) return;
        setForm({
          age: p.age ?? '',
          country: p.country || '',
          monthlyIncome: p.monthlyIncome ?? '',
          monthlyExpenses: p.monthlyExpenses ?? '',
          currentCash: p.currentCash ?? '',
          assetsLand: p.assets?.land ?? '',
          assetsApartments: p.assets?.apartments ?? '',
          liabilitiesLoans: p.liabilities?.loans ?? '',
        });
      } catch (error) {
        if (mounted) setErr(error.message);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [currentUser?.id]);

  async function save(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await apiPost(`/profile/${encodeURIComponent(currentUser.id)}`, {
        ...form,
        age: toNum(form.age),
        monthlyIncome: toNum(form.monthlyIncome),
        monthlyExpenses: toNum(form.monthlyExpenses),
        currentCash: toNum(form.currentCash),
        assets: {
          land: toNum(form.assetsLand) || 0,
          apartments: toNum(form.assetsApartments) || 0,
          total: (toNum(form.assetsLand) || 0) + (toNum(form.assetsApartments) || 0),
        },
        liabilities: {
          loans: toNum(form.liabilitiesLoans) || 0,
          total: toNum(form.liabilitiesLoans) || 0,
        },
      });
      setMsg('Profile updated successfully.');
    } catch (error) {
      setErr(error.message);
    }
  }

  return (
    <AppShell title="Profile" subtitle="Manage your personal and financial baseline profile.">
      <form className="finance-card" style={{ padding: 16 }} onSubmit={save}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(200px,1fr))', gap: 10 }}>
          <input className="input-field" placeholder="Age" value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))} />
          <input className="input-field" placeholder="Country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
          <input className="input-field" placeholder="Monthly Income" value={form.monthlyIncome} onChange={(e) => setForm((f) => ({ ...f, monthlyIncome: e.target.value }))} />
          <input className="input-field" placeholder="Monthly Expenses" value={form.monthlyExpenses} onChange={(e) => setForm((f) => ({ ...f, monthlyExpenses: e.target.value }))} />
          <input className="input-field" placeholder="Current Cash" value={form.currentCash} onChange={(e) => setForm((f) => ({ ...f, currentCash: e.target.value }))} />
          <input className="input-field" placeholder="Land Value" value={form.assetsLand} onChange={(e) => setForm((f) => ({ ...f, assetsLand: e.target.value }))} />
          <input className="input-field" placeholder="Apartments Value" value={form.assetsApartments} onChange={(e) => setForm((f) => ({ ...f, assetsApartments: e.target.value }))} />
          <input className="input-field" placeholder="Loans Balance" value={form.liabilitiesLoans} onChange={(e) => setForm((f) => ({ ...f, liabilitiesLoans: e.target.value }))} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn-primary" type="submit">Save Profile</button>
        </div>
        {err ? <p style={{ marginTop: 8, color: 'var(--status-negative)' }}>{err}</p> : null}
        {msg ? <p style={{ marginTop: 8, color: 'var(--status-positive)' }}>{msg}</p> : null}
      </form>
    </AppShell>
  );
}

