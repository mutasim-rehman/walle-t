import React, { useEffect, useState, useCallback } from "react";
import AppShell from "../components/AppShell";
import PriceAreaChart from "../components/PriceAreaChart";
import { useAuth } from "../auth/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, CheckCircle, Clock, ChevronUp, ChevronDown, Zap } from "lucide-react";

const WATCHLIST = [
  { sym: "EURUSD", name: "Euro / US Dollar" },
  { sym: "GBPUSD", name: "Pound / US Dollar" },
  { sym: "USDJPY", name: "US Dollar / Yen" },
  { sym: "AUDUSD", name: "Aussie / US Dollar" },
  { sym: "USDCAD", name: "US Dollar / CAD" },
  { sym: "USDCHF", name: "US Dollar / Franc" },
];

function fmt5(n) {
  return n == null ? "—" : Number(n).toFixed(5);
}
function fmtMoney(n) {
  return n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ForexOrderPanel({ pair, price, cash, onFilled }) {
  const { currentUser } = useAuth();
  const [side, setSide] = useState("BUY");
  const [units, setUnits] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const unitsNum = Math.max(0, Number(units) || 0);
  const total = price != null ? price * unitsNum : null;
  const canBuy = total != null && cash != null && total <= cash && unitsNum > 0;
  const canSell = unitsNum > 0;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setToast(null);
    try {
      const data = await apiPost("/trade/forex", {
        userId: currentUser.id,
        pair,
        side,
        units: unitsNum,
      });
      setToast({
        ok: true,
        msg: `✓ ${data.trade.side} ${data.trade.units} ${data.trade.pair} @ ${fmt5(data.trade.price)} — Cash: ${fmtMoney(data.trade.cashAfter)}`,
      });
      setUnits("1000");
      if (onFilled) onFilled(data.trade);
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    }
    setBusy(false);
  }

  function setMaxUnits() {
    if (side === "BUY" && price && cash) setUnits(String(Math.max(1, Math.floor(cash / price))));
  }

  return (
    <div style={{ background: "#0f172a", borderRadius: 12, padding: 20, border: "1px solid #1e293b" }}>
      <div style={{ display: "flex", marginBottom: 16, borderRadius: 8, overflow: "hidden", border: "1px solid #1e293b" }}>
        {["BUY", "SELL"].map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.9rem",
              background: side === s ? (s === "BUY" ? "#10b981" : "#ef4444") : "transparent",
              color: side === s ? "#fff" : "#64748b",
              transition: "all 0.15s",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 4 }}>PAIR</label>
          <div style={{ background: "#1e293b", borderRadius: 6, padding: "8px 12px", color: "#94a3b8", fontSize: "0.85rem", fontWeight: 700 }}>
            {pair}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <label style={{ fontSize: "0.75rem", color: "#64748b" }}>UNITS</label>
            <button
              type="button"
              onClick={setMaxUnits}
              style={{
                fontSize: "0.7rem",
                background: "none",
                border: "1px solid #334155",
                color: "#94a3b8",
                borderRadius: 4,
                padding: "2px 6px",
                cursor: "pointer",
              }}
            >
              MAX
            </button>
          </div>
          <div style={{ display: "flex", background: "#1e293b", borderRadius: 6, border: "1px solid #334155" }}>
            <input
              type="number"
              min="1"
              step="1"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                padding: "10px 12px",
                color: "#f1f5f9",
                fontSize: "1rem",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid #334155" }}>
              <button
                type="button"
                onClick={() => setUnits((q) => String(Math.max(1, Number(q) + 100)))}
                style={{ flex: 1, background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "0 8px" }}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => setUnits((q) => String(Math.max(1, Number(q) - 100)))}
                style={{ flex: 1, background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "0 8px" }}
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ background: "#1e293b", borderRadius: 8, padding: "12px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.8rem" }}>
            <span style={{ color: "#64748b" }}>Executable rate</span>
            <span style={{ color: "#f1f5f9" }}>{price != null ? fmt5(price) : "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.8rem" }}>
            <span style={{ color: "#64748b" }}>Units</span>
            <span style={{ color: "#f1f5f9" }}>{unitsNum}</span>
          </div>
          <div
            style={{
              borderTop: "1px solid #334155",
              paddingTop: 8,
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.9rem",
              fontWeight: 700,
            }}
          >
            <span style={{ color: "#94a3b8" }}>Est. notional</span>
            <span style={{ color: total != null ? (side === "BUY" ? "#ef4444" : "#10b981") : "#f1f5f9" }}>{total != null ? fmtMoney(total) : "—"}</span>
          </div>
        </div>

        <div style={{ marginBottom: 12, fontSize: "0.75rem", color: "#475569" }}>
          Available cash: <strong style={{ color: "#94a3b8" }}>{fmtMoney(cash)}</strong>
        </div>

        <button
          type="submit"
          disabled={busy || (side === "BUY" ? !canBuy : !canSell)}
          style={{
            width: "100%",
            padding: "13px",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: "0.95rem",
            cursor: "pointer",
            background: side === "BUY" ? (canBuy ? "#10b981" : "#134e4a") : canSell ? "#ef4444" : "#7f1d1d",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.15s",
          }}
        >
          <Zap size={16} />
          {busy ? "Placing…" : `Place ${side}`}
        </button>
      </form>

      {toast && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 8,
            background: toast.ok ? "#052e16" : "#450a0a",
            border: `1px solid ${toast.ok ? "#10b981" : "#ef4444"}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          {toast.ok ? (
            <CheckCircle size={15} color="#10b981" style={{ marginTop: 1, flexShrink: 0 }} />
          ) : (
            <AlertCircle size={15} color="#ef4444" style={{ marginTop: 1, flexShrink: 0 }} />
          )}
          <span style={{ fontSize: "0.8rem", color: toast.ok ? "#4ade80" : "#fca5a5", lineHeight: 1.4 }}>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

function RecentForexTrades({ trades }) {
  if (!trades.length) return <p style={{ color: "#475569", fontSize: "0.85rem", textAlign: "center", padding: 20 }}>No forex trades yet.</p>;
  return (
    <div style={{ maxHeight: 260, overflowY: "auto" }}>
      {trades.slice(0, 20).map((t, i) => {
        const typ = String(t.type || "").toUpperCase();
        const isBuy = typ === "FOREX_BUY" || typ.includes("BUY");
        const label = isBuy ? "BUY" : "SELL";
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 0",
              borderBottom: "1px solid #1e293b",
              fontSize: "0.8rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  background: isBuy ? "#052e16" : "#450a0a",
                  color: isBuy ? "#4ade80" : "#fca5a5",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: "0.7rem",
                }}
              >
                {label}
              </span>
              <span style={{ color: "#f1f5f9", fontWeight: 600 }}>{t.symbol}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#f1f5f9" }}>
                {fmt2ish(t.qty)} @ {fmt5(t.price)}
              </div>
              <div style={{ color: "#475569", fontSize: "0.72rem" }}>{new Date(t.createdAt).toLocaleTimeString()}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmt2ish(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";
}

function ForexWatchItem({ item, active, onClick, priceCache }) {
  const p = priceCache[item.sym];
  const up = p?.chg >= 0;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 14px",
        background: active ? "#1e3a5f" : "transparent",
        borderLeft: `3px solid ${active ? "#38bdf8" : "transparent"}`,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "0.85rem" }}>{item.sym}</div>
          <div style={{ color: "#475569", fontSize: "0.72rem" }}>{item.name}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#f1f5f9", fontSize: "0.85rem", fontWeight: 600 }}>{p ? fmt5(p.price) : "…"}</div>
          {p?.chg != null && (
            <div
              style={{
                color: up ? "#4ade80" : "#f87171",
                fontSize: "0.7rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 2,
              }}
            >
              {up ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {Math.abs(p.chg).toFixed(2)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ForexMarketPage() {
  const { currentUser } = useAuth();
  const [active, setActive] = useState(WATCHLIST[0]);
  const [series, setSeries] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [cash, setCash] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [trades, setTrades] = useState([]);
  const [priceCache, setPriceCache] = useState({});
  const [priceRange, setPriceRange] = useState("90");
  const [source, setSource] = useState("");
  const [isFallback, setIsFallback] = useState(false);

  const loadChart = useCallback(async () => {
    const sym = active.sym;
    setLoadingChart(true);
    try {
      const data = await apiGet(`/market/forex/${encodeURIComponent(sym)}`);
      let pts = Array.isArray(data.series) ? [...data.series] : [];
      const days = priceRange === "MAX" ? pts.length : Math.max(2, Number(priceRange) || 90);
      pts = pts.slice(-days);
      setSeries(pts.map((p) => ({ time: p.time, value: Number(p.value) })).filter((p) => Number.isFinite(p.value)));
      setSource(data.source || "");
      setIsFallback(Boolean(data.providerFallback));
    } catch {
      setSeries([]);
      setSource("");
      setIsFallback(false);
    }
    setLoadingChart(false);
  }, [active.sym, priceRange]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  const loadPortfolio = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const data = await apiGet(`/portfolio/${encodeURIComponent(currentUser.id)}`);
      setCash(data.cash ?? null);
      setHoldings(Array.isArray(data.holdings) ? data.holdings : []);
      setTrades(Array.isArray(data.transactions) ? data.transactions : []);
    } catch {}
  }, [currentUser?.id]);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const updates = {};
      await Promise.allSettled(
        WATCHLIST.map(async (item) => {
          try {
            const data = await apiGet(`/market/forex/${encodeURIComponent(item.sym)}`);
            const rows = Array.isArray(data.series) ? data.series : [];
            const latestVal = data.latest?.value != null ? Number(data.latest.value) : rows.length ? Number(rows[rows.length - 1]?.value) : null;
            let chg = 0;
            if (rows.length >= 2 && latestVal != null) {
              const prev = Number(rows[rows.length - 2]?.value);
              if (prev) chg = ((latestVal - prev) / prev) * 100;
            }
            if (latestVal != null) updates[item.sym] = { price: latestVal, chg };
          } catch {}
        })
      );
      if (!cancelled) setPriceCache(updates);
    }
    fetchAll();
    const iv = setInterval(fetchAll, 60000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const latest = series.length ? series[series.length - 1]?.value ?? null : null;
  const first = series.length ? series[0]?.value ?? null : null;
  const changePct = first && latest && first !== 0 ? ((latest - first) / first) * 100 : null;
  const high = series.length ? Math.max(...series.map((p) => p.value)) : null;
  const low = series.length ? Math.min(...series.map((p) => p.value)) : null;
  const up = changePct == null ? true : changePct >= 0;

  function handleFilled(trade) {
    setTrades((prev) => [
      {
        createdAt: new Date().toISOString(),
        type: trade.side === "BUY" ? "FOREX_BUY" : "FOREX_SELL",
        symbol: trade.pair,
        qty: trade.units,
        price: trade.price,
      },
      ...prev,
    ]);
    loadPortfolio();
  }

  const forexTrades = trades.filter((t) => /FOREX/i.test(String(t.type || "")));

  return (
    <AppShell
      title="Forex Market"
      subtitle={source ? `Live quotes — ${source}${isFallback ? " (fallback)" : ""}` : "Major pairs — executable simulation"}
    >
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 300px", gap: 16, minHeight: "calc(100vh - 120px)" }}>
        <div style={{ background: "#0f172a", borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b" }}>
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #1e293b" }}>
            <h3 style={{ color: "#f1f5f9", fontSize: "0.85rem", margin: 0 }}>PAIRS</h3>
          </div>
          <div>
            {WATCHLIST.map((item) => (
              <ForexWatchItem key={item.sym} item={item} active={active.sym === item.sym} onClick={() => setActive(item)} priceCache={priceCache} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#0f172a", borderRadius: 12, padding: "20px 24px", border: "1px solid #1e293b" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ color: "#f1f5f9", margin: 0, fontSize: "1.6rem", fontWeight: 800 }}>{active.sym}</h2>
                  <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{active.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 8 }}>
                  <span style={{ fontSize: "2rem", fontWeight: 800, color: "#f1f5f9" }}>{latest != null ? fmt5(latest) : "—"}</span>
                  {changePct != null && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: up ? "#4ade80" : "#f87171", fontWeight: 700, fontSize: "1rem" }}>
                      {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      {up ? "+" : ""}
                      {changePct.toFixed(3)}%
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {["30", "60", "90", "MAX"].map((d) => (
                  <button
                    key={d}
                    onClick={() => setPriceRange(d)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      background: priceRange === d ? "#38bdf8" : "#1e293b",
                      color: priceRange === d ? "#0f172a" : "#64748b",
                    }}
                  >
                    {d === "MAX" ? "MAX" : `${d}D`}
                  </button>
                ))}
                <button
                  onClick={() => loadChart()}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    background: "#1e293b",
                    color: "#64748b",
                  }}
                  disabled={loadingChart}
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 20 }}>
              {[
                ["HIGH", high],
                ["LOW", low],
                ["OPEN", first],
                ["SOURCE", source || "—"],
              ].map(([l, v]) => (
                <div key={l} style={{ background: "#1e293b", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ color: "#475569", fontSize: "0.7rem", marginBottom: 4 }}>{l}</div>
                  <div style={{ color: "#f1f5f9", fontWeight: 700 }}>
                    {l === "SOURCE" ? String(v) : v != null ? fmt5(v) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#0f172a", borderRadius: 12, padding: 16, border: "1px solid #1e293b" }}>
            {loadingChart ? (
              <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                <RefreshCw size={20} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ marginLeft: 10 }}>Loading chart…</span>
              </div>
            ) : (
              <PriceAreaChart series={series} height={300} valueDecimals={5} />
            )}
          </div>

          <div style={{ background: "#0f172a", borderRadius: 12, border: "1px solid #1e293b" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b" }}>
              <h3 style={{ color: "#f1f5f9", fontSize: "0.85rem", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Clock size={14} color="#64748b" />
                YOUR FOREX TRADES
              </h3>
            </div>
            <div style={{ padding: "0 16px" }}>
              <RecentForexTrades trades={forexTrades} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ForexOrderPanel pair={active.sym} price={latest} cash={cash} onFilled={handleFilled} />

          <div style={{ background: "#0f172a", borderRadius: 12, border: "1px solid #1e293b" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b" }}>
              <h3 style={{ color: "#f1f5f9", fontSize: "0.85rem", margin: 0 }}>PORTFOLIO</h3>
            </div>
            <div style={{ padding: "10px 16px" }}>
              <div style={{ marginBottom: 10, fontSize: "0.8rem", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Cash</span>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>{fmtMoney(cash)}</span>
              </div>
              {holdings.length === 0 ? (
                <p style={{ color: "#334155", fontSize: "0.8rem" }}>No equity holdings (forex is cash-settled).</p>
              ) : (
                holdings.map((h) => (
                  <div
                    key={h.symbol}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderTop: "1px solid #1e293b",
                      fontSize: "0.8rem",
                    }}
                  >
                    <span style={{ color: "#94a3b8", fontWeight: 600 }}>{h.symbol}</span>
                    <span style={{ color: "#f1f5f9" }}>{Number(h.qty).toFixed(2)} units</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </AppShell>
  );
}
