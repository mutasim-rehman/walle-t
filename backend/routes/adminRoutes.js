/**
 * Admin Routes
 * POST /api/admin/login            – authenticate admin via ADMIN_EMAIL + ADMIN_PASSWORD
 * GET  /api/admin/users            – list all users (requires admin token)
 * GET  /api/admin/users/:id        – full detail for one user
 * DELETE /api/admin/users/:id      – delete a user row from the sheet
 * GET  /api/admin/stats            – platform-wide aggregate stats
 */

const crypto = require("crypto");

// In-memory admin sessions (keyed by token → { createdAt })
const adminSessions = new Map();
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function generateAdminToken() {
  return crypto.randomBytes(32).toString("hex");
}

function isAdminTokenValid(token) {
  const session = adminSessions.get(String(token || "").trim());
  if (!session) return false;
  if (Date.now() - session.createdAt > ADMIN_SESSION_TTL_MS) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req, res, next) {
  const auth = req.headers["x-admin-token"] || req.query.adminToken || "";
  if (!isAdminTokenValid(String(auth).trim())) {
    return res.status(401).json({ ok: false, message: "Unauthorized. Admin token missing or expired." });
  }
  return next();
}

module.exports = function registerAdminRoutes(
  app,
  {
    readUsersFromSheet,
    readTransactionsForUser,
    computeLedgerState,
    readProfileFromSheet,
    deleteUserFromSheet,
    priceHoldings,
  }
) {
  // ── POST /api/admin/login ──────────────────────────────────────────────────
  app.post("/api/admin/login", (req, res) => {
    const { email, password } = req.body || {};
    const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const adminPassword = (process.env.ADMIN_PASSWORD || "").trim();

    if (!adminEmail || !adminPassword) {
      return res.status(503).json({ ok: false, message: "Admin credentials not configured on server." });
    }

    const emailOk = String(email || "").trim().toLowerCase() === adminEmail;
    const passOk = String(password || "").trim() === adminPassword;

    if (!emailOk || !passOk) {
      return res.status(401).json({ ok: false, message: "Invalid admin credentials." });
    }

    const token = generateAdminToken();
    adminSessions.set(token, { createdAt: Date.now() });
    return res.json({ ok: true, token, expiresInMs: ADMIN_SESSION_TTL_MS });
  });

  // ── GET /api/admin/users ───────────────────────────────────────────────────
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await readUsersFromSheet({ forceRefresh: true });
      const safe = users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        createdAt: u.createdAt,
      }));
      return res.json({ ok: true, users: safe, total: safe.length });
    } catch (err) {
      return res.status(500).json({ ok: false, message: "Failed to fetch users.", details: String(err.message || err) });
    }
  });

  // ── GET /api/admin/users/:id ───────────────────────────────────────────────
  app.get("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const users = await readUsersFromSheet();
      const user = users.find((u) => u.id === id);
      if (!user) return res.status(404).json({ ok: false, message: "User not found." });

      // Fetch profile, transactions, ledger concurrently (best effort)
      const [profileResult, txResult] = await Promise.allSettled([
        readProfileFromSheet(id),
        readTransactionsForUser(id, { limit: 500 }),
      ]);

      const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
      const transactions = txResult.status === "fulfilled" ? txResult.value : [];
      const ledger = computeLedgerState(transactions);

      // Price holdings best-effort
      let pricedHoldings = [];
      let holdingsTotalValue = 0;
      if (typeof priceHoldings === "function" && ledger.holdings.length > 0) {
        try {
          const ph = await priceHoldings(ledger.holdings);
          pricedHoldings = ph.positions;
          holdingsTotalValue = ph.totalValue;
        } catch {
          pricedHoldings = ledger.holdings.map((h) => ({ ...h, price: null, value: null }));
        }
      } else {
        pricedHoldings = ledger.holdings.map((h) => ({ ...h, price: null, value: null }));
      }

      // Build daily usage stats from transactions
      const usageByDay = {};
      for (const tx of transactions) {
        const day = String(tx.createdAt || "").slice(0, 10);
        if (!day) continue;
        if (!usageByDay[day]) usageByDay[day] = { day, tradeCount: 0, volume: 0 };
        usageByDay[day].tradeCount += 1;
        usageByDay[day].volume += Math.abs(Number(tx.amount) || 0);
      }
      const dailyUsage = Object.values(usageByDay).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 90);

      return res.json({
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt,
        },
        profile,
        ledger: {
          cash: ledger.cash,
          holdings: pricedHoldings,
          holdingsTotalValue,
          totalPortfolioValue: ledger.cash + holdingsTotalValue,
        },
        transactions: transactions.slice(0, 200),
        dailyUsage,
        stats: {
          totalTrades: transactions.filter((t) => ["BUY", "SELL"].includes(String(t.type).toUpperCase())).length,
          totalDeposited: transactions
            .filter((t) => ["DEPOSIT", "CASH_IN"].includes(String(t.type).toUpperCase()))
            .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
          totalWithdrawn: transactions
            .filter((t) => ["WITHDRAW", "CASH_OUT"].includes(String(t.type).toUpperCase()))
            .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
        },
      });
    } catch (err) {
      return res.status(500).json({ ok: false, message: "Failed to fetch user detail.", details: String(err.message || err) });
    }
  });

  // ── DELETE /api/admin/users/:id ────────────────────────────────────────────
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const users = await readUsersFromSheet({ forceRefresh: true });
      const user = users.find((u) => u.id === id);
      if (!user) return res.status(404).json({ ok: false, message: "User not found." });

      if (typeof deleteUserFromSheet === "function") {
        await deleteUserFromSheet(id);
        return res.json({ ok: true, message: `User ${user.email} deleted.` });
      }
      return res.status(501).json({ ok: false, message: "Delete not implemented: deleteUserFromSheet missing." });
    } catch (err) {
      return res.status(500).json({ ok: false, message: "Failed to delete user.", details: String(err.message || err) });
    }
  });

  // ── GET /api/admin/stats ───────────────────────────────────────────────────
  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const users = await readUsersFromSheet({ forceRefresh: true });

      // Aggregate signups by day
      const signupsByDay = {};
      for (const u of users) {
        const day = String(u.createdAt || "").slice(0, 10);
        if (!day) continue;
        signupsByDay[day] = (signupsByDay[day] || 0) + 1;
      }
      const signupTrend = Object.entries(signupsByDay)
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => b.day.localeCompare(a.day))
        .slice(0, 30);

      return res.json({
        ok: true,
        stats: {
          totalUsers: users.length,
          signupTrend,
        },
      });
    } catch (err) {
      return res.status(500).json({ ok: false, message: "Failed to fetch stats.", details: String(err.message || err) });
    }
  });
};
