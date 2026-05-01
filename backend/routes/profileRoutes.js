module.exports = function registerProfileRoutes(app, deps) {
  const { readProfileFromSheet, isProfileComplete, upsertProfileToSheet } = deps;

  app.get("/api/profile/:userId", (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ ok: false, message: "userId is required." });
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

  app.post("/api/profile/:userId", (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ ok: false, message: "userId is required." });
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

    upsertProfileToSheet(profile)
      .then(() => res.json({ ok: true, profile, isComplete: isProfileComplete(profile) }))
      .catch((error) =>
        res.status(500).json({
          ok: false,
          message:
            "Failed to store profile in Google Sheet. Ensure the Transactional_History spreadsheet is shared with your service account email.",
          details: String(error.message || error),
        })
      );
  });
};
