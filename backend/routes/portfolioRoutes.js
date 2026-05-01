module.exports = function registerPortfolioRoutes(app, deps) {
  const { readProfileFromSheet, readTransactionsForUser, isProfileComplete, computeLedgerState } = deps;

  app.get("/api/portfolio/:userId", async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ ok: false, message: "userId is required." });

    let profile = null;
    try {
      profile = await readProfileFromSheet(userId);
    } catch {
      profile = null;
    }
    let transactions = [];
    try {
      transactions = await readTransactionsForUser(userId, { limit: 300 });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to read transactions from Google Sheet.",
        details: String(error.message || error),
      });
    }

    const ledger = computeLedgerState(transactions);
    return res.json({
      ok: true,
      profile,
      profileComplete: isProfileComplete(profile),
      cash: ledger.cash,
      holdings: ledger.holdings,
      transactions,
    });
  });
};
