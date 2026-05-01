module.exports = function registerTradeRoutes(app, deps) {
  const {
    readTransactionsForUser,
    computeLedgerState,
    fetchPsxLatestPrice,
    appendTransactionRow,
    fetchForexFromProvider,
    hashString,
    generateSyntheticSeries,
    fetchOptionsFromProvider,
  } = deps;

  app.post("/api/trade", async (req, res) => {
    const { userId, side, symbol, qty } = req.body || {};
    const id = String(userId || "").trim();
    const s = String(side || "").trim().toUpperCase();
    const sym = String(symbol || "").trim().toUpperCase();
    const quantity = Number(qty);
    if (!id || !sym || !Number.isFinite(quantity) || quantity <= 0 || (s !== "BUY" && s !== "SELL")) {
      return res.status(400).json({ ok: false, message: "userId, side(BUY/SELL), symbol, qty are required." });
    }

    let transactions = [];
    try {
      transactions = await readTransactionsForUser(id, { limit: 800 });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to read transactions from Google Sheet.",
        details: String(error.message || error),
      });
    }
    const ledger = computeLedgerState(transactions);

    let priceInfo = null;
    try {
      priceInfo = await fetchPsxLatestPrice(sym);
    } catch (error) {
      return res.status(502).json({ ok: false, message: "Failed to fetch PSX price.", details: String(error.message || error) });
    }
    const price = priceInfo.price;
    const amount = price * quantity;

    const holdingQty = ledger.holdings.find((h) => h.symbol === sym)?.qty || 0;
    if (s === "BUY" && ledger.cash < amount) {
      return res.status(400).json({ ok: false, message: "Insufficient cash for this buy order.", cash: ledger.cash, required: amount });
    }
    if (s === "SELL" && holdingQty < quantity) {
      return res.status(400).json({ ok: false, message: "Insufficient holdings for this sell order.", holdingQty, requested: quantity });
    }

    const cashAfter = s === "BUY" ? ledger.cash - amount : ledger.cash + amount;
    const createdAt = new Date().toISOString();
    try {
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
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to store trade in transaction sheet.",
        details: String(error.message || error),
      });
    }

    return res.status(201).json({ ok: true, trade: { createdAt, userId: id, side: s, symbol: sym, qty: quantity, price, amount, cashAfter } });
  });

  app.post("/api/trade/forex", async (req, res) => {
    const { userId, pair, side, units } = req.body || {};
    const id = String(userId || "").trim();
    const asset = String(pair || "").trim().toUpperCase();
    const direction = String(side || "").trim().toUpperCase();
    const qty = Number(units);
    if (!id || !/^[A-Z]{6}$/.test(asset) || !["BUY", "SELL"].includes(direction) || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ ok: false, message: "userId, pair(6 letters), side(BUY/SELL), units are required." });
    }

    let transactions = [];
    try {
      transactions = await readTransactionsForUser(id, { limit: 800 });
    } catch (error) {
      return res.status(500).json({ ok: false, message: "Failed to read transactions.", details: String(error.message || error) });
    }
    const ledger = computeLedgerState(transactions);
    let mid = null;
    let source = "synthetic-fallback";
    try {
      const quote = await fetchForexFromProvider(asset);
      mid = Number(quote?.latest?.value);
      source = quote?.source || "frankfurter";
    } catch {
      const quotes = generateSyntheticSeries(`forex:${asset}`, {
        points: 2,
        start: 1 + (hashString(asset) % 50) / 100,
        volatility: 0.0015,
      });
      mid = Number(quotes[quotes.length - 1].value);
    }
    if (!Number.isFinite(mid)) {
      return res.status(502).json({ ok: false, message: "Failed to fetch executable forex quote." });
    }
    const spreadBps = 8;
    const price = direction === "BUY" ? mid * (1 + spreadBps / 10000) : mid * (1 - spreadBps / 10000);
    const amount = price * qty;

    if (direction === "BUY" && ledger.cash < amount) {
      return res.status(400).json({ ok: false, message: "Insufficient cash.", cash: ledger.cash, required: amount });
    }
    const cashAfter = direction === "BUY" ? ledger.cash - amount : ledger.cash + amount;
    const type = direction === "BUY" ? "FOREX_BUY" : "FOREX_SELL";
    const createdAt = new Date().toISOString();
    try {
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
    } catch (error) {
      return res.status(500).json({ ok: false, message: "Failed to persist forex trade.", details: String(error.message || error) });
    }
    return res.status(201).json({
      ok: true,
      trade: { userId: id, pair: asset, side: direction, units: qty, price, amount, cashAfter, source },
    });
  });

  app.post("/api/trade/options", async (req, res) => {
    const { userId, symbol, side, contractType, strike, expiry, contracts, premium } = req.body || {};
    const id = String(userId || "").trim();
    const sym = String(symbol || "").trim().toUpperCase();
    const direction = String(side || "").trim().toUpperCase();
    const optType = String(contractType || "").trim().toUpperCase();
    const qty = Number(contracts);
    const strikeNum = Number(strike);
    const premiumNum = Number(premium);
    const lotSize = 100;
    if (!id || !sym || !["BUY", "SELL"].includes(direction) || !["CALL", "PUT"].includes(optType) || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(strikeNum) || !expiry) {
      return res.status(400).json({ ok: false, message: "userId, symbol, side, contractType, strike, expiry, contracts are required." });
    }

    let computedPremium = Number.isFinite(premiumNum) && premiumNum > 0 ? premiumNum : null;
    let source = "synthetic-fallback";
    try {
      const snapshot = await fetchOptionsFromProvider(sym);
      const match = snapshot.chain.find((entry) => String(entry.expiry) === String(expiry) && Number(entry.strike) === Number(strikeNum));
      if (match) {
        const premiumFromChain = optType === "CALL" ? match.callPremium : match.putPremium;
        if (Number.isFinite(Number(premiumFromChain)) && Number(premiumFromChain) > 0) {
          computedPremium = Number(premiumFromChain);
          source = snapshot.source || "yahoo";
        }
      }
    } catch {
      // fallback continues
    }
    if (!Number.isFinite(computedPremium) || computedPremium <= 0) {
      computedPremium = Math.max(0.5, strikeNum * 0.02);
    }
    let transactions = [];
    try {
      transactions = await readTransactionsForUser(id, { limit: 800 });
    } catch (error) {
      return res.status(500).json({ ok: false, message: "Failed to read transactions.", details: String(error.message || error) });
    }
    const ledger = computeLedgerState(transactions);
    const amount = computedPremium * qty * lotSize;
    if (direction === "BUY" && ledger.cash < amount) {
      return res.status(400).json({ ok: false, message: "Insufficient cash.", cash: ledger.cash, required: amount });
    }
    const cashAfter = direction === "BUY" ? ledger.cash - amount : ledger.cash + amount;
    const createdAt = new Date().toISOString();
    const optionSymbol = `${sym}_${expiry}_${strikeNum}_${optType}`;
    try {
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
    } catch (error) {
      return res.status(500).json({ ok: false, message: "Failed to persist options trade.", details: String(error.message || error) });
    }
    return res.status(201).json({
      ok: true,
      trade: {
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
      },
    });
  });
};
