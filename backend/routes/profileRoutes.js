module.exports = function registerProfileRoutes(app, deps) {
  const { readProfileFromSheet, isProfileComplete, upsertProfileToSheet, requireAuth, assertSelfOrFail, runSerial } = deps;

  app.get("/api/profile/:userId", requireAuth, (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!assertSelfOrFail(req, res, userId)) return;
    readProfileFromSheet(userId)
      .then((profile) => res.json({ ok: true, profile, isComplete: isProfileComplete(profile) }))
      .catch((error) =>
        res.status(500).json({
          ok: false,
          message:
            "Failed to read profile from Google Sheet. Ensure the Transactional_History spreadsheet is shared with your service account email.",
          details: String(error.message || error),
        })
      );
  });

  app.post("/api/profile/:userId", requireAuth, async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!assertSelfOrFail(req, res, userId)) return;
    const body = req.body || {};

    const profile = {
      userId,
      age: body.age == null || body.age === "" ? null : Number(body.age),
      country: String(body.country || "").trim(),
      monthlyIncome: body.monthlyIncome == null || body.monthlyIncome === "" ? null : Number(body.monthlyIncome),
      monthlyExpenses: body.monthlyExpenses == null || body.monthlyExpenses === "" ? null : Number(body.monthlyExpenses),
      currentCash: body.currentCash == null || body.currentCash === "" ? null : Number(body.currentCash),
      assets: body.assets && typeof body.assets === "object" ? body.assets : {},
      liabilities: body.liabilities && typeof body.liabilities === "object" ? body.liabilities : {},
      extras: body.extras && typeof body.extras === "object" ? body.extras : {},
      updatedAt: new Date().toISOString(),
      createdAt: body.createdAt || new Date().toISOString(),
    };

    try {
      await runSerial(userId, () => upsertProfileToSheet(profile));
      return res.json({ ok: true, profile, isComplete: isProfileComplete(profile) });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message:
          "Failed to store profile in Google Sheet. Ensure the Transactional_History spreadsheet is shared with your service account email.",
        details: String(error.message || error),
      });
    }
  });
};
