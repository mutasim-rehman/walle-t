import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AppShell from '../components/AppShell';
import { useAuth } from '../auth/AuthContext';
import { API_BASE } from '../lib/api';

function starterPrompts() {
  return [
    'Given my current portfolio, what should I rebalance first?',
    'How do my assets and liabilities affect my risk right now?',
    'What should I do over the next 30 days if market volatility increases?',
  ];
}

export default function AdvisorPage() {
  const { currentUser } = useAuth();
  const [prompt, setPrompt] = useState('Based on my portfolio and balance sheet, what are my top priorities this month?');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chat, setChat] = useState([]);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const quickPrompts = useMemo(() => starterPrompts(), []);
  const isLocked = lockedUntil > nowMs;

  useEffect(() => {
    if (!isLocked) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLocked]);

  function formatDuration(seconds) {
    const total = Math.max(0, Math.ceil(Number(seconds || 0)));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '$0.00';
    return `$${n.toFixed(2)}`;
  }

  async function askAdvisor(e) {
    e.preventDefault();
    const question = prompt.trim();
    if (!question) {
      setError('Please enter a question for the advisor.');
      return;
    }
    if (!currentUser?.id) {
      setError('No active user session found.');
      return;
    }
    if (isLocked) {
      setError(`Advisor is temporarily locked. Try again in ${formatDuration((lockedUntil - nowMs) / 1000)}.`);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, message: question }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        if (response.status === 429 && Number.isFinite(Number(data?.retryAfterSec))) {
          const retrySec = Number(data.retryAfterSec);
          const lockedUntilMs = Date.now() + retrySec * 1000;
          setLockedUntil(lockedUntilMs);
          setNowMs(Date.now());
        }
        const details = data?.retryAfterSec
          ? ` (try again in ${formatDuration(data.retryAfterSec)})`
          : '';
        throw new Error((data?.message || 'Failed to get advice.') + details);
      }

      setChat((prev) => [
        {
          id: crypto.randomUUID(),
          question,
          reply: data.reply || '',
          sources: Array.isArray(data.sources) ? data.sources : [],
          financialProfile: data.financialProfile || null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err.message || 'Failed to get advice.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="Financial Advisor Chatbot"
      subtitle="Ask for educational guidance based on your holdings, cash, transactions, assets, and liabilities."
    >
      {isLocked ? (
        <div
          className="finance-card"
          style={{
            padding: 12,
            marginBottom: 12,
            borderColor: '#b45309',
            background: 'rgba(245, 158, 11, 0.12)',
          }}
        >
          <p style={{ margin: 0, color: '#fbbf24', fontWeight: 600 }}>
            Advisor lock active: next prompt in {formatDuration((lockedUntil - nowMs) / 1000)}.
            Limit policy is 1 prompt per 5 minutes and max 3 prompts in 6 hours.
          </p>
        </div>
      ) : null}

      <div className="finance-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ background: 'rgba(59,130,246,0.12)', padding: 8, borderRadius: 8 }}>
            <MessageSquare size={18} color="var(--brand-primary)" />
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Responses are educational only and not professional financial advice.
          </p>
        </div>

        <form onSubmit={askAdvisor}>
          <textarea
            className="input-field"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Ask about allocation, liabilities, cashflow, risk concentration, or how current events might affect your portfolio."
            style={{ resize: 'vertical', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {quickPrompts.map((item, idx) => (
                <button key={item} type="button" className="btn-secondary" onClick={() => setPrompt(item)} style={{ fontSize: '0.85rem' }}>
                  <Sparkles size={14} />
                  Prompt {idx + 1}: {item}
                </button>
              ))}
            </div>
            <button type="submit" className="btn-primary" disabled={loading || isLocked}>
              {loading ? 'Thinking...' : isLocked ? `Locked (${formatDuration((lockedUntil - nowMs) / 1000)})` : 'Ask Advisor'}
            </button>
          </div>
        </form>
        {error ? <p style={{ marginTop: 10, color: 'var(--status-negative)', fontWeight: 600 }}>{error}</p> : null}
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {chat.length === 0 ? (
          <div className="finance-card" style={{ padding: 16 }}>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              No messages yet. Ask your first financial question above.
            </p>
          </div>
        ) : (
          chat.map((item) => (
            <div key={item.id} className="finance-card" style={{ padding: 16 }}>
              <div
                style={{
                  marginBottom: 10,
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: 'var(--bg-alt)',
                }}
              >
                <p style={{ margin: 0, fontWeight: 800, fontSize: '0.9rem' }}>You</p>
                <p style={{ margin: '6px 0 0 0', whiteSpace: 'pre-wrap' }}>{item.question}</p>
              </div>

              <div
                style={{
                  border: '1px solid rgba(59,130,246,0.35)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  background: 'rgba(59,130,246,0.08)',
                }}
              >
                <p style={{ margin: '0 0 8px 0', fontWeight: 800, color: '#93c5fd' }}>Advisor</p>
                <div className="advisor-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.reply || '-'}</ReactMarkdown>
                </div>
              </div>

              {item.financialProfile ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 8 }}>
                  Context: cash {money(item.financialProfile.cash)} | holdings {item.financialProfile.holdingsCount ?? 0} | assets {money(item.financialProfile.assetsTotal)} | liabilities {money(item.financialProfile.liabilitiesTotal)}
                </p>
              ) : null}
              {item.sources.length > 0 ? (
                <div>
                  <p style={{ marginBottom: 6, fontWeight: 600 }}>Sources</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {item.sources.map((source) => (
                      <a key={source.uri} href={source.uri} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-primary)', wordBreak: 'break-word' }}>
                        {source.title || source.uri}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
