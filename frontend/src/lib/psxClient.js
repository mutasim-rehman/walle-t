import { apiGet } from "./api";

/**
 * PSX EOD rows: array of [unixSeconds, price, ...]
 * In dev, use Vite `/psx` proxy (no backend required). In prod, use API rewrite to backend.
 */
export async function fetchPsxEodRows(symbol) {
  const sym = encodeURIComponent(String(symbol || "").trim());
  if (!sym) return [];

  if (import.meta.env.DEV) {
    const res = await fetch(`/psx/timeseries/eod/${sym}`);
    if (!res.ok) throw new Error(`PSX EOD failed (${res.status})`);
    const payload = await res.json();
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  const payload = await apiGet(`/market/psx/eod/${sym}`);
  return Array.isArray(payload?.data) ? payload.data : [];
}

/** intraday `int` or daily `eod` — same dev/prod split as above */
export async function fetchPsxTimeseriesRows(type, symbol) {
  const sym = encodeURIComponent(String(symbol || "").trim());
  const t = String(type || "eod").toLowerCase() === "int" ? "int" : "eod";
  if (!sym) return [];

  if (import.meta.env.DEV) {
    const res = await fetch(`/psx/timeseries/${t}/${sym}`);
    if (!res.ok) throw new Error(`PSX ${t} failed (${res.status})`);
    const payload = await res.json();
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  const payload = await apiGet(`/market/psx/timeseries/${t}/${sym}`);
  return Array.isArray(payload?.data) ? payload.data : [];
}

export function priceTickFromRows(rows) {
  if (!rows || rows.length < 2) return null;
  const [prevRow, lastRow] = rows.slice(-2);
  const last = Number(lastRow?.[1]);
  const prev = Number(prevRow?.[1]);
  if (!Number.isFinite(last)) return null;
  const chg = prev ? ((last - prev) / prev) * 100 : 0;
  return { price: last, chg };
}

/** Run async tasks with max concurrency (defaults avoid stampedes). */
export async function runPool(items, concurrency, iterator) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await iterator(items[i], i);
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
