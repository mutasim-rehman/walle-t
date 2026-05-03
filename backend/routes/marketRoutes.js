module.exports = function registerMarketRoutes(app, deps) {
  const { fetchForexFromProvider, hashString, generateSyntheticSeries, fetchOptionsFromProvider, fetchPsxTimeseriesPayload } = deps;

  app.get("/api/market/psx/eod/:symbol", async (req, res) => {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();
    if (!symbol) return res.status(400).json({ ok: false, message: "symbol is required." });
    try {
      const payload = await fetchPsxTimeseriesPayload("eod", symbol);
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      return res.json({ ok: true, data: rows });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        message: "Failed to fetch PSX series.",
        details: String(error.message || error),
      });
    }
  });

  app.get("/api/market/psx/timeseries/:type/:symbol", async (req, res) => {
    const type = String(req.params.type || "").toLowerCase();
    const symbol = String(req.params.symbol || "").trim().toUpperCase();
    if (!symbol || !["eod", "int"].includes(type)) {
      return res.status(400).json({ ok: false, message: "symbol and type (eod|int) are required." });
    }
    try {
      const payload = await fetchPsxTimeseriesPayload(type, symbol);
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      return res.json({ ok: true, data: rows });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        message: "Failed to fetch PSX series.",
        details: String(error.message || error),
      });
    }
  });

  app.get("/api/market/forex/:pair", async (req, res) => {
    const pair = String(req.params.pair || "").trim().toUpperCase();
    if (!/^[A-Z]{6}$/.test(pair)) {
      return res.status(400).json({ ok: false, message: "pair must be 6 letters, e.g. EURUSD" });
    }
    try {
      const data = await fetchForexFromProvider(pair);
      return res.json({ ok: true, ...data, providerFallback: false });
    } catch (error) {
      const start = 1 + (hashString(pair) % 50) / 100;
      const series = generateSyntheticSeries(`forex:${pair}`, { points: 160, start, volatility: 0.0015 });
      return res.json({
        ok: true,
        pair,
        series,
        latest: series[series.length - 1],
        source: "synthetic-fallback",
        providerFallback: true,
        details: String(error.message || error),
      });
    }
  });

  app.get("/api/market/options/:symbol", async (req, res) => {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();
    if (!symbol) return res.status(400).json({ ok: false, message: "symbol is required." });
    try {
      const data = await fetchOptionsFromProvider(symbol);
      return res.json({ ok: true, ...data, providerFallback: false });
    } catch (error) {
      const seed = hashString(symbol);
      const spot = 80 + (seed % 400) / 5;
      const expiries = [14, 30, 60].map((d) => {
        const dt = new Date();
        dt.setDate(dt.getDate() + d);
        return dt.toISOString().slice(0, 10);
      });
      const strikes = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15].map((p) => Number((spot * (1 + p)).toFixed(2)));
      const chain = [];
      for (const expiry of expiries) {
        for (const strike of strikes) {
          const moneyness = Math.abs((strike - spot) / spot);
          const timeValue = Math.max(0.5, (60 - Math.abs(new Date(expiry) - Date.now()) / (1000 * 60 * 60 * 24)) * 0.03);
          const basePremium = Math.max(0.2, spot * (0.015 + moneyness * 0.2) + timeValue);
          const callPremium = Number(basePremium.toFixed(2));
          const putPremium = Number((basePremium * (0.95 + moneyness)).toFixed(2));
          chain.push({
            symbol,
            expiry,
            strike,
            callPremium,
            putPremium,
          });
        }
      }
      const series = generateSyntheticSeries(`options:${symbol}`, { points: 140, start: spot, volatility: 0.0035 });
      return res.json({
        ok: true,
        symbol,
        spot: Number(spot.toFixed(2)),
        chain,
        series,
        source: "synthetic-fallback",
        providerFallback: true,
        details: String(error.message || error),
      });
    }
  });
};
