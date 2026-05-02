const express = require("express");

module.exports = function registerAuthRoutes(app, deps) {
  const {
    createUserAccount,
    safeUser,
    readProfileFromSheet,
    upsertProfileToSheet,
    readTransactionsForUser,
    computeLedgerState,
    DEFAULT_STARTING_INVESTMENT_USD,
    appendTransactionRow,
    readUsersFromSheet,
    resolveLoginLocation,
    createPasswordResetToken,
    PORT,
    sendAuthEmail,
    buildLoginEmailHtml,
    verifyPasswordResetToken,
    stablePasswordMarker,
    bcrypt,
    updateUserPasswordInSheet,
    escapeHtml,
  } = deps;

  app.post("/api/auth/signup", async (req, res) => {
    const { email, username, password } = req.body || {};
    const result = await createUserAccount({ email, username, password });
    if (!result.ok) {
      return res.status(result.status || 500).json({
        ok: false,
        message: result.message || "Signup failed.",
        details: result.details,
      });
    }
    const user = result.user;
    // Credit $10,000 starting balance
    try {
      const existingTx = await readTransactionsForUser(user.id, { limit: 10 });
      const hasDeposit = existingTx.some((tx) => String(tx.type || "").toUpperCase() === "DEPOSIT");
      if (!hasDeposit) {
        await appendTransactionRow({
          createdAt: new Date().toISOString(),
          userId: user.id,
          type: "DEPOSIT",
          amount: DEFAULT_STARTING_INVESTMENT_USD,
          cashAfter: DEFAULT_STARTING_INVESTMENT_USD,
          note: "Default starting investment.",
          metaJson: { currency: "USD" },
        });
      }
    } catch (err) {
      console.error("Failed to credit starting balance:", err.message || err);
    }
    return res.json({ ok: true, user: safeUser(user) });
  });

  app.post("/api/auth/signup-complete", async (req, res) => {
    const { email, username, password, profile, initialHoldings } = req.body || {};
    const signupResult = await createUserAccount({ email, username, password });
    if (!signupResult.ok) {
      return res.status(signupResult.status || 500).json({
        ok: false,
        message: signupResult.message || "Signup failed.",
        details: signupResult.details,
      });
    }
    const user = signupResult.user;

    let existingProfile = null;
    try {
      existingProfile = await readProfileFromSheet(user.id);
    } catch {
      existingProfile = null;
    }

    const payload = profile && typeof profile === "object" ? profile : {};
    const nextProfile = {
      userId: user.id,
      age: payload.age == null || payload.age === "" ? null : Number(payload.age),
      country: String(payload.country || "").trim(),
      monthlyIncome: payload.monthlyIncome == null || payload.monthlyIncome === "" ? null : Number(payload.monthlyIncome),
      monthlyExpenses: payload.monthlyExpenses == null || payload.monthlyExpenses === "" ? null : Number(payload.monthlyExpenses),
      currentCash: payload.currentCash == null || payload.currentCash === "" ? null : Number(payload.currentCash),
      assets: payload.assets && typeof payload.assets === "object" ? payload.assets : {},
      liabilities: payload.liabilities && typeof payload.liabilities === "object" ? payload.liabilities : {},
      extras: payload.extras && typeof payload.extras === "object" ? payload.extras : {},
      updatedAt: new Date().toISOString(),
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
    };

    try {
      await upsertProfileToSheet(nextProfile);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message:
          "Account created, but failed to store profile in Google Sheet. Ensure Transactional_History is shared with service account.",
        details: String(error.message || error),
      });
    }

    let existingTx = [];
    try {
      existingTx = await readTransactionsForUser(user.id, { limit: 500 });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message:
          "Account created, but failed to read transactions from Google Sheet. Ensure Transactional_History is shared with service account.",
        details: String(error.message || error),
      });
    }

    const hasDeposit = existingTx.some((tx) => String(tx.type || "").toUpperCase() === "DEPOSIT");
    let cashAfter = computeLedgerState(existingTx).cash;
    const createdAt = new Date().toISOString();
    try {
      if (!hasDeposit) {
        cashAfter += DEFAULT_STARTING_INVESTMENT_USD;
        await appendTransactionRow({
          createdAt,
          userId: user.id,
          type: "DEPOSIT",
          amount: DEFAULT_STARTING_INVESTMENT_USD,
          cashAfter,
          note: "Default starting investment (no payment gateway).",
          metaJson: { currency: "USD" },
        });
      }
      const holdings = Array.isArray(initialHoldings) ? initialHoldings : [];
      for (const h of holdings) {
        const symbol = String(h?.symbol || "").trim().toUpperCase();
        const qty = h?.qty == null || h?.qty === "" ? null : Number(h.qty);
        if (!symbol || !Number.isFinite(qty) || qty <= 0) continue;
        await appendTransactionRow({
          createdAt,
          userId: user.id,
          type: "PORTFOLIO_IMPORT",
          symbol,
          qty,
          note: "Imported initial portfolio holding.",
          metaJson: { source: "signup-complete" },
        });
      }
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Account created, but failed to write onboarding transactions.",
        details: String(error.message || error),
      });
    }

    return res.json({ ok: true, user: safeUser(user), onboardingComplete: true });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { usernameOrEmail, password } = req.body || {};
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ ok: false, message: "username/email and password are required." });
    }

    const key = String(usernameOrEmail).trim().toLowerCase();
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
    const found = users.find((u) => String(u.email).toLowerCase() === key || String(u.username).toLowerCase() === key);
    if (!found) {
      return res.status(401).json({ ok: false, message: "Invalid credentials." });
    }

    const ok = await bcrypt.compare(String(password), found.passwordHash);
    if (!ok) {
      return res.status(401).json({ ok: false, message: "Invalid credentials." });
    }

    try {
      const location = await resolveLoginLocation(req);
      const resetToken = createPasswordResetToken(found);
      const backendBase = process.env.BACKEND_BASE_URL || `http://localhost:${PORT}`;
      const resetUrl = `${backendBase}/api/auth/password-reset?token=${encodeURIComponent(resetToken)}`;
      await sendAuthEmail({
        to: found.email,
        subject: "Walle-T login alert",
        html: buildLoginEmailHtml(found, { location, resetUrl }),
      });
    } catch (error) {
      console.error("Login email failed:", error.message || error);
    }

    return res.json({ ok: true, user: safeUser(found) });
  });

  app.get("/api/auth/password-reset", (req, res) => {
    const token = String(req.query?.token || "").trim();
    if (!token) {
      return res.status(400).send("Invalid password reset link.");
    }
    return res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Walle-T Password Reset</title>
  </head>
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:460px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:22px;">
      <h2 style="margin:0 0 8px 0;">Change Password</h2>
      <p style="margin:0 0 16px 0;color:#475569;">Enter your new password to secure your account.</p>
      <form method="POST" action="/api/auth/password-reset">
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <input name="newPassword" type="password" minlength="6" required placeholder="New password (min 6 chars)"
          style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:10px;" />
        <button type="submit" style="width:100%;background:#1d4ed8;color:#fff;border:none;border-radius:8px;padding:10px 12px;font-weight:700;cursor:pointer;">
          Update Password
        </button>
      </form>
    </div>
  </body>
</html>`);
  });

  app.post("/api/auth/password-reset", express.urlencoded({ extended: false }), async (req, res) => {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    if (!token || newPassword.length < 6) {
      return res.status(400).send("Invalid reset request. Password must be at least 6 characters.");
    }
    const verified = verifyPasswordResetToken(token);
    if (!verified.ok) {
      return res.status(400).send(`Reset link is invalid or expired. ${verified.reason}`);
    }

    let users = [];
    try {
      users = await readUsersFromSheet({ forceRefresh: true });
    } catch (error) {
      return res.status(500).send(`Failed to read users: ${escapeHtml(String(error.message || error))}`);
    }
    const user = users.find(
      (u) => String(u.id) === String(verified.data.uid) && String(u.email || "").toLowerCase() === String(verified.data.email || "").toLowerCase()
    );
    if (!user) {
      return res.status(404).send("User not found.");
    }
    if (stablePasswordMarker(user.passwordHash) !== String(verified.data.ph || "")) {
      return res.status(400).send("This reset link is no longer valid. Please request a fresh login alert.");
    }

    try {
      const newHash = await bcrypt.hash(newPassword, 10);
      await updateUserPasswordInSheet({ userId: user.id, passwordHash: newHash });
      return res.send("Password updated successfully. You can now log in with the new password.");
    } catch (error) {
      return res.status(500).send(`Failed to update password: ${escapeHtml(String(error.message || error))}`);
    }
  });

  app.get("/api/auth/session/:userId", async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    if (!userId) {
      return res.status(400).json({ ok: false, message: "userId is required." });
    }
    let users = [];
    try {
      users = await readUsersFromSheet();
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Failed to validate session against Google Sheet.",
        details: String(error.message || error),
      });
    }
    const exists = users.some((u) => String(u.id) === userId);
    if (!exists) {
      return res.status(401).json({ ok: false, valid: false, message: "Session user no longer exists." });
    }
    return res.json({ ok: true, valid: true });
  });
};
