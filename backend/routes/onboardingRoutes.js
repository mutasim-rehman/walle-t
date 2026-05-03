const STARTING_DEPOSIT_KEY = "starting-deposit";

function hasStartingDeposit(transactions) {
  return Array.isArray(transactions)
    ? transactions.some(
        (tx) =>
          String(tx?.metaJson?.idempotencyKey || "") === STARTING_DEPOSIT_KEY ||
          String(tx?.type || "").toUpperCase() === "DEPOSIT"
      )
    : false;
}

module.exports = function registerOnboardingRoutes(app, deps) {
  const {
    readProfileFromSheet,
    upsertProfileToSheet,
    readTransactionsForUser,
    computeLedgerState,
    DEFAULT_STARTING_INVESTMENT_USD,
    appendTransactionRow,
    isProfileComplete,
    requireAuth,
    runSerial,
  } = deps;

  app.post("/api/onboarding/complete", requireAuth, async (req, res) => {
    const id = req.user.id;
    const { profile: rawProfile, initialHoldings } = req.body || {};

    const profilePayload = rawProfile && typeof rawProfile === "object" ? rawProfile : {};

    try {
      const result = await runSerial(id, async () => {
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
          monthlyIncome:
            profilePayload.monthlyIncome == null || profilePayload.monthlyIncome === ""
              ? null
              : Number(profilePayload.monthlyIncome),
          monthlyExpenses:
            profilePayload.monthlyExpenses == null || profilePayload.monthlyExpenses === ""
              ? null
              : Number(profilePayload.monthlyExpenses),
          currentCash:
            profilePayload.currentCash == null || profilePayload.currentCash === "" ? null : Number(profilePayload.currentCash),
          assets: profilePayload.assets && typeof profilePayload.assets === "object" ? profilePayload.assets : {},
          liabilities:
            profilePayload.liabilities && typeof profilePayload.liabilities === "object" ? profilePayload.liabilities : {},
          extras: profilePayload.extras && typeof profilePayload.extras === "object" ? profilePayload.extras : {},
          updatedAt: new Date().toISOString(),
          createdAt: existingProfile?.createdAt || new Date().toISOString(),
        };

        await upsertProfileToSheet(nextProfile);

        const existing = await readTransactionsForUser(id, { limit: 500 });
        let cashAfter = computeLedgerState(existing).cash;
        const createdAt = new Date().toISOString();

        if (!hasStartingDeposit(existing)) {
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
            metaJson: { currency: "USD", idempotencyKey: STARTING_DEPOSIT_KEY },
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
        return nextProfile;
      });

      return res.json({ ok: true, profile: result, isComplete: isProfileComplete(result) });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to complete onboarding.",
        details: String(error.message || error),
      });
    }
  });
};
