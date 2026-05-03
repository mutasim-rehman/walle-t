module.exports = function registerSettingsRoutes(app, deps) {
  const { readProfileFromSheet, upsertProfileToSheet, requireAuth, assertSelfOrFail, runSerial } = deps;

  app.get("/api/settings/:userId", requireAuth, async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!assertSelfOrFail(req, res, userId)) return;
    let profile = null;
    try {
      profile = await readProfileFromSheet(userId);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to read settings from Google Sheet.",
        details: String(error.message || error),
      });
    }
    const settings = profile?.extras?.settings || {
      currency: "USD",
      timezone: "UTC",
      riskMode: "moderate",
      notifications: true,
    };
    return res.json({ ok: true, settings });
  });

  app.post("/api/settings/:userId", requireAuth, async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!assertSelfOrFail(req, res, userId)) return;
    const incoming = req.body?.settings && typeof req.body.settings === "object" ? req.body.settings : {};

    try {
      const settings = await runSerial(userId, async () => {
        let profile = null;
        try {
          profile = await readProfileFromSheet(userId);
        } catch {
          profile = null;
        }
        const nextProfile = {
          userId,
          age: profile?.age ?? null,
          country: profile?.country || "",
          monthlyIncome: profile?.monthlyIncome ?? null,
          monthlyExpenses: profile?.monthlyExpenses ?? null,
          currentCash: profile?.currentCash ?? null,
          assets: profile?.assets || {},
          liabilities: profile?.liabilities || {},
          extras: {
            ...(profile?.extras || {}),
            settings: {
              currency: String(incoming.currency || profile?.extras?.settings?.currency || "USD"),
              timezone: String(incoming.timezone || profile?.extras?.settings?.timezone || "UTC"),
              riskMode: String(incoming.riskMode || profile?.extras?.settings?.riskMode || "moderate"),
              notifications:
                typeof incoming.notifications === "boolean"
                  ? incoming.notifications
                  : Boolean(profile?.extras?.settings?.notifications ?? true),
            },
          },
          updatedAt: new Date().toISOString(),
          createdAt: profile?.createdAt || new Date().toISOString(),
        };
        await upsertProfileToSheet(nextProfile);
        return nextProfile.extras.settings;
      });
      return res.json({ ok: true, settings });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to save settings to Google Sheet.",
        details: String(error.message || error),
      });
    }
  });
};
