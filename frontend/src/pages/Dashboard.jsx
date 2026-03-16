import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Activity, Users, Settings, LogOut, Search, Bell, TrendingUp, DollarSign, Download, Building, Shield } from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Overview');

  const handleLogout = () => {
    navigate('/');
  };

  const navItems = [
    { name: 'Overview', icon: LayoutDashboard },
    { name: 'Portfolios', icon: Building },
    { name: 'Scenarios', icon: Activity },
    { name: 'Risk Analysis', icon: Shield },
    { name: 'Settings', icon: Settings },
  ];

  return (
    <div className="app-container" style={{ background: 'var(--bg-main)' }}>
      {/* Sidebar */}
      <aside style={{ width: '260px', background: 'var(--bg-card)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <div style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ background: 'var(--brand-primary)', width: '32px', height: '32px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building size={18} color="#fff" />
          </div>
          <h2 style={{ fontSize: '1.25rem', color: '#0f172a' }}>Walle-T</h2>
        </div>

        <nav style={{ flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.name;
            return (
              <button
                key={item.name}
                onClick={() => setActiveTab(item.name)}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                {item.name}
              </button>
            )
          })}
        </nav>

        <div style={{ padding: '20px 16px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ padding: '12px', background: 'var(--bg-alt)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="var(--text-muted)" />
            </div>
            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>Admin User</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Financial Analyst</p>
            </div>
          </div>
          <button onClick={handleLogout} className="nav-link" style={{ color: 'var(--status-negative)' }}>
            <LogOut size={18} />
            Secure Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>
        
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 40px', background: '#ffffff', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '4px' }}>{activeTab}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Financial simulation and predictive analytics module.</p>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
               <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
               <input type="text" placeholder="Search portfolios..." className="input-field" style={{ paddingLeft: '36px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', width: '250px', marginBottom: 0 }} />
            </div>
            <button className="btn-secondary clickable" style={{ padding: '8px' }}>
              <Bell size={18} color="var(--text-main)" />
            </button>
            <button className="btn-primary clickable">
              <Download size={16} /> Export Report
            </button>
          </div>
        </header>

        {/* Dashboard Widgets */}
        <div style={{ padding: '40px' }}>
          {activeTab === 'Overview' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {/* Top Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                {[
                  { label: 'Total Net Asset Value', value: '$1,294,500.00', icon: DollarSign, trend: '+4.2%', color: 'var(--brand-primary)', bg: '#eff6ff' },
                  { label: 'Shock Resilience Score', value: '88/100', icon: Shield, trend: '+1.5%', color: 'var(--status-positive)', bg: 'var(--status-positive-bg)' },
                  { label: 'Projected Monthly Yield', value: '$8,440.25', icon: TrendingUp, trend: '+5.8%', color: 'var(--brand-primary)', bg: '#eff6ff' },
                ].map((stat, i) => (
                  <div key={i} className="finance-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</p>
                      <div style={{ background: stat.bg, padding: '8px', borderRadius: '8px' }}>
                        <stat.icon size={18} color={stat.color} />
                      </div>
                    </div>
                    <div>
                      <h3 style={{ fontSize: '2.25rem' }}>{stat.value}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                        <span style={{ color: 'var(--status-positive)', fontSize: '0.85rem', fontWeight: 600, background: 'var(--status-positive-bg)', padding: '2px 6px', borderRadius: '4px' }}>{stat.trend}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>vs last quarter</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Main Chart Placeholder */}
              <div className="finance-card" style={{ padding: '32px', minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                   <h3 style={{ fontSize: '1.25rem' }}>Trajectory Simulation Graph</h3>
                   <div style={{ display: 'flex', gap: '8px' }}>
                      {['1M', '3M', '6M', '1Y', '5Y', 'MAX'].map(p => (
                        <button key={p} className={`btn-secondary ${p === '1Y' ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: '0.8rem', background: p === '1Y' ? 'var(--bg-alt)' : '#fff' }}>{p}</button>
                      ))}
                   </div>
                 </div>
                 <div style={{ flex: 1, border: '1px dashed var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-alt)' }}>
                   <Activity size={48} color="var(--text-muted)" style={{ opacity: 0.3, marginBottom: '16px' }} />
                   <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Interactive Bar/Line Chart Visualization Renders Here</p>
                 </div>
              </div>

              {/* Data Table Placeholder */}
              <div className="finance-card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-alt)' }}>
                  <h3 style={{ fontSize: '1.1rem' }}>Recent Transactions & Updates</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '16px 24px', fontWeight: 600 }}>Date</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600 }}>Description</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600 }}>Category</th>
                      <th style={{ padding: '16px 24px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { date: 'Oct 24, 2026', desc: 'Quarterly Dividend Yield', cat: 'Income', amount: '+$4,250.00', type: 'pos' },
                      { date: 'Oct 22, 2026', desc: 'Asset Restructuring Fee', cat: 'Expense', amount: '-$150.00', type: 'neg' },
                      { date: 'Oct 18, 2026', desc: 'Bond Maturity Payout', cat: 'Income', amount: '+$12,000.00', type: 'pos' },
                    ].map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>{row.date}</td>
                        <td style={{ padding: '16px 24px', fontWeight: 500 }}>{row.desc}</td>
                        <td style={{ padding: '16px 24px' }}><span style={{ padding: '4px 8px', background: 'var(--bg-alt)', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{row.cat}</span></td>
                        <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 600, color: row.type === 'pos' ? 'var(--status-positive)' : 'var(--text-main)' }}>{row.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
};

export default Dashboard;
