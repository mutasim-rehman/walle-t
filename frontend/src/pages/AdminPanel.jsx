import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../lib/api';
import { Shield, Users, Trash2, Eye, LogOut, RefreshCw, X, TrendingUp, DollarSign, Activity, ChevronDown, ChevronUp, Search } from 'lucide-react';

const ADMIN_TOKEN_KEY = 'wt_admin_token';

function saveToken(t) { if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t); else localStorage.removeItem(ADMIN_TOKEN_KEY); }
function loadToken() { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; }

async function adminFetch(path, opts = {}) {
  const token = loadToken();
  const res = await fetch(`${API_BASE}/admin${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token, ...(opts.headers || {}) },
  });
  const data = await res.json();
  return { ok: res.ok && data.ok, status: res.status, data };
}

function fmt(n) { return n == null ? 'n/a' : `$${Number(n).toFixed(2)}`; }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString() : '—'; }

// ── Login Screen ──────────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok || !data.ok) { setErr(data.message || 'Login failed'); return; }
    saveToken(data.token);
    onLogin();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '48px 40px', width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ background: '#dbeafe', borderRadius: 12, width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Shield size={28} color="#1d4ed8" />
          </div>
          <h1 style={{ fontSize: '1.6rem', marginBottom: 4 }}>Admin Portal</h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Walle-T Administration</p>
        </div>
        <form onSubmit={submit}>
          <input className="input-field" style={{ marginBottom: 14 }} type="email" placeholder="Admin email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="input-field" style={{ marginBottom: 14 }} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          {err && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 12 }}>{err}</p>}
          <button className="btn-primary" style={{ width: '100%', padding: '12px' }} disabled={busy}>{busy ? 'Authenticating…' : 'Sign In'}</button>
        </form>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color = '#2563eb' }) {
  return (
    <div className="finance-card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ background: color + '18', borderRadius: 10, padding: 12 }}>{React.cloneElement(icon, { color, size: 22 })}</div>
      <div>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: '1.4rem', fontWeight: 700 }}>{value}</p>
      </div>
    </div>
  );
}

// ── User Detail Modal ─────────────────────────────────────────────────────────
function UserModal({ userId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    adminFetch(`/users/${userId}`).then(r => { setData(r.data); setLoading(false); });
  }, [userId]);

  if (loading) return (
    <div style={overlay}><div style={modal}><p style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading…</p></div></div>
  );

  const { user, profile, ledger, transactions = [], stats = {}, dailyUsage = [] } = data || {};

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: 800, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0 }}>{user?.username}</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>{user?.email} · joined {fmtDate(user?.createdAt)}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
          {['overview','holdings','transactions','daily'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', background: tab === t ? '#2563eb' : '#f1f5f9', color: tab === t ? '#fff' : '#334155' }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
              <StatCard icon={<DollarSign />} label="Cash Balance" value={fmt(ledger?.cash)} color="#10b981" />
              <StatCard icon={<TrendingUp />} label="Portfolio Value" value={fmt(ledger?.totalPortfolioValue)} color="#2563eb" />
              <StatCard icon={<Activity />} label="Total Trades" value={stats.totalTrades ?? 0} color="#8b5cf6" />
            </div>
            {profile && (
              <div className="finance-card" style={{ padding: 20 }}>
                <h4 style={{ marginBottom: 12 }}>Financial Profile</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.875rem' }}>
                  {[['Age', profile.age], ['Country', profile.country], ['Monthly Income', fmt(profile.monthlyIncome)], ['Monthly Expenses', fmt(profile.monthlyExpenses)], ['Current Cash', fmt(profile.currentCash)]].map(([k,v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ color: '#64748b' }}>{k}</span><strong>{v ?? '—'}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'holdings' && (
          <div>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 12 }}>Cash: <strong>{fmt(ledger?.cash)}</strong> · Holdings value: <strong>{fmt(ledger?.holdingsTotalValue)}</strong></p>
            {(ledger?.holdings || []).length === 0 ? <p style={{ color: '#94a3b8' }}>No holdings.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead><tr style={{ background: '#f8fafc' }}>{['Symbol','Qty','Price','Value'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>{(ledger.holdings).map(h => (
                  <tr key={h.symbol} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>{h.symbol}</td>
                    <td style={{ padding: '8px 12px' }}>{Number(h.qty).toFixed(4)}</td>
                    <td style={{ padding: '8px 12px' }}>{h.price != null ? fmt(h.price) : '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 600 }}>{h.value != null ? fmt(h.value) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'transactions' && (
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {transactions.length === 0 ? <p style={{ color: '#94a3b8' }}>No transactions.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead><tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>{['Date','Type','Symbol','Qty','Amount','Cash After'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>{transactions.slice(0, 100).map((t, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 10px' }}>{String(t.createdAt).slice(0,10)}</td>
                    <td style={{ padding: '6px 10px' }}><span style={{ background: t.type === 'BUY' ? '#d1fae5' : t.type === 'SELL' ? '#fee2e2' : '#f1f5f9', color: t.type === 'BUY' ? '#065f46' : t.type === 'SELL' ? '#991b1b' : '#334155', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>{t.type}</span></td>
                    <td style={{ padding: '6px 10px' }}>{t.symbol || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{t.qty ?? '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{fmt(t.amount)}</td>
                    <td style={{ padding: '6px 10px' }}>{fmt(t.cashAfter)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'daily' && (
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {dailyUsage.length === 0 ? <p style={{ color: '#94a3b8' }}>No usage data.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead><tr style={{ background: '#f8fafc' }}>{['Date','Trades','Volume'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>{dailyUsage.map(d => (
                  <tr key={d.day} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>{d.day}</td>
                    <td style={{ padding: '8px 12px' }}>{d.tradeCount}</td>
                    <td style={{ padding: '8px 12px' }}>{fmt(d.volume)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal = { background: '#fff', borderRadius: 16, padding: '32px 28px', width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' };

// ── Main Admin Panel ──────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [authed, setAuthed] = useState(!!loadToken());
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortAsc, setSortAsc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ur, sr] = await Promise.all([adminFetch('/users'), adminFetch('/stats')]);
    if (ur.status === 401) { saveToken(''); setAuthed(false); setLoading(false); return; }
    if (ur.ok) setUsers(ur.data.users || []);
    if (sr.ok) setStats(sr.data.stats);
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function handleDelete(id) {
    setDeletingId(id); setConfirmDelete(null);
    const r = await adminFetch(`/users/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    if (r.ok) setUsers(prev => prev.filter(u => u.id !== id));
    else alert(r.data?.message || 'Delete failed');
  }

  function logout() { saveToken(''); setAuthed(false); }

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;

  const filtered = users
    .filter(u => !search || u.username.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortCol] || ''; const bv = b[sortCol] || '';
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  function SortHdr({ col, label }) {
    return (
      <th onClick={() => { if (sortCol === col) setSortAsc(p => !p); else { setSortCol(col); setSortAsc(true); } }}
        style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{label}{sortCol === col ? (sortAsc ? <ChevronUp size={14}/> : <ChevronDown size={14}/>) : null}</span>
      </th>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#0f172a)', padding: '0 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Shield size={22} color="#93c5fd" />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>Walle-T Admin</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={load} className="btn-secondary" style={{ fontSize: '0.85rem', padding: '8px 14px' }} disabled={loading}><RefreshCw size={14} /> Refresh</button>
            <button onClick={logout} className="btn-secondary" style={{ fontSize: '0.85rem', padding: '8px 14px' }}><LogOut size={14} /> Logout</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 32 }}>
          <StatCard icon={<Users />} label="Total Users" value={stats?.totalUsers ?? users.length} color="#2563eb" />
          <StatCard icon={<Activity />} label="New Today" value={stats?.signupTrend?.[0]?.day === new Date().toISOString().slice(0,10) ? stats.signupTrend[0].count : 0} color="#10b981" />
          <StatCard icon={<TrendingUp />} label="Last 7 Days" value={(stats?.signupTrend || []).slice(0,7).reduce((s,d) => s + d.count, 0)} color="#8b5cf6" />
        </div>

        {/* User Table */}
        <div className="finance-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', flex: 1 }}>Users <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.9rem' }}>({filtered.length})</span></h2>
            <div style={{ position: 'relative' }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="input-field" style={{ paddingLeft: 32, width: 220, marginBottom: 0, fontSize: '0.875rem' }} />
            </div>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading users…</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    <SortHdr col="username" label="Username" />
                    <SortHdr col="email" label="Email" />
                    <SortHdr col="createdAt" label="Joined" />
                    <th style={{ padding: '12px 16px', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>No users found.</td></tr>
                  )}
                  {filtered.map(u => (
                    <tr key={u.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{u.username}</td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>{u.email}</td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{fmtDate(u.createdAt)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => setSelectedId(u.id)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}><Eye size={13} /> View</button>
                          {confirmDelete === u.id ? (
                            <>
                              <button onClick={() => handleDelete(u.id)} style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }} disabled={deletingId === u.id}>{deletingId === u.id ? '…' : 'Confirm'}</button>
                              <button onClick={() => setConfirmDelete(null)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmDelete(u.id)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#ef4444', borderColor: '#fca5a5' }}><Trash2 size={13} /> Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedId && <UserModal userId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
