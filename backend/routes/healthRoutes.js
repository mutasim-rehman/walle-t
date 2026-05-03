module.exports = function registerHealthRoutes(app, deps) {
  const { getGoogleConfig, getTransactionalSheetConfig, getProfilesSheetConfig, getGeminiClient, GEMINI_MODEL, requireAdmin } = deps;

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.get("/api/health/deep", requireAdmin, (_req, res) => {
    const cfg = getGoogleConfig();
    const txCfg = getTransactionalSheetConfig();
    const profileCfg = getProfilesSheetConfig();
    res.json({
      ok: true,
      time: new Date().toISOString(),
      sheetIdPresent: Boolean(cfg.sheetId),
      serviceEmailPresent: Boolean(cfg.clientEmail),
      privateKeyPresent: Boolean(cfg.privateKey),
      transactionalSheetIdPresent: Boolean(txCfg.sheetId),
      transactionalSheetName: txCfg.sheetName,
      profilesSheetName: profileCfg.sheetName,
      geminiConfigured: Boolean(getGeminiClient()),
      geminiModel: GEMINI_MODEL,
      sheetName: cfg.sheetName || "(auto)",
    });
  });
};
