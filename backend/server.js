const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const { google } = require("googleapis");
const { GoogleGenAI } = require("@google/genai");
const nodemailer = require("nodemailer");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const PORT = Number(process.env.BACKEND_PORT || 4001);
const ACTIVITIES_PATH = path.resolve(__dirname, "data", "activities.json");
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

const app = express();
app.use(cors());
app.use(express.json());

function ensureActivitiesFile() {
  const dir = path.dirname(ACTIVITIES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ACTIVITIES_PATH)) fs.writeFileSync(ACTIVITIES_PATH, "[]", "utf-8");
}

function readActivities() {
  ensureActivitiesFile();
  try {
    const raw = fs.readFileSync(ACTIVITIES_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeActivities(activities) {
  ensureActivitiesFile();
  fs.writeFileSync(ACTIVITIES_PATH, JSON.stringify(activities, null, 2), "utf-8");
}

let geminiClient = null;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

function buildPortfolioSummary(activities) {
  if (!activities.length) {
    return {
      summary:
        "No saved portfolio activity yet. Give general guidance, ask one follow-up question, and mention that better advice needs saved symbols or budgets.",
      symbolCount: 0,
      totalBudget: 0,
      symbols: [],
    };
  }

  const bySymbol = new Map();
  for (const activity of activities) {
    const symbol = String(activity.symbol || "").trim().toUpperCase();
    if (!symbol) continue;

    const entry = bySymbol.get(symbol) || {
      symbol,
      activityCount: 0,
      totalBudget: 0,
      latestActivityAt: "",
      activityTypes: new Set(),
      notes: [],
    };

    entry.activityCount += 1;
    entry.activityTypes.add(String(activity.activityType || "").trim());
    if (Number.isFinite(activity.budget)) {
      entry.totalBudget += Number(activity.budget);
    }
    if (!entry.latestActivityAt || new Date(activity.createdAt) > new Date(entry.latestActivityAt)) {
      entry.latestActivityAt = activity.createdAt;
    }
    if (activity.note) {
      entry.notes.push(String(activity.note).trim());
    }

    bySymbol.set(symbol, entry);
  }

  const symbols = [...bySymbol.values()]
    .map((entry) => ({
      ...entry,
      activityTypes: [...entry.activityTypes].filter(Boolean),
      notes: entry.notes.filter(Boolean).slice(-2),
    }))
    .sort((a, b) => {
      if (b.totalBudget !== a.totalBudget) return b.totalBudget - a.totalBudget;
      return new Date(b.latestActivityAt) - new Date(a.latestActivityAt);
    });

  const totalBudget = symbols.reduce((sum, entry) => sum + entry.totalBudget, 0);
  const lines = symbols.map((entry) => {
    const types = entry.activityTypes.length ? entry.activityTypes.join(", ") : "unspecified activity";
    const budgetLabel = entry.totalBudget > 0 ? `$${entry.totalBudget.toFixed(2)}` : "no budget recorded";
    const notes = entry.notes.length ? ` Notes: ${entry.notes.join(" | ")}` : "";
    return `- ${entry.symbol}: ${entry.activityCount} activities, ${types}, ${budgetLabel}.${notes}`;
  });

  return {
    summary: [`Tracked symbols: ${symbols.length}`, `Recorded budget: $${totalBudget.toFixed(2)}`, ...lines].join("\n"),
    symbolCount: symbols.length,
    totalBudget,
    symbols,
  };
}

function extractGroundingSources(response) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const chunks = candidates.flatMap((candidate) =>
    Array.isArray(candidate?.groundingMetadata?.groundingChunks)
      ? candidate.groundingMetadata.groundingChunks
      : []
  );

  const seen = new Set();
  const sources = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title || uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ title, uri });
  }
  return sources;
}

function classifyGeminiError(error) {
  const message = String(error?.message || error || "");

  if (message.includes("RESOURCE_EXHAUSTED") || message.includes('"code":429') || message.includes("quota")) {
    return {
      status: 429,
      message:
        "Gemini quota is exhausted for this API key right now. Check billing/rate limits or try again later.",
    };
  }

  if (message.includes("NOT_FOUND") || message.includes('"code":404')) {
    return {
      status: 404,
      message: `Gemini model "${GEMINI_MODEL}" is not available for this API key.`,
    };
  }

  return {
    status: 502,
    message: "Failed to get advisor response from Gemini.",
  };
}

function getGoogleConfig() {
  const sheetId =
    process.env.GOOGLE_SPREADSHEET_ID ||
    process.env.Google_Sheet_Id ||
    process.env.Google_Sheet_ID;

  let serviceJson = null;
  if (process.env.Json) {
    try {
      serviceJson = JSON.parse(process.env.Json);
    } catch {
      serviceJson = null;
    }
  }

  const clientEmail =
    process.env.GOOGLE_CLIENT_EMAIL ||
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    process.env.Google_Service_Account_Email ||
    serviceJson?.client_email ||
    null;

  const privateKey =
    (
      process.env.GOOGLE_PRIVATE_KEY ||
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    )
      ? (
          process.env.GOOGLE_PRIVATE_KEY ||
          process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
        ).replace(/\\n/g, "\n")
      : serviceJson?.private_key || null;

  const sheetName =
    process.env.GOOGLE_SHEET_NAME ||
    process.env.Google_Sheet_Name ||
    process.env.GOOGLE_SHEET_TAB ||
    null;

  return { sheetId, clientEmail, privateKey, sheetName };
}

async function appendSignupToSheet({ email, username }) {
  const { sheetId, clientEmail, privateKey, sheetName } = getGoogleConfig();
  if (!sheetId || !clientEmail || !privateKey) {
    throw new Error("Google Sheets env vars are incomplete");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const row = [
    new Date().toISOString(),
    username,
    email,
    "signup",
  ];

  const candidateRanges = [];
  if (sheetName) candidateRanges.push(`${sheetName}!A:D`);
  candidateRanges.push("Users!A:D");
  candidateRanges.push("Sheet1!A:D");
  candidateRanges.push("A:D");

  let lastError = null;
  for (const range of candidateRanges) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range,
        valueInputOption: "RAW",
        requestBody: {
          values: [row],
        },
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unknown Google Sheets append error");
}

async function readUsersFromSheet() {
  const { sheetId, clientEmail, privateKey, sheetName } = getGoogleConfig();
  if (!sheetId || !clientEmail || !privateKey) {
    throw new Error("Google Sheets env vars are incomplete");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const candidateRanges = [];
  if (sheetName) candidateRanges.push(`${sheetName}!A:F`);
  candidateRanges.push("Users!A:F");
  candidateRanges.push("Sheet1!A:F");
  candidateRanges.push("A:F");

  let rows = [];
  let lastError = null;
  for (const range of candidateRanges) {
    try {
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
      });
      rows = Array.isArray(resp.data.values) ? resp.data.values : [];
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!rows.length && lastError) {
    throw lastError;
  }

  const users = [];
  for (const row of rows) {
    const [createdAt, username, email, passwordHash, id] = row;
    if (!email || !username || !passwordHash) continue;
    if (String(email).toLowerCase() === "email") continue;
    users.push({
      id: id || crypto.randomUUID(),
      email: String(email).trim(),
      username: String(username).trim(),
      passwordHash: String(passwordHash),
      createdAt: createdAt || new Date().toISOString(),
    });
  }

  return users;
}

async function appendUserToSheet(user) {
  const { sheetId, clientEmail, privateKey, sheetName } = getGoogleConfig();
  if (!sheetId || !clientEmail || !privateKey) {
    throw new Error("Google Sheets env vars are incomplete");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const row = [user.createdAt, user.username, user.email, user.passwordHash, user.id, "signup"];
  const candidateRanges = [];
  if (sheetName) candidateRanges.push(`${sheetName}!A:F`);
  candidateRanges.push("Users!A:F");
  candidateRanges.push("Sheet1!A:F");
  candidateRanges.push("A:F");

  let lastError = null;
  for (const range of candidateRanges) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unknown Google Sheets append error");
}

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function createMailTransporter() {
  const host = process.env.SMTP_HOST;
  const rawPort = Number(process.env.SMTP_PORT || process.env.SMPT_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secureEnv = process.env.SMTP_SECURE ?? process.env.SMPT_SECURE ?? "false";
  const secure = String(secureEnv).toLowerCase() === "true";
  const isGmailHost = String(host || "").toLowerCase().includes("gmail.com");
  const port = isGmailHost && rawPort === 456 ? 465 : rawPort;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailLayout({ title, intro, bodyHtml }) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f7fb;padding:24px;font-family:Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:24px 24px 8px 24px;">
          <h2 style="margin:0 0 8px 0;color:#111827;">${escapeHtml(title)}</h2>
          <p style="margin:0;color:#374151;line-height:1.6;">${intro}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px 24px 24px;">${bodyHtml}</td>
      </tr>
      <tr>
        <td style="padding:0 24px 24px 24px;">
          <p style="margin:0;color:#6b7280;font-size:12px;">Walle-T Security Notifications</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendAuthEmail({ to, subject, html }) {
  const transporter = createMailTransporter();
  const appName = process.env.SMPT_APP_NAME || process.env.SMTP_APP_NAME || "Walle-T";
  const fallbackUser = process.env.SMTP_USER;
  const from = process.env.SMTP_FROM || (fallbackUser ? `${appName} <${fallbackUser}>` : null);
  if (!transporter || !from) {
    return false;
  }

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
  return true;
}

function buildSignupEmailHtml(user) {
  return emailLayout({
    title: "Welcome to Walle-T",
    intro: `Hi <strong>${escapeHtml(user.username)}</strong>, thanks for signing up.`,
    bodyHtml: `
      <p style="margin:0 0 12px 0;color:#374151;line-height:1.6;">
        Your account is ready and you can now start using Walle-T.
      </p>
      <p style="margin:0;color:#374151;line-height:1.6;">
        Account email: <strong>${escapeHtml(user.email)}</strong>
      </p>
    `,
  });
}

function buildLoginEmailHtml(user, req) {
  const userAgent = req.get("user-agent") || "Unknown device";
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0].trim()) ||
    req.ip ||
    "Unknown IP";
  const loginAt = new Date().toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" });

  return emailLayout({
    title: "Login Detected",
    intro: `Hi <strong>${escapeHtml(user.username)}</strong>, your account was just accessed.`,
    bodyHtml: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:8px;">
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;"><strong>Time</strong>: ${escapeHtml(loginAt)}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;"><strong>IP</strong>: ${escapeHtml(ip)}</td></tr>
        <tr><td style="padding:10px 12px;"><strong>Device</strong>: ${escapeHtml(userAgent)}</td></tr>
      </table>
      <p style="margin:14px 0 0 0;color:#b91c1c;line-height:1.6;">
        If this was not you, please change your password immediately.
      </p>
    `,
  });
}

app.get("/api/health", (_req, res) => {
  const cfg = getGoogleConfig();
  res.json({
    ok: true,
    sheetIdPresent: Boolean(cfg.sheetId),
    serviceEmailPresent: Boolean(cfg.clientEmail),
    privateKeyPresent: Boolean(cfg.privateKey),
    geminiConfigured: Boolean(getGeminiClient()),
    geminiModel: GEMINI_MODEL,
    sheetName: cfg.sheetName || "(auto)",
  });
});

app.post("/api/auth/signup", async (req, res) => {
  const { email, username, password } = req.body || {};
  if (!email || !username || !password) {
    return res.status(400).json({ ok: false, message: "email, username, and password are required." });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ ok: false, message: "Password must be at least 6 characters." });
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
  const emailKey = String(email).trim().toLowerCase();
  if (users.some((u) => String(u.email).toLowerCase() === emailKey)) {
    return res.status(409).json({ ok: false, message: "Email already exists." });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = {
    id: crypto.randomUUID(),
    email: String(email).trim(),
    username: String(username).trim(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  try {
    await appendUserToSheet(user);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to store user in Google Sheet.",
      details: String(error.message || error),
    });
  }

  try {
    await sendAuthEmail({
      to: user.email,
      subject: "Welcome to Walle-T",
      html: buildSignupEmailHtml(user),
    });
  } catch (error) {
    console.error("Signup email failed:", error.message || error);
  }

  return res.json({ ok: true, user: safeUser(user) });
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
  const found = users.find(
    (u) =>
      String(u.email).toLowerCase() === key ||
      String(u.username).toLowerCase() === key
  );
  if (!found) {
    return res.status(401).json({ ok: false, message: "Invalid credentials." });
  }

  const ok = await bcrypt.compare(String(password), found.passwordHash);
  if (!ok) {
    return res.status(401).json({ ok: false, message: "Invalid credentials." });
  }

  try {
    await sendAuthEmail({
      to: found.email,
      subject: "Walle-T login alert",
      html: buildLoginEmailHtml(found, req),
    });
  } catch (error) {
    console.error("Login email failed:", error.message || error);
  }

  return res.json({ ok: true, user: safeUser(found) });
});

app.get("/api/activities/:userId", (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) {
    return res.status(400).json({ ok: false, message: "userId is required." });
  }

  const activities = readActivities();
  const userActivities = activities
    .filter((a) => a.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
    budget:
      budget === "" || budget == null || Number.isNaN(Number(budget))
        ? null
        : Number(budget),
    note: note ? String(note).trim() : "",
    createdAt: new Date().toISOString(),
  };

  activities.push(activity);
  writeActivities(activities);
  return res.status(201).json({ ok: true, activity });
});

app.post("/api/advisor", async (req, res) => {
  const { userId, message } = req.body || {};
  if (!userId || !String(userId).trim()) {
    return res.status(400).json({ ok: false, message: "userId is required." });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ ok: false, message: "message is required." });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(500).json({
      ok: false,
      message: "Gemini API key is missing. Set GEMINI_API_KEY in the backend environment.",
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

  const user = users.find((entry) => entry.id === String(userId).trim());
  if (!user) {
    return res.status(404).json({ ok: false, message: "User not found." });
  }

  const activities = readActivities()
    .filter((activity) => activity.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const portfolio = buildPortfolioSummary(activities);
  const today = new Date().toISOString().slice(0, 10);
  const prompt = [
    "You are Walle-T's portfolio advisor assistant.",
    "Your job is to advise the user based on their saved portfolio activity and current affairs.",
    "Use current affairs when relevant by grounding with Google Search.",
    "Keep the answer practical, concise, and tailored to the user's symbols.",
    "Do not claim certainty or guaranteed returns.",
    "This is educational analysis, not professional financial advice.",
    "",
    `Date: ${today}`,
    `User: ${user.username} (${user.email})`,
    "",
    "Saved portfolio/activity context:",
    portfolio.summary,
    "",
    "User question:",
    String(message).trim(),
    "",
    "Answer format:",
    "1. Short view",
    "2. Portfolio-specific observations",
    "3. Current-affairs impact",
    "4. Suggested next steps",
  ].join("\n");

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.3,
        tools: [{ googleSearch: {} }],
      },
    });

    return res.json({
      ok: true,
      reply: String(response?.text || "").trim(),
      model: GEMINI_MODEL,
      portfolio,
      sources: extractGroundingSources(response),
    });
  } catch (error) {
    console.error("Advisor request failed:", error);
    const classified = classifyGeminiError(error);
    return res.status(classified.status).json({
      ok: false,
      message: classified.message,
      details: String(error.message || error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
