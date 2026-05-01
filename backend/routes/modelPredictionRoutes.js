module.exports = function registerModelPredictionRoutes(app, deps) {
  const { readModelPredictions } = deps;

  app.get("/api/model-prediction/:symbol", (req, res) => {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();
    if (!symbol) return res.status(400).json({ ok: false, message: "symbol is required." });

    const modelData = readModelPredictions();
    if (!modelData) {
      return res.status(404).json({
        ok: false,
        message:
          "Model predictions are not available yet. Run `python train_psx_model.py` to generate backend/data/psx_model_symbol_predictions.json.",
      });
    }

    const prediction = modelData.predictions.find((row) => String(row?.symbol || "").trim().toUpperCase() === symbol);
    if (!prediction) {
      return res.status(404).json({
        ok: false,
        message: `No model prediction found for symbol ${symbol}.`,
      });
    }

    return res.json({
      ok: true,
      symbol,
      prediction,
      model: modelData.model,
      threshold: modelData.threshold,
      generatedAt: modelData.generated_at,
    });
  });
};
