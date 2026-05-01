import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Activity, Users, Settings, LogOut, Search, Bell, TrendingUp, DollarSign, Download, Building, Shield, MessageSquare } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { API_BASE } from '../lib/api';

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toNum(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('Overview');
  const [companySymbol, setCompanySymbol] = useState('ABOT');
  const [activitySymbol, setActivitySymbol] = useState('ABOT');
  const [activityType, setActivityType] = useState('Prediction Review');
  const [activityBudget, setActivityBudget] = useState('');
  const [activityNote, setActivityNote] = useState('');
  const [activityMessage, setActivityMessage] = useState('');
  const [isActivityError, setIsActivityError] = useState(false);
  const [activities, setActivities] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [advisorPrompt, setAdvisorPrompt] = useState('How should I think about my portfolio given current market affairs?');
  const [advisorReply, setAdvisorReply] = useState('');
  const [advisorSources, setAdvisorSources] = useState([]);
  const [advisorError, setAdvisorError] = useState('');
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const quickSymbols = ['ABOT', 'ENGRO', 'LUCK', 'HBL', 'OGDC', 'PPL', 'TRG', 'FFC', 'MCB', 'UBL'];

  const [profileStatusLoading, setProfileStatusLoading] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState('');
  const [portfolio, setPortfolio] = useState(null);

  const [tradeSide, setTradeSide] = useState('BUY');
  const [tradeSymbol, setTradeSymbol] = useState('ABOT');
  const [tradeQty, setTradeQty] = useState('1');
  const [tradeMessage, setTradeMessage] = useState('');
  const [tradeIsError, setTradeIsError] = useState(false);
  const [tradeLoading, setTradeLoading] = useState(false);

  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState('');
  const [forecast, setForecast] = useState(null);

  useEffect(() => {
    async function loadActivities() {
      if (!currentUser?.id) return;
      setActivityLoading(true);
      setActivityMessage('');
      setIsActivityError(false);
      try {
        const res = await fetch(`${API_BASE}/activities/${encodeURIComponent(currentUser.id)}`);
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          setIsActivityError(true);
          setActivityMessage(data?.message || 'Failed to load your activities.');
          return;
        }
        setActivities(Array.isArray(data.activities) ? data.activities : []);
      } catch {
        setIsActivityError(true);
        setActivityMessage('Could not connect to activity service.');
      } finally {
        setActivityLoading(false);
      }
    }
    loadActivities();
  }, [API_BASE, currentUser?.id]);

  useEffect(() => {
    async function checkProfile() {
      if (!currentUser?.id) return;
      setProfileStatusLoading(true);
      try {
        const res = await fetch(`${API_BASE}/profile/${encodeURIComponent(currentUser.id)}`);
        const data = await res.json();
        // If profile cannot be read (permissions/sheet issues) or is incomplete, force onboarding.
        // This prevents silently skipping onboarding on first login.
        if (!res.ok || !data?.ok || !data?.profile || !data.isComplete) {
          navigate('/onboarding');
          return;
        }
      } catch {
        navigate('/onboarding');
      } finally {
        setProfileStatusLoading(false);
      }
    }
    checkProfile();
  }, [API_BASE, currentUser?.id, navigate]);

  const loadPortfolio = async () => {
    if (!currentUser?.id) return;
    setPortfolioLoading(true);
    setPortfolioError('');
    try {
      const res = await fetch(`${API_BASE}/portfolio/${encodeURIComponent(currentUser.id)}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const details = data?.details ? ` (${data.details})` : '';
        setPortfolioError((data?.message || 'Failed to load portfolio.') + details);
        return;
      }
      setPortfolio(data);
    } catch {
      setPortfolioError('Could not connect to portfolio service.');
    } finally {
      setPortfolioLoading(false);
    }
  };

  const loadForecast = async () => {
    if (!currentUser?.id) return;
    setForecastLoading(true);
    setForecastError('');
    try {
      const res = await fetch(`${API_BASE}/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const details = data?.details ? ` (${data.details})` : '';
        setForecastError((data?.message || 'Failed to load forecast.') + details);
        return;
      }
      setForecast(data);
    } catch {
      setForecastError('Could not connect to forecast service.');
    } finally {
      setForecastLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const openCompanyPrediction = () => {
    const symbol = companySymbol.trim().toUpperCase();
    if (!symbol) return;
    navigate(`/company/${encodeURIComponent(symbol)}`);
  };

  const handleTrade = async (e) => {
    e.preventDefault();
    const sym = tradeSymbol.trim().toUpperCase();
    const q = toNum(tradeQty);
    if (!currentUser?.id || !sym || q == null || q <= 0) {
      setTradeIsError(true);
      setTradeMessage('Enter a symbol and a valid quantity.');
      return;
    }
    setTradeLoading(true);
    setTradeMessage('');
    setTradeIsError(false);
    try {
      const res = await fetch(`${API_BASE}/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          side: tradeSide,
          symbol: sym,
          qty: q,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setTradeIsError(true);
        setTradeMessage(data?.message || 'Trade failed.');
        return;
      }
      setTradeIsError(false);
      setTradeMessage(`Trade placed: ${tradeSide} ${q} ${sym} @ ${formatMoney(data.trade?.price)}.`);
      await loadPortfolio();
    } catch {
      setTradeIsError(true);
      setTradeMessage('Could not reach the trading service.');
    } finally {
      setTradeLoading(false);
    }
  };

  const handleSaveActivity = async (e) => {
    e.preventDefault();
    const symbol = activitySymbol.trim().toUpperCase();
    if (!currentUser?.id || !symbol || !activityType.trim()) {
      setIsActivityError(true);
      setActivityMessage('Symbol and activity type are required.');
      return;
    }

    setActivityLoading(true);
    setActivityMessage('');
    setIsActivityError(false);
    try {
      const res = await fetch(`${API_BASE}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          symbol,
          activityType: activityType.trim(),
          budget: activityBudget.trim(),
          note: activityNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setIsActivityError(true);
        setActivityMessage(data?.message || 'Failed to save activity.');
        return;
      }

      setActivities((prev) => [data.activity, ...prev]);
      setActivityBudget('');
      setActivityNote('');
      setIsActivityError(false);
      setActivityMessage('Activity saved successfully. Your data is safe.');
    } catch {
      setIsActivityError(true);
      setActivityMessage('Could not save activity right now.');
    } finally {
      setActivityLoading(false);
    }
  };

  const handleAskAdvisor = async (e) => {
    e.preventDefault();
    if (!currentUser?.id || !advisorPrompt.trim()) {
      setAdvisorError('Enter a portfolio question first.');
      return;
    }

    setAdvisorLoading(true);
    setAdvisorError('');
    try {
      const res = await fetch(`${API_BASE}/advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          message: advisorPrompt.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setAdvisorError(data?.message || 'Failed to get advisor response.');
        return;
      }

      setAdvisorReply(data.reply || '');
      setAdvisorSources(Array.isArray(data.sources) ? data.sources : []);
    } catch {
      setAdvisorError('Could not reach the advisor service.');
    } finally {
      setAdvisorLoading(false);
    }
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
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{currentUser?.username || 'User'}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{currentUser?.email || 'Financial Analyst'}</p>
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
                  { label: 'Simulated Portfolio Cash', value: portfolio?.cash != null ? formatMoney(portfolio.cash) : '$-', icon: DollarSign, trend: profileStatusLoading ? '...' : 'Live', color: 'var(--brand-primary)', bg: '#eff6ff' },
                  { label: 'Shock Resilience Score', value: '88/100', icon: Shield, trend: '+1.5%', color: 'var(--status-positive)', bg: 'var(--status-positive-bg)' },
                  { label: 'Holdings Count', value: portfolio?.holdings?.length != null ? String(portfolio.holdings.length) : '-', icon: TrendingUp, trend: 'Derived', color: 'var(--brand-primary)', bg: '#eff6ff' },
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

              <div className="finance-card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>PSX Company Prediction View</h3>
                  <p style={{ color: 'var(--text-muted)' }}>Load a company chart and overlay the model prediction (5Y/3Y/1Y/YTD/6M/1M/1D).</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={companySymbol}
                    onChange={(e) => setCompanySymbol(e.target.value)}
                    className="input-field"
                    placeholder="Symbol (e.g. ABOT)"
                    list="dashboard-symbols"
                    style={{ marginBottom: 0, width: '180px' }}
                  />
                  <datalist id="dashboard-symbols">
                    {quickSymbols.map((symbol) => (
                      <option key={symbol} value={symbol} />
                    ))}
                  </datalist>
                  <button className="btn-primary" onClick={openCompanyPrediction}>Open</button>
                </div>
              </div>

              <div className="finance-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '10px' }}>Stock Options</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '14px' }}>
                  Quick pick a symbol to open its live chart with prediction overlay.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {quickSymbols.map((symbol) => (
                    <button
                      key={symbol}
                      className="btn-secondary"
                      onClick={() => navigate(`/company/${encodeURIComponent(symbol)}`)}
                      style={{ fontSize: '0.85rem' }}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>

              <div className="finance-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>Activity Module</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Create simulation input and keep a persistent list of previous activities.
                </p>
                <form onSubmit={handleSaveActivity} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  <input
                    value={activitySymbol}
                    onChange={(e) => setActivitySymbol(e.target.value)}
                    className="input-field"
                    placeholder="Symbol"
                    list="activity-symbols"
                    style={{ marginBottom: 0 }}
                  />
                  <datalist id="activity-symbols">
                    {quickSymbols.map((symbol) => (
                      <option key={symbol} value={symbol} />
                    ))}
                  </datalist>
                  <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value)}
                    className="input-field"
                    style={{ marginBottom: 0 }}
                  >
                    <option value="Prediction Review">Prediction Review</option>
                    <option value="Scenario Planning">Scenario Planning</option>
                    <option value="Risk Check">Risk Check</option>
                  </select>
                  <input
                    value={activityBudget}
                    onChange={(e) => setActivityBudget(e.target.value)}
                    className="input-field"
                    placeholder="Budget (optional)"
                    type="number"
                    min="0"
                    step="0.01"
                    style={{ marginBottom: 0 }}
                  />
                  <button type="submit" className="btn-primary" disabled={activityLoading}>
                    {activityLoading ? 'Saving...' : 'Save Activity'}
                  </button>
                  <input
                    value={activityNote}
                    onChange={(e) => setActivityNote(e.target.value)}
                    className="input-field"
                    placeholder="Optional note"
                    style={{ marginBottom: 0, gridColumn: '1 / span 3' }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const symbol = activitySymbol.trim().toUpperCase();
                      if (!symbol) return;
                      navigate(`/company/${encodeURIComponent(symbol)}`);
                    }}
                  >
                    Open Symbol
                  </button>
                </form>
                {activityMessage && (
                  <p style={{ marginTop: '12px', color: isActivityError ? 'var(--status-negative)' : 'var(--status-positive)', fontWeight: 600 }}>
                    {activityMessage}
                  </p>
                )}
              </div>

              <div className="finance-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ background: '#eff6ff', padding: '8px', borderRadius: '8px' }}>
                    <MessageSquare size={18} color="var(--brand-primary)" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>ChatyBot Advisor</h3>
                    <p style={{ color: 'var(--text-muted)' }}>
                      Gemini uses your saved activity as portfolio context and can factor in current affairs.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAskAdvisor}>
                  <textarea
                    value={advisorPrompt}
                    onChange={(e) => setAdvisorPrompt(e.target.value)}
                    className="input-field"
                    placeholder="Ask about your portfolio, risk exposure, or how current events may affect your saved symbols."
                    rows={4}
                    style={{ resize: 'vertical', marginBottom: '12px' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                      Portfolio context is built from your saved symbols, activity types, budgets, and notes.
                    </p>
                    <button type="submit" className="btn-primary" disabled={advisorLoading}>
                      {advisorLoading ? 'Thinking...' : 'Ask ChatyBot'}
                    </button>
                  </div>
                </form>

                {advisorError && (
                  <p style={{ marginTop: '12px', color: 'var(--status-negative)', fontWeight: 600 }}>
                    {advisorError}
                  </p>
                )}

                {advisorReply && (
                  <div style={{ marginTop: '16px', padding: '18px', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'var(--bg-alt)' }}>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{advisorReply}</p>
                    {advisorSources.length > 0 && (
                      <div style={{ marginTop: '14px' }}>
                        <p style={{ marginBottom: '8px', fontWeight: 700 }}>Grounded Sources</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {advisorSources.map((source) => (
                            <a
                              key={source.uri}
                              href={source.uri}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: 'var(--brand-primary)', wordBreak: 'break-word' }}
                            >
                              {source.title}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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

              <div className="finance-card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-alt)' }}>
                  <h3 style={{ fontSize: '1.1rem' }}>Previous Activities</h3>
                </div>
                {activities.length === 0 && !activityLoading && (
                  <p style={{ padding: '18px 24px', color: 'var(--text-muted)' }}>
                    No activity saved yet. Create your first record above.
                  </p>
                )}
                {activities.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '14px 24px', fontWeight: 600 }}>Date</th>
                        <th style={{ padding: '14px 24px', fontWeight: 600 }}>Symbol</th>
                        <th style={{ padding: '14px 24px', fontWeight: 600 }}>Type</th>
                        <th style={{ padding: '14px 24px', fontWeight: 600 }}>Note</th>
                        <th style={{ padding: '14px 24px', fontWeight: 600, textAlign: 'right' }}>Budget</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activities.slice(0, 8).map((row) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '14px 24px', color: 'var(--text-muted)' }}>
                            {new Date(row.createdAt).toLocaleString()}
                          </td>
                          <td style={{ padding: '14px 24px', fontWeight: 700 }}>{row.symbol}</td>
                          <td style={{ padding: '14px 24px' }}>{row.activityType}</td>
                          <td style={{ padding: '14px 24px', color: 'var(--text-muted)' }}>{row.note || '-'}</td>
                          <td style={{ padding: '14px 24px', textAlign: 'right', fontWeight: 600 }}>
                            {row.budget == null ? '-' : `$${Number(row.budget).toFixed(2)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'Portfolios' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="finance-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Buy / Sell (Simulated)</h3>
                    <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)' }}>
                      Trades are priced using the latest PSX close and stored in your Google Sheet transaction ledger.
                    </p>
                  </div>
                  <button className="btn-secondary" onClick={loadPortfolio} disabled={portfolioLoading}>
                    {portfolioLoading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>

                {portfolioError && (
                  <p style={{ marginTop: 12, color: 'var(--status-negative)', fontWeight: 700 }}>{portfolioError}</p>
                )}

                <form onSubmit={handleTrade} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 14 }}>
                  <select className="input-field" value={tradeSide} onChange={(e) => setTradeSide(e.target.value)} style={{ marginBottom: 0 }}>
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                  <input
                    className="input-field"
                    value={tradeSymbol}
                    onChange={(e) => setTradeSymbol(e.target.value)}
                    placeholder="Symbol (e.g. ABOT)"
                    style={{ marginBottom: 0 }}
                    list="trade-symbols"
                  />
                  <datalist id="trade-symbols">
                    {quickSymbols.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <input
                    className="input-field"
                    value={tradeQty}
                    onChange={(e) => setTradeQty(e.target.value)}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Qty"
                    style={{ marginBottom: 0 }}
                  />
                  <button type="submit" className="btn-primary" disabled={tradeLoading}>
                    {tradeLoading ? 'Placing...' : 'Execute Trade'}
                  </button>
                </form>

                {tradeMessage && (
                  <p style={{ marginTop: 12, color: tradeIsError ? 'var(--status-negative)' : 'var(--status-positive)', fontWeight: 700 }}>
                    {tradeMessage}
                  </p>
                )}

                {portfolio?.cash != null && (
                  <p style={{ marginTop: 10, color: 'var(--text-muted)', marginBottom: 0 }}>
                    Current simulated cash: <strong>{formatMoney(portfolio.cash)}</strong>
                  </p>
                )}
              </div>

              <div className="finance-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-alt)' }}>
                  <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Holdings</h3>
                </div>
                {!portfolio && (
                  <div style={{ padding: 18 }}>
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>Click Refresh to load your portfolio.</p>
                  </div>
                )}
                {portfolio && (portfolio.holdings?.length ?? 0) === 0 && (
                  <div style={{ padding: 18 }}>
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>No holdings yet. Place a BUY trade to create one.</p>
                  </div>
                )}
                {portfolio && (portfolio.holdings?.length ?? 0) > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '14px 24px', fontWeight: 700 }}>Symbol</th>
                        <th style={{ padding: '14px 24px', fontWeight: 700, textAlign: 'right' }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.holdings.map((h) => (
                        <tr key={h.symbol} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '14px 24px', fontWeight: 800 }}>{h.symbol}</td>
                          <td style={{ padding: '14px 24px', textAlign: 'right', fontWeight: 700 }}>{Number(h.qty).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="finance-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-alt)' }}>
                  <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Recent Transactions</h3>
                </div>
                {portfolio && (portfolio.transactions?.length ?? 0) === 0 && (
                  <div style={{ padding: 18 }}>
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>No transactions yet. Onboarding will add a DEPOSIT row.</p>
                  </div>
                )}
                {portfolio && (portfolio.transactions?.length ?? 0) > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '14px 24px', fontWeight: 700 }}>Date</th>
                        <th style={{ padding: '14px 24px', fontWeight: 700 }}>Type</th>
                        <th style={{ padding: '14px 24px', fontWeight: 700 }}>Symbol</th>
                        <th style={{ padding: '14px 24px', fontWeight: 700, textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '14px 24px', fontWeight: 700, textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: '14px 24px', fontWeight: 700, textAlign: 'right' }}>Cash After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.transactions.slice(0, 12).map((t, i) => (
                        <tr key={`${t.createdAt}-${i}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '14px 24px', color: 'var(--text-muted)' }}>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '-'}</td>
                          <td style={{ padding: '14px 24px', fontWeight: 800 }}>{t.type}</td>
                          <td style={{ padding: '14px 24px', fontWeight: 700 }}>{t.symbol || '-'}</td>
                          <td style={{ padding: '14px 24px', textAlign: 'right' }}>{t.qty == null ? '-' : Number(t.qty).toLocaleString()}</td>
                          <td style={{ padding: '14px 24px', textAlign: 'right', fontWeight: 700 }}>{t.amount == null ? '-' : formatMoney(t.amount)}</td>
                          <td style={{ padding: '14px 24px', textAlign: 'right', fontWeight: 700 }}>{t.cashAfter == null ? '-' : formatMoney(t.cashAfter)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'Scenarios' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="finance-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Financial Future Forecast</h3>
                    <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)' }}>
                      Net-worth projection (best/base/worst) using your onboarding inputs + simulated portfolio.
                    </p>
                  </div>
                  <button className="btn-primary" onClick={loadForecast} disabled={forecastLoading}>
                    {forecastLoading ? 'Computing...' : 'Run forecast'}
                  </button>
                </div>

                {forecastError && (
                  <p style={{ marginTop: 12, color: 'var(--status-negative)', fontWeight: 700 }}>{forecastError}</p>
                )}

                {forecast?.now && (
                  <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    <div className="finance-card" style={{ padding: 14 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Net Worth (now)</div>
                      <div style={{ fontWeight: 800 }}>{formatMoney(forecast.now.netWorth)}</div>
                    </div>
                    <div className="finance-card" style={{ padding: 14 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Investable (cash+portfolio)</div>
                      <div style={{ fontWeight: 800 }}>{formatMoney(forecast.now.investable)}</div>
                    </div>
                    <div className="finance-card" style={{ padding: 14 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Monthly Net Cashflow</div>
                      <div style={{ fontWeight: 800 }}>{formatMoney(forecast.now.monthlyNetCashflow)}</div>
                    </div>
                    <div className="finance-card" style={{ padding: 14 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Portfolio Value</div>
                      <div style={{ fontWeight: 800 }}>{formatMoney(forecast.now.portfolioValue)}</div>
                    </div>
                  </div>
                )}
              </div>

              {forecast?.series && (
                <div className="finance-card" style={{ padding: 24 }}>
                  <h3 style={{ marginTop: 0 }}>Projection (10 years, monthly)</h3>
                  <ForecastChart series={forecast.series} />
                  {forecast.narrative && (
                    <div style={{ marginTop: 16, padding: 16, border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-alt)' }}>
                      <h4 style={{ marginTop: 0, marginBottom: 10 }}>Scenario Summary</h4>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{forecast.narrative}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </main>
    </div>
  );
};

function ForecastChart({ series }) {
  const width = 920;
  const height = 380;
  const leftPad = 52;
  const rightPad = 16;
  const topPad = 12;
  const bottomPad = 34;

  const best = Array.isArray(series.best) ? series.best : [];
  const base = Array.isArray(series.base) ? series.base : [];
  const worst = Array.isArray(series.worst) ? series.worst : [];
  const combined = [...best, ...base, ...worst].filter((p) => Number.isFinite(Number(p.value)));
  if (!combined.length) return <p style={{ color: 'var(--text-muted)' }}>No forecast series available.</p>;

  const min = Math.min(...combined.map((p) => Number(p.value)));
  const max = Math.max(...combined.map((p) => Number(p.value)));
  const span = Math.max(1e-9, max - min);

  const toPath = (pts) => {
    const chartW = width - leftPad - rightPad;
    const chartH = height - topPad - bottomPad;
    const s = Math.max(1, pts.length - 1);
    return pts
      .map((p, i) => {
        const x = leftPad + (i / s) * chartW;
        const y = topPad + ((max - Number(p.value)) / span) * chartH;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  };

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="380" style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: '#fff' }}>
        <path d={toPath(worst)} fill="none" stroke="#ef4444" strokeWidth="2.5" />
        <path d={toPath(base)} fill="none" stroke="#2563eb" strokeWidth="2.5" />
        <path d={toPath(best)} fill="none" stroke="#16a34a" strokeWidth="2.5" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, color: 'var(--text-muted)' }}>
        <span><strong style={{ color: '#16a34a' }}>Best</strong> / <strong style={{ color: '#2563eb' }}>Base</strong> / <strong style={{ color: '#ef4444' }}>Worst</strong></span>
        <span>Min: {formatMoney(min)} · Max: {formatMoney(max)}</span>
      </div>
    </div>
  );
}

export default Dashboard;
