import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, CircleUser, Gauge, Home, LogOut, Settings, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/market/stocks', label: 'Stocks', icon: TrendingUp },
  { to: '/market/forex', label: 'Forex', icon: BarChart3 },
  { to: '/market/options', label: 'Options', icon: ShoppingCart },
  { to: '/portfolio', label: 'Portfolio', icon: Wallet },
  { to: '/risk', label: 'Risk Analysis', icon: Gauge },
  { to: '/profile', label: 'Profile', icon: CircleUser },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AppShell({ title, subtitle, children, actions }) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-container" style={{ background: 'var(--bg-main)' }}>
      <aside style={{ width: 260, background: 'var(--bg-card)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 20, borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.2rem' }}>Walle-T Market</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Trading Simulation MVP</p>
        </div>
        <nav style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Icon size={16} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div style={{ borderTop: '1px solid var(--border-color)', padding: 12 }}>
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontWeight: 700, fontSize: '0.88rem' }}>{currentUser?.username || 'User'}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{currentUser?.email || '-'}</p>
          </div>
          <button
            type="button"
            className="nav-link"
            style={{ color: 'var(--status-negative)' }}
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minHeight: '100vh', overflowY: 'auto' }}>
        <header style={{ padding: '20px 28px', borderBottom: '1px solid var(--border-color)', background: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: '1.4rem' }}>{title}</h1>
              {subtitle && <p style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{subtitle}</p>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
          </div>
        </header>
        <section style={{ padding: 24 }}>{children}</section>
      </main>
    </div>
  );
}

