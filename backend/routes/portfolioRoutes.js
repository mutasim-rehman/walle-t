module.exports = function registerPortfolioRoutes(app, deps) {
  const {
    readProfileFromSheet,
    readTransactionsForUser,
    isProfileComplete,
    computeLedgerState,
    requireAuth,
    assertSelfOrFail,
  } = deps;

  app.get("/api/portfolio/:userId", requireAuth, async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!assertSelfOrFail(req, res, userId)) return;

    let profile = null;
    try {
      profile = await readProfileFromSheet(userId);
    } catch {
      profile = null;
    }
    let transactions = [];
    try {
      transactions = await readTransactionsForUser(userId, { limit: 800 });
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
      forexPositions: ledger.forexPositions || [],
      optionPositions: ledger.optionPositions || [],
      transactions,
    });
  });
};
