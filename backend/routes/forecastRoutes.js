module.exports = function registerForecastRoutes(app, deps) {
  const {
    readProfileFromSheet,
    isProfileComplete,
    readTransactionsForUser,
    computeLedgerState,
    priceHoldings,
    buildNetWorthProjection,
    getGeminiClient,
    GEMINI_MODEL,
  } = deps;

  app.post("/api/forecast", async (req, res) => {
    const { userId } = req.body || {};
    const id = String(userId || "").trim();
    if (!id) return res.status(400).json({ ok: false, message: "userId is required." });

    let profile = null;
    try {
      profile = await readProfileFromSheet(id);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to read profile from Google Sheet.",
        details: String(error.message || error),
      });
    }
    if (!isProfileComplete(profile)) {
      return res.status(400).json({ ok: false, message: "Profile is incomplete. Complete onboarding first." });
    }

    let transactions = [];
    try {
      transactions = await readTransactionsForUser(id, { limit: 800 });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to read transactions from Google Sheet.",
        details: String(error.message || error),
      });
    }
    const ledger = computeLedgerState(transactions);
    const priced = await priceHoldings(ledger.holdings);

    const otherAssetsTotal = Number(profile?.assets?.total || 0) || 0;
    const otherLiabilitiesTotal = Number(profile?.liabilities?.total || 0) || 0;
    const cashOutsidePortfolio = Number(profile.currentCash || 0) || 0;
    const netWorthNow = cashOutsidePortfolio + ledger.cash + priced.totalValue + otherAssetsTotal - otherLiabilitiesTotal;
    const monthlyNetCashflow = (Number(profile.monthlyIncome || 0) || 0) - (Number(profile.monthlyExpenses || 0) || 0);
    const investableNow = ledger.cash + priced.totalValue;

    const base = buildNetWorthProjection({
      baseNetWorthNow: netWorthNow,
      monthlyNetCashflow,
      investableNow,
      annualReturn: 0.06,
      expenseShock: 0,
    });
    const best = buildNetWorthProjection({
      baseNetWorthNow: netWorthNow,
      monthlyNetCashflow,
      investableNow,
      annualReturn: 0.09,
      expenseShock: 0,
    });
    const worst = buildNetWorthProjection({
      baseNetWorthNow: netWorthNow,
      monthlyNetCashflow,
      investableNow,
      annualReturn: 0.03,
      expenseShock: 0.15,
    });

    let narrative = "";
    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = [
          "You are a financial future simulator assistant for an MVP app.",
          "Summarize the forecast results clearly as best/base/worst scenarios.",
          "Be realistic: no guaranteed returns, mention uncertainty and key drivers.",
          "Return 6-10 bullet points, each 1-2 sentences.",
          "",
          `User monthly income: ${Number(profile.monthlyIncome).toFixed(2)}`,
          `User monthly expenses: ${Number(profile.monthlyExpenses).toFixed(2)}`,
          `Net worth now: ${netWorthNow.toFixed(2)}`,
          `Investable now (cash+portfolio): ${investableNow.toFixed(2)}`,
          `Other assets total: ${otherAssetsTotal.toFixed(2)}`,
          `Other liabilities total: ${otherLiabilitiesTotal.toFixed(2)}`,
          "",
          `Base net worth in 10y: ${base[base.length - 1].value}`,
          `Best net worth in 10y: ${best[best.length - 1].value}`,
          `Worst net worth in 10y: ${worst[worst.length - 1].value}`,
        ].join("\n");

        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: { temperature: 0.3 },
        });
        narrative = String(response?.text || "").trim();
      } catch {
        narrative = "";
      }
    }

    return res.json({
      ok: true,
      now: {
        netWorth: netWorthNow,
        investable: investableNow,
        cashOutsidePortfolio,
        ledgerCash: ledger.cash,
        portfolioValue: priced.totalValue,
        otherAssetsTotal,
        otherLiabilitiesTotal,
        monthlyNetCashflow,
        positions: priced.positions,
      },
      series: { best, base, worst },
      narrative,
    });
  });
};
