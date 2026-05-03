const ADVISOR_MAX_MESSAGE_LENGTH = 4000;

module.exports = function registerAdvisorRoutes(app, deps) {
  const {
    getGeminiClient,
    readUsersFromSheet,
    checkAndConsumeAdvisorPrompt,
    formatDurationMs,
    ADVISOR_MIN_INTERVAL_MS,
    ADVISOR_MAX_IN_WINDOW,
    ADVISOR_WINDOW_MS,
    readActivities,
    buildPortfolioSummary,
    readProfileFromSheet,
    readTransactionsForUser,
    computeLedgerState,
    buildFinancialProfileSummary,
    buildLedgerSummary,
    isProfileComplete,
    extractGroundingSources,
    isGeminiQuotaError,
    classifyGeminiError,
    GEMINI_MODEL,
    requireAuth,
  } = deps;

  app.post("/api/advisor", requireAuth, async (req, res) => {
    const { message } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ ok: false, message: "message is required." });
    }
    const trimmedMessage = String(message).trim();
    if (trimmedMessage.length > ADVISOR_MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        ok: false,
        message: `Message is too long. Maximum is ${ADVISOR_MAX_MESSAGE_LENGTH} characters.`,
      });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(500).json({
        ok: false,
        message: "Gemini API key is missing. Set GEMINI_API_KEY in the backend environment.",
      });
    }

    let users = [];
    try {
      users = await readUsersFromSheet();
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to read users from Google Sheet.",
        details: String(error.message || error),
      });
    }

    const user = users.find((entry) => entry.id === req.user.id);
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    const advisorQuota = checkAndConsumeAdvisorPrompt(user.id);
    if (!advisorQuota.allowed) {
      return res.status(429).json({
        ok: false,
        message: `${advisorQuota.message} Try again in ${formatDurationMs(advisorQuota.retryAfterMs)}.`,
        retryAfterSec: advisorQuota.retryAfterSec,
        lock: {
          minIntervalMs: ADVISOR_MIN_INTERVAL_MS,
          maxPrompts: ADVISOR_MAX_IN_WINDOW,
          windowMs: ADVISOR_WINDOW_MS,
        },
      });
    }

    const activities = readActivities()
      .filter((activity) => activity.userId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const portfolio = buildPortfolioSummary(activities);

    let profile = null;
    try {
      profile = await readProfileFromSheet(user.id);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to read profile from Google Sheet.",
        details: String(error.message || error),
      });
    }

    let transactions = [];
    try {
      transactions = await readTransactionsForUser(user.id, { limit: 400 });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to read transactions from Google Sheet.",
        details: String(error.message || error),
      });
    }

    const ledger = computeLedgerState(transactions);
    const financialProfile = buildFinancialProfileSummary(profile);
    const ledgerSummary = buildLedgerSummary(transactions, ledger);
    const today = new Date().toISOString().slice(0, 10);
    const prompt = [
      "You are Walle-T's financial advisor chatbot for an educational trading simulator.",
      "Give practical financial guidance based on this user's current portfolio, transactions, and balance sheet.",
      "Use current affairs when relevant by grounding with Google Search.",
      "Do not claim certainty or guaranteed returns, and clearly label assumptions.",
      "This is educational analysis, not professional financial advice.",
      "",
      `Date: ${today}`,
      `User: ${user.username}`,
      "",
      "Saved activity context:",
      portfolio.summary,
      "",
      "Financial profile context:",
      financialProfile.summary,
      "",
      "Current simulated portfolio + transactions context:",
      ledgerSummary,
      "",
      "User question:",
      trimmedMessage,
      "",
      "Answer format:",
      "1. Short answer",
      "2. Portfolio observations (holdings, cashflow, concentration)",
      "3. Assets/liabilities implications",
      "4. Current-affairs impact",
      "5. Concrete next actions (3-5 bullets)",
    ].join("\n");

    try {
      let response = null;
      try {
        response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            temperature: 0.3,
            tools: [{ googleSearch: {} }],
          },
        });
      } catch (searchError) {
        if (!isGeminiQuotaError(searchError)) throw searchError;
        response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            temperature: 0.3,
          },
        });
      }

      return res.json({
        ok: true,
        reply: String(response?.text || "").trim(),
        model: GEMINI_MODEL,
        portfolio,
        profileComplete: isProfileComplete(profile),
        financialProfile: {
          assetsTotal: financialProfile.assetsTotal,
          liabilitiesTotal: financialProfile.liabilitiesTotal,
          cash: ledger.cash,
          holdingsCount: ledger.holdings.length,
        },
        sources: extractGroundingSources(response),
      });
    } catch (error) {
      console.error("Advisor request failed:", error?.message || error);
      const classified = classifyGeminiError(error);
      return res.status(classified.status).json({
        ok: false,
        message: classified.message,
      });
    }
  });
};
