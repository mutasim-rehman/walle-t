module.exports = function registerRiskRoutes(app, deps) {
  const { readTransactionsForUser, clamp } = deps;

  app.get("/api/risk/:userId", async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ ok: false, message: "userId is required." });
    let transactions = [];
    try {
      transactions = await readTransactionsForUser(userId, { limit: 1200 });
    } catch (error) {
      return res.status(500).json({ ok: false, message: "Failed to read transactions.", details: String(error.message || error) });
    }
    const byAsset = { stock: 0, forex: 0, option: 0, other: 0 };
    const bySymbolAmount = new Map();
    for (const tx of transactions) {
      const assetClass =
        tx.metaJson?.assetClass ||
        (String(tx.type || "").includes("FOREX")
          ? "forex"
          : String(tx.type || "").includes("OPTION")
            ? "option"
            : ["BUY", "SELL", "PORTFOLIO_IMPORT"].includes(String(tx.type || "").toUpperCase())
              ? "stock"
              : "other");
      const amount = Math.abs(Number(tx.amount || 0));
      if (!Number.isFinite(amount)) continue;
      if (!byAsset[assetClass]) byAsset[assetClass] = 0;
      byAsset[assetClass] += amount;
      const s = String(tx.symbol || "UNKNOWN");
      bySymbolAmount.set(s, (bySymbolAmount.get(s) || 0) + amount);
    }
    const totalExposure = Object.values(byAsset).reduce((a, b) => a + b, 0);
    const topSymbols = [...bySymbolAmount.entries()]
      .map(([symbol, exposure]) => ({ symbol, exposure }))
      .sort((a, b) => b.exposure - a.exposure)
      .slice(0, 5);
    const concentration = topSymbols.length ? topSymbols[0].exposure / Math.max(1, totalExposure) : 0;
    const riskScore = clamp(
      Math.round(
        100 - concentration * 55 - (byAsset.option / Math.max(1, totalExposure)) * 20 - (byAsset.forex / Math.max(1, totalExposure)) * 10
      ),
      15,
      95
    );
    return res.json({
      ok: true,
      risk: {
        score: riskScore,
        totalExposure,
        concentration: Number((concentration * 100).toFixed(2)),
        assetMix: Object.fromEntries(Object.entries(byAsset).map(([k, v]) => [k, Number(v.toFixed(2))])),
        topSymbols,
        shocks: {
          equityMinus10Pct: Number((totalExposure * 0.1).toFixed(2)),
          fxMinus5Pct: Number((byAsset.forex * 0.05).toFixed(2)),
          volSpikeOptionsMinus20Pct: Number((byAsset.option * 0.2).toFixed(2)),
        },
      },
    });
  });
};
