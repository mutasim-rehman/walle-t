module.exports = function registerTradeRoutes(app, deps) {
  const {
    readTransactionsForUser,
    computeLedgerState,
    fetchPsxLatestPrice,
    appendTransactionRow,
    fetchForexFromProvider,
    fetchOptionsFromProvider,
    requireAuth,
    runSerial,
  } = deps;

  app.post("/api/trade", requireAuth, async (req, res) => {
    const id = req.user.id;
    const { side, symbol, qty } = req.body || {};
    const s = String(side || "").trim().toUpperCase();
    const sym = String(symbol || "").trim().toUpperCase();
    const quantity = Number(qty);
    if (!sym || !Number.isFinite(quantity) || quantity <= 0 || (s !== "BUY" && s !== "SELL")) {
      return res.status(400).json({ ok: false, message: "side(BUY/SELL), symbol, qty are required." });
    }
    if (sym.length > 32 || !/^[A-Z0-9._-]+$/.test(sym)) {
      return res.status(400).json({ ok: false, message: "Invalid symbol." });
    }

    let priceInfo = null;
    try {
      priceInfo = await fetchPsxLatestPrice(sym);
    } catch (error) {
      return res
        .status(502)
        .json({ ok: false, message: "Failed to fetch PSX price.", details: String(error.message || error) });
    }
    const price = priceInfo.price;
    const amount = price * quantity;

    try {
      const result = await runSerial(id, async () => {
        const transactions = await readTransactionsForUser(id, { limit: 800 });
        const ledger = computeLedgerState(transactions);
        const holdingQty = ledger.holdings.find((h) => h.symbol === sym)?.qty || 0;
        if (s === "BUY" && ledger.cash < amount) {
          const err = new Error("Insufficient cash for this buy order.");
          err.status = 400;
          err.payload = { cash: ledger.cash, required: amount };
          throw err;
        }
        if (s === "SELL" && holdingQty < quantity) {
          const err = new Error("Insufficient holdings for this sell order.");
          err.status = 400;
          err.payload = { holdingQty, requested: quantity };
          throw err;
        }
        const cashAfter = s === "BUY" ? ledger.cash - amount : ledger.cash + amount;
        const createdAt = new Date().toISOString();
        await appendTransactionRow({
          createdAt,
          userId: id,
          type: s,
          symbol: sym,
          qty: quantity,
          price,
          amount,
          cashAfter,
          note: "Trade executed at latest PSX close.",
          metaJson: { psxTs: priceInfo.ts, currency: "USD" },
        });
        return { createdAt, userId: id, side: s, symbol: sym, qty: quantity, price, amount, cashAfter };
      });
      return res.status(201).json({ ok: true, trade: result });
    } catch (error) {
      const status = Number(error?.status) || 500;
      return res.status(status).json({
        ok: false,
        message: error?.message || "Failed to execute trade.",
        ...(error?.payload || {}),
      });
    }
  });

  app.post("/api/trade/forex", requireAuth, async (req, res) => {
    const id = req.user.id;
    const { pair, side, units } = req.body || {};
    const asset = String(pair || "").trim().toUpperCase();
    const direction = String(side || "").trim().toUpperCase();
    const qty = Number(units);
    if (!/^[A-Z]{6}$/.test(asset) || !["BUY", "SELL"].includes(direction) || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ ok: false, message: "pair(6 letters), side(BUY/SELL), units are required." });
    }

    let mid = null;
    let source = "frankfurter";
    try {
      const quote = await fetchForexFromProvider(asset);
      mid = Number(quote?.latest?.value);
      source = quote?.source || "frankfurter";
    } catch (error) {
      return res.status(502).json({
        ok: false,
        message: "Failed to fetch executable forex quote. Live provider unavailable.",
        details: String(error.message || error),
      });
    }
    if (!Number.isFinite(mid)) {
      return res.status(502).json({ ok: false, message: "Failed to fetch executable forex quote." });
    }
    const spreadBps = 8;
    const price = direction === "BUY" ? mid * (1 + spreadBps / 10000) : mid * (1 - spreadBps / 10000);
    const amount = price * qty;

    try {
      const result = await runSerial(id, async () => {
        const transactions = await readTransactionsForUser(id, { limit: 800 });
        const ledger = computeLedgerState(transactions);
        const heldUnits = ledger.forexPositions.find((p) => p.pair === asset)?.units || 0;

        if (direction === "BUY" && ledger.cash < amount) {
          const err = new Error("Insufficient cash.");
          err.status = 400;
          err.payload = { cash: ledger.cash, required: amount };
          throw err;
        }
        if (direction === "SELL" && heldUnits < qty) {
          const err = new Error("Insufficient forex position to sell.");
          err.status = 400;
          err.payload = { held: heldUnits, requested: qty };
          throw err;
        }

        const cashAfter = direction === "BUY" ? ledger.cash - amount : ledger.cash + amount;
        const type = direction === "BUY" ? "FOREX_BUY" : "FOREX_SELL";
        const createdAt = new Date().toISOString();
        await appendTransactionRow({
          createdAt,
          userId: id,
          type,
          symbol: asset,
          qty,
          price,
          amount,
          cashAfter,
          note: `Forex execution (${source}).`,
          metaJson: { assetClass: "forex", side: direction, spreadBps, source },
        });
        return { userId: id, pair: asset, side: direction, units: qty, price, amount, cashAfter, source };
      });
      return res.status(201).json({ ok: true, trade: result });
    } catch (error) {
      const status = Number(error?.status) || 500;
      return res.status(status).json({
        ok: false,
        message: error?.message || "Failed to persist forex trade.",
        ...(error?.payload || {}),
      });
    }
  });

  app.post("/api/trade/options", requireAuth, async (req, res) => {
    const id = req.user.id;
    const { symbol, side, contractType, strike, expiry, contracts, premium } = req.body || {};
    const sym = String(symbol || "").trim().toUpperCase();
    const direction = String(side || "").trim().toUpperCase();
    const optType = String(contractType || "").trim().toUpperCase();
    const qty = Number(contracts);
    const strikeNum = Number(strike);
    const premiumNum = Number(premium);
    const lotSize = 100;
    if (
      !sym ||
      !["BUY", "SELL"].includes(direction) ||
      !["CALL", "PUT"].includes(optType) ||
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(strikeNum) ||
      !expiry
    ) {
      return res.status(400).json({
        ok: false,
        message: "symbol, side, contractType, strike, expiry, contracts are required.",
      });
    }
    if (sym.length > 16 || !/^[A-Z0-9._-]+$/.test(sym)) {
      return res.status(400).json({ ok: false, message: "Invalid symbol." });
    }

    let computedPremium = Number.isFinite(premiumNum) && premiumNum > 0 ? premiumNum : null;
    let source = "user-provided";
    try {
      const snapshot = await fetchOptionsFromProvider(sym);
      const match = snapshot.chain.find(
        (entry) => String(entry.expiry) === String(expiry) && Number(entry.strike) === Number(strikeNum)
      );
      if (match) {
        const premiumFromChain = optType === "CALL" ? match.callPremium : match.putPremium;
        if (Number.isFinite(Number(premiumFromChain)) && Number(premiumFromChain) > 0) {
          computedPremium = Number(premiumFromChain);
          source = snapshot.source || "yahoo";
        }
      }
    } catch {
      // provider failure: fall back to user-provided premium if any
    }
    if (!Number.isFinite(computedPremium) || computedPremium <= 0) {
      return res
        .status(502)
        .json({ ok: false, message: "Could not determine option premium. Provide a premium or retry later." });
    }

    const optionSymbol = `${sym}_${expiry}_${strikeNum}_${optType}`;
    const amount = computedPremium * qty * lotSize;

    try {
      const result = await runSerial(id, async () => {
        const transactions = await readTransactionsForUser(id, { limit: 800 });
        const ledger = computeLedgerState(transactions);
        const heldContracts = ledger.optionPositions.find((p) => p.symbol === optionSymbol)?.contracts || 0;

        if (direction === "BUY" && ledger.cash < amount) {
          const err = new Error("Insufficient cash.");
          err.status = 400;
          err.payload = { cash: ledger.cash, required: amount };
          throw err;
        }
        if (direction === "SELL" && heldContracts < qty) {
          const err = new Error("Insufficient option position to sell.");
          err.status = 400;
          err.payload = { held: heldContracts, requested: qty };
          throw err;
        }

        const cashAfter = direction === "BUY" ? ledger.cash - amount : ledger.cash + amount;
        const createdAt = new Date().toISOString();
        await appendTransactionRow({
          createdAt,
          userId: id,
          type: direction === "BUY" ? "OPTION_BUY" : "OPTION_SELL",
          symbol: optionSymbol,
          qty,
          price: computedPremium,
          amount,
          cashAfter,
          note: `Option premium execution (${source}).`,
          metaJson: {
            assetClass: "option",
            underlying: sym,
            expiry,
            strike: strikeNum,
            optionType: optType,
            lotSize,
            source,
          },
        });
        return {
          userId: id,
          symbol: sym,
          side: direction,
          contractType: optType,
          strike: strikeNum,
          expiry,
          contracts: qty,
          premium: computedPremium,
          amount,
          cashAfter,
          source,
        };
      });
      return res.status(201).json({ ok: true, trade: result });
    } catch (error) {
      const status = Number(error?.status) || 500;
      return res.status(status).json({
        ok: false,
        message: error?.message || "Failed to persist options trade.",
        ...(error?.payload || {}),
      });
    }
  });
};
