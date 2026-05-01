module.exports = function registerHealthRoutes(app, deps) {
  const {
    getGoogleConfig,
    getTransactionalSheetConfig,
    getProfilesSheetConfig,
    getGeminiClient,
    GEMINI_MODEL,
  } = deps;

  app.get("/api/health", (_req, res) => {
    const cfg = getGoogleConfig();
    const txCfg = getTransactionalSheetConfig();
    const profileCfg = getProfilesSheetConfig();
    res.json({
      ok: true,
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
