module.exports = function registerOnboardingRoutes(app, deps) {
  const {
    readProfileFromSheet,
    upsertProfileToSheet,
    readTransactionsForUser,
    computeLedgerState,
    DEFAULT_STARTING_INVESTMENT_USD,
    appendTransactionRow,
    isProfileComplete,
  } = deps;

  app.post("/api/onboarding/complete", async (req, res) => {
    const { userId, profile: rawProfile, initialHoldings } = req.body || {};
    const id = String(userId || "").trim();
    if (!id) return res.status(400).json({ ok: false, message: "userId is required." });

    const profilePayload = rawProfile && typeof rawProfile === "object" ? rawProfile : {};
    let existingProfile = null;
    try {
      existingProfile = await readProfileFromSheet(id);
    } catch {
      existingProfile = null;
    }
    const nextProfile = {
      userId: id,
      age: profilePayload.age == null || profilePayload.age === "" ? null : Number(profilePayload.age),
      country: String(profilePayload.country || "").trim(),
      monthlyIncome: profilePayload.monthlyIncome == null || profilePayload.monthlyIncome === "" ? null : Number(profilePayload.monthlyIncome),
      monthlyExpenses: profilePayload.monthlyExpenses == null || profilePayload.monthlyExpenses === "" ? null : Number(profilePayload.monthlyExpenses),
      currentCash: profilePayload.currentCash == null || profilePayload.currentCash === "" ? null : Number(profilePayload.currentCash),
      assets: profilePayload.assets && typeof profilePayload.assets === "object" ? profilePayload.assets : {},
      liabilities: profilePayload.liabilities && typeof profilePayload.liabilities === "object" ? profilePayload.liabilities : {},
      extras: profilePayload.extras && typeof profilePayload.extras === "object" ? profilePayload.extras : {},
      updatedAt: new Date().toISOString(),
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
    };
    try {
      await upsertProfileToSheet(nextProfile);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message:
          "Failed to store profile in Google Sheet. Ensure the Transactional_History spreadsheet is shared with your service account email.",
        details: String(error.message || error),
      });
    }

    let existing = [];
    try {
      existing = await readTransactionsForUser(id, { limit: 500 });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message:
          "Failed to read transactions from Google Sheet. Ensure the Transactional_History spreadsheet is shared with your service account email.",
        details: String(error.message || error),
      });
    }

    const hasDeposit = existing.some((tx) => String(tx.type || "").toUpperCase() === "DEPOSIT");
    let cashAfter = computeLedgerState(existing).cash;
    const createdAt = new Date().toISOString();

    try {
      if (!hasDeposit) {
        cashAfter += DEFAULT_STARTING_INVESTMENT_USD;
        await appendTransactionRow({
          createdAt,
          userId: id,
          type: "DEPOSIT",
          symbol: "",
          qty: "",
          price: "",
          amount: DEFAULT_STARTING_INVESTMENT_USD,
          cashAfter,
          note: "Default starting investment (no payment gateway).",
          metaJson: { currency: "USD" },
        });
      }

      const holdings = Array.isArray(initialHoldings) ? initialHoldings : [];
      for (const h of holdings) {
        const symbol = String(h?.symbol || "").trim().toUpperCase();
        const qty = h?.qty == null || h?.qty === "" ? null : Number(h.qty);
        if (!symbol || !Number.isFinite(qty) || qty <= 0) continue;
        await appendTransactionRow({
          createdAt,
          userId: id,
          type: "PORTFOLIO_IMPORT",
          symbol,
          qty,
          price: "",
          amount: "",
          cashAfter: "",
          note: "Imported initial portfolio holding.",
          metaJson: { source: "onboarding" },
        });
      }
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to write onboarding transactions to Google Sheet.",
        details: String(error.message || error),
      });
    }

    return res.json({ ok: true, profile: nextProfile, isComplete: isProfileComplete(nextProfile) });
  });
};
