import React, { useEffect, useState, useCallback } from "react";
import AppShell from "../components/AppShell";
import PriceAreaChart from "../components/PriceAreaChart";
import { useAuth } from "../auth/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import { fetchPsxEodRows, priceTickFromRows, runPool } from "../lib/psxClient";
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, CheckCircle, Clock, ChevronUp, ChevronDown, Zap } from "lucide-react";

const WATCHLIST = [
  { sym: "ABOT", name: "Abbott" },
  { sym: "ENGRO", name: "Engro Corp" },
  { sym: "LUCK", name: "Lucky Cement" },
  { sym: "HBL", name: "HBL Bank" },
  { sym: "OGDC", name: "OGDC" },
  { sym: "PPL", name: "PPL" },
  { sym: "TRG", name: "TRG Pakistan" },
  { sym: "FFC", name: "Fauji Fert" },
  { sym: "MCB", name: "MCB Bank" },
  { sym: "UBL", name: "UBL" },
  { sym: "PSO", name: "PSO" },
  { sym: "HUBC", name: "Hub Power" },
];

function fmt2(n) { return n == null ? "—" : Number(n).toFixed(2); }
function fmtMoney(n) { return n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Order Panel ───────────────────────────────────────────────────────────────
function OrderPanel({ symbol, price, cash, holdings, onFilled }) {
  const { currentUser } = useAuth();
  const [side, setSide] = useState("BUY");
  const [qty, setQty] = useState("1");
  const [orderType] = useState("MARKET");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const qtyNum = Math.max(0, Number(qty) || 0);
  const total = price != null ? price * qtyNum : null;
  const holdQty = holdings?.find(h => h.symbol === symbol)?.qty || 0;
  const canBuy = total != null && cash != null && total <= cash && qtyNum > 0;
  const canSell = qtyNum > 0 && qtyNum <= holdQty;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setToast(null);
    try {
      const data = await apiPost("/trade", { userId: currentUser.id, side, symbol, qty: qtyNum });
      setToast({ ok: true, msg: `✓ ${side} ${qtyNum} ${symbol} @ ${fmt2(data.trade.price)} — Cash: ${fmtMoney(data.trade.cashAfter)}` });
      setQty("1");
      if (onFilled) onFilled(data.trade);
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    }
    setBusy(false);
  }

  function setMaxQty() {
    if (side === "BUY" && price && cash) setQty(String(Math.floor(cash / price)));
    else if (side === "SELL") setQty(String(Math.floor(holdQty)));
  }

  return (
    <div style={{ background: "#0f172a", borderRadius: 12, padding: 20, border: "1px solid #1e293b" }}>
      <div style={{ display: "flex", marginBottom: 16, borderRadius: 8, overflow: "hidden", border: "1px solid #1e293b" }}>
        {["BUY", "SELL"].map(s => (
          <button key={s} onClick={() => setSide(s)} style={{ flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.9rem", background: side === s ? (s === "BUY" ? "#10b981" : "#ef4444") : "transparent", color: side === s ? "#fff" : "#64748b", transition: "all 0.15s" }}>{s}</button>
        ))}
      </div>

      <form onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 4 }}>ORDER TYPE</label>
          <div style={{ background: "#1e293b", borderRadius: 6, padding: "8px 12px", color: "#94a3b8", fontSize: "0.85rem" }}>Market Order</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>QUANTITY</label>
            <button type="button" onClick={setMaxQty} style={{ fontSize: "0.7rem", background: "none", border: "1px solid #334155", color: "#94a3b8", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>MAX</button>
          </div>
          <div style={{ display: "flex", background: "#1e293b", borderRadius: 6, border: "1px solid #334155" }}>
            <input type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} style={{ flex: 1, background: "transparent", border: "none", padding: "10px 12px", color: "#f1f5f9", fontSize: "1rem", outline: "none" }} />
            <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid #334155" }}>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty(q => String(Math.max(1, Number(q) + 1)))} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "0 8px" }}><ChevronUp size={14} /></button>
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty(q => String(Math.max(1, Number(q) - 1)))} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "0 8px" }}><ChevronDown size={14} /></button>
            </div>
          </div>
        </div>

        <div style={{ background: "#1e293b", borderRadius: 8, padding: "12px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.8rem" }}>
            <span style={{ color: "#64748b" }}>Market Price</span><span style={{ color: "#f1f5f9" }}>{price != null ? fmtMoney(price) : "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.8rem" }}>
            <span style={{ color: "#64748b" }}>Quantity</span><span style={{ color: "#f1f5f9" }}>{qtyNum}</span>
          </div>
          <div style={{ borderTop: "1px solid #334155", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: "0.9rem", fontWeight: 700 }}>
            <span style={{ color: "#94a3b8" }}>Est. Total</span><span style={{ color: total != null ? (side === "BUY" ? "#ef4444" : "#10b981") : "#f1f5f9" }}>{total != null ? fmtMoney(total) : "—"}</span>
          </div>
        </div>

        <div style={{ marginBottom: 12, fontSize: "0.75rem", color: "#475569", display: "flex", justifyContent: "space-between" }}>
          <span>Available Cash: <strong style={{ color: "#94a3b8" }}>{fmtMoney(cash)}</strong></span>
          {side === "SELL" && <span>Holdings: <strong style={{ color: "#94a3b8" }}>{holdQty}</strong></span>}
        </div>

        <button type="submit" disabled={busy || (side === "BUY" ? !canBuy : !canSell)} style={{ width: "100%", padding: "13px", border: "none", borderRadius: 8, fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", background: side === "BUY" ? (canBuy ? "#10b981" : "#134e4a") : (canSell ? "#ef4444" : "#7f1d1d"), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.15s" }}>
          <Zap size={16} />{busy ? "Placing…" : `Place ${side} Order`}
        </button>
      </form>

      {toast && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: toast.ok ? "#052e16" : "#450a0a", border: `1px solid ${toast.ok ? "#10b981" : "#ef4444"}`, display: "flex", alignItems: "flex-start", gap: 8 }}>
          {toast.ok ? <CheckCircle size={15} color="#10b981" style={{ marginTop: 1, flexShrink: 0 }} /> : <AlertCircle size={15} color="#ef4444" style={{ marginTop: 1, flexShrink: 0 }} />}
          <span style={{ fontSize: "0.8rem", color: toast.ok ? "#4ade80" : "#fca5a5", lineHeight: 1.4 }}>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

// ── Recent Trades ─────────────────────────────────────────────────────────────
function RecentTrades({ trades }) {
  if (!trades.length) return <p style={{ color: "#475569", fontSize: "0.85rem", textAlign: "center", padding: 20 }}>No trades yet.</p>;
  return (
    <div style={{ maxHeight: 260, overflowY: "auto" }}>
      {trades.slice(0, 20).map((t, i) => {
        const isBuy = String(t.type).toUpperCase() === "BUY";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e293b", fontSize: "0.8rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: isBuy ? "#052e16" : "#450a0a", color: isBuy ? "#4ade80" : "#fca5a5", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: "0.7rem" }}>{t.type}</span>
              <span style={{ color: "#f1f5f9", fontWeight: 600 }}>{t.symbol}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#f1f5f9" }}>{fmt2(t.qty)} @ {fmt2(t.price)}</div>
              <div style={{ color: "#475569", fontSize: "0.72rem" }}>{new Date(t.createdAt).toLocaleTimeString()}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Watchlist Item ────────────────────────────────────────────────────────────
function WatchItem({ item, active, onClick, priceCache }) {
  const p = priceCache[item.sym];
  const up = p?.chg >= 0;
  return (
    <div onClick={onClick} style={{ padding: "10px 14px", background: active ? "#1e3a5f" : "transparent", borderLeft: `3px solid ${active ? "#3b82f6" : "transparent"}`, cursor: "pointer", transition: "all 0.15s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "0.85rem" }}>{item.sym}</div>
          <div style={{ color: "#475569", fontSize: "0.72rem" }}>{item.name}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#f1f5f9", fontSize: "0.85rem", fontWeight: 600 }}>{p ? fmt2(p.price) : "…"}</div>
          {p?.chg != null && (
            <div style={{ color: up ? "#4ade80" : "#f87171", fontSize: "0.7rem", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
              {up ? <ChevronUp size={10} /> : <ChevronDown size={10} />}{Math.abs(p.chg).toFixed(2)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StocksMarketPage() {
  const { currentUser } = useAuth();
  const [active, setActive] = useState(WATCHLIST[0]);
  const [series, setSeries] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [cash, setCash] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [trades, setTrades] = useState([]);
  const [priceCache, setPriceCache] = useState({});
  const [priceRange, setPriceRange] = useState("180"); // days shown
  const [chartError, setChartError] = useState("");
  const [portfolioError, setPortfolioError] = useState("");

  // Load chart for selected symbol
  const loadChart = useCallback(async (sym) => {
    setLoadingChart(true);
    setChartError("");
    try {
      const rows = await fetchPsxEodRows(sym);
      const days = Math.max(2, Number(priceRange) || 180);
      const trimmedRows = rows.slice(-days);
      const mapped = trimmedRows
        .map(r => ({ time: new Date(Number(r[0]) * 1000).toISOString(), value: Number(r[1]) }))
        .filter(p => Number.isFinite(p.value));
      setSeries(mapped);
      const tick = priceTickFromRows(rows);
      if (tick) setPriceCache(prev => ({ ...prev, [sym]: tick }));
    } catch (err) {
      setSeries([]);
      setChartError(err?.message || `Could not load ${sym} chart.`);
    }
    setLoadingChart(false);
  }, [priceRange]);

  useEffect(() => { loadChart(active.sym); }, [active.sym, loadChart]);

  // Load portfolio
  const loadPortfolio = useCallback(async () => {
    if (!currentUser?.id) return;
    setPortfolioError("");
    try {
      const data = await apiGet(`/portfolio/${encodeURIComponent(currentUser.id)}`);
      setCash(data.cash ?? null);
      setHoldings(Array.isArray(data.holdings) ? data.holdings : []);
      setTrades(Array.isArray(data.transactions) ? data.transactions : []);
    } catch (err) {
      setPortfolioError(err?.message || "Could not load portfolio.");
    }
  }, [currentUser?.id]);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  // Watchlist prices: bounded concurrency so localhost PSX proxy is not overwhelmed (was 12 parallel full series).
  useEffect(() => {
    let cancelled = false;
    const REFRESH_MS = 120000;

    async function refreshWatchlist() {
      const concurrency = import.meta.env.DEV ? 3 : 4;
      await runPool(WATCHLIST, concurrency, async (item) => {
        if (cancelled) return;
        try {
          const rows = await fetchPsxEodRows(item.sym);
          const tick = priceTickFromRows(rows);
          if (tick && !cancelled) {
            setPriceCache((prev) => ({ ...prev, [item.sym]: tick }));
          }
      } catch {
          /* skip symbol */
        }
      });
    }

    refreshWatchlist();
    const iv = setInterval(refreshWatchlist, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const latest = series[series.length - 1]?.value ?? null;
  const first = series[0]?.value ?? null;
  const changePct = first && latest && first !== 0 ? ((latest - first) / first) * 100 : null;
  const high = series.length ? Math.max(...series.map(p => p.value)) : null;
  const low = series.length ? Math.min(...series.map(p => p.value)) : null;
  const up = changePct == null ? true : changePct >= 0;

  function handleFilled(trade) {
    setTrades(prev => [{ ...trade, type: trade.side }, ...prev]);
    loadPortfolio();
  }

  return (
    <AppShell title="Stock Market" subtitle="PSX equities (end-of-day prices) — simulated trade execution for educational use">
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 300px", gap: 16, minHeight: "calc(100vh - 120px)" }}>

        {/* ── Watchlist ── */}
        <div style={{ background: "#0f172a", borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #1e293b" }}>
            <h3 style={{ color: "#f1f5f9", fontSize: "0.85rem", margin: 0 }}>WATCHLIST</h3>
          </div>
          <div>{WATCHLIST.map(item => <WatchItem key={item.sym} item={item} active={active.sym === item.sym} onClick={() => setActive(item)} priceCache={priceCache} />)}</div>
        </div>

        {/* ── Chart + Stats ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Header */}
          <div style={{ background: "#0f172a", borderRadius: 12, padding: "20px 24px", border: "1px solid #1e293b" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ color: "#f1f5f9", margin: 0, fontSize: "1.6rem", fontWeight: 800 }}>{active.sym}</h2>
                  <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{active.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 8 }}>
                  <span style={{ fontSize: "2rem", fontWeight: 800, color: "#f1f5f9" }}>{latest != null ? fmt2(latest) : "—"}</span>
                  {changePct != null && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: up ? "#4ade80" : "#f87171", fontWeight: 700, fontSize: "1rem" }}>
                      {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}{up ? "+" : ""}{changePct.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {["30", "90", "180", "365"].map(d => (
                  <button key={d} onClick={() => { setPriceRange(d); }} style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, background: priceRange === d ? "#3b82f6" : "#1e293b", color: priceRange === d ? "#fff" : "#64748b" }}>{d}D</button>
                ))}
                <button onClick={() => loadChart(active.sym)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: "0.75rem", background: "#1e293b", color: "#64748b" }} disabled={loadingChart}><RefreshCw size={12} /></button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 20 }}>
              {[["HIGH", high], ["LOW", low], ["OPEN", first]].map(([l, v]) => (
                <div key={l} style={{ background: "#1e293b", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ color: "#475569", fontSize: "0.7rem", marginBottom: 4 }}>{l}</div>
                  <div style={{ color: "#f1f5f9", fontWeight: 700 }}>{v != null ? fmt2(v) : "—"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div style={{ background: "#0f172a", borderRadius: 12, padding: 16, border: "1px solid #1e293b" }}>
            {loadingChart ? (
              <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                <RefreshCw size={20} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ marginLeft: 10 }}>Loading chart…</span>
              </div>
            ) : chartError ? (
              <div style={{ height: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fca5a5", gap: 12 }}>
                <AlertCircle size={20} />
                <span style={{ fontSize: "0.85rem" }}>{chartError}</span>
                <button type="button" onClick={() => loadChart(active.sym)} style={{ background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: "0.8rem" }}>
                  Retry
                </button>
              </div>
            ) : <PriceAreaChart series={series} height={300} valueDecimals={2} />}
      </div>

          {/* Recent Trades */}
          <div style={{ background: "#0f172a", borderRadius: 12, border: "1px solid #1e293b" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b" }}>
              <h3 style={{ color: "#f1f5f9", fontSize: "0.85rem", margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Clock size={14} color="#64748b" />YOUR TRADE HISTORY</h3>
            </div>
            <div style={{ padding: "0 16px" }}>
              <RecentTrades trades={trades.filter(t => ["BUY", "SELL"].includes(String(t.type || "").toUpperCase()))} />
            </div>
          </div>
        </div>

        {/* ── Order Panel + Holdings ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <OrderPanel symbol={active.sym} price={latest} cash={cash} holdings={holdings} onFilled={handleFilled} />

          {/* Holdings */}
          <div style={{ background: "#0f172a", borderRadius: 12, border: "1px solid #1e293b" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b" }}>
              <h3 style={{ color: "#f1f5f9", fontSize: "0.85rem", margin: 0 }}>PORTFOLIO</h3>
            </div>
            <div style={{ padding: "10px 16px" }}>
              {portfolioError ? (
                <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 6, background: "#450a0a", border: "1px solid #ef4444" }}>
                  <p style={{ margin: 0, color: "#fca5a5", fontSize: "0.75rem" }}>{portfolioError}</p>
                  <button type="button" onClick={loadPortfolio} style={{ marginTop: 6, background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: "0.7rem" }}>
                    Retry
                  </button>
                </div>
              ) : null}
              <div style={{ marginBottom: 10, fontSize: "0.8rem", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Cash</span>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>{fmtMoney(cash)}</span>
              </div>
              {holdings.length === 0 ? <p style={{ color: "#334155", fontSize: "0.8rem" }}>No holdings.</p> : holdings.map(h => (
                <div key={h.symbol} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid #1e293b", fontSize: "0.8rem" }}>
                  <span style={{ color: "#94a3b8", fontWeight: 600 }}>{h.symbol}</span>
                  <span style={{ color: "#f1f5f9" }}>{Number(h.qty).toFixed(2)} units</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </AppShell>
  );
}
