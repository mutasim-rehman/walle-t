module.exports = function registerActivitiesRoutes(app, deps) {
  const { readActivities, writeActivities, readUsersFromSheet, crypto } = deps;

  app.get("/api/activities/:userId", (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) {
      return res.status(400).json({ ok: false, message: "userId is required." });
    }

    const activities = readActivities();
    const userActivities = activities.filter((a) => a.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json({ ok: true, activities: userActivities });
  });

  app.post("/api/activities", async (req, res) => {
    const { userId, symbol, activityType, budget, note } = req.body || {};
    if (!userId || !symbol || !activityType) {
      return res.status(400).json({
        ok: false,
        message: "userId, symbol, and activityType are required.",
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
    const user = users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    const activities = readActivities();
    const activity = {
      id: crypto.randomUUID(),
      userId,
      symbol: String(symbol).trim().toUpperCase(),
      activityType: String(activityType).trim(),
      budget: budget === "" || budget == null || Number.isNaN(Number(budget)) ? null : Number(budget),
      note: note ? String(note).trim() : "",
      createdAt: new Date().toISOString(),
    };

    activities.push(activity);
    writeActivities(activities);
    return res.status(201).json({ ok: true, activity });
  });
};
