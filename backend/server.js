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
const registerHealthRoutes = require("./routes/healthRoutes");
const registerAuthRoutes = require("./routes/authRoutes");
const registerActivitiesRoutes = require("./routes/activitiesRoutes");
const registerAdvisorRoutes = require("./routes/advisorRoutes");
const registerProfileRoutes = require("./routes/profileRoutes");
const registerOnboardingRoutes = require("./routes/onboardingRoutes");
const registerPortfolioRoutes = require("./routes/portfolioRoutes");
const registerForecastRoutes = require("./routes/forecastRoutes");
const registerModelPredictionRoutes = require("./routes/modelPredictionRoutes");
const registerSettingsRoutes = require("./routes/settingsRoutes");
const registerMarketRoutes = require("./routes/marketRoutes");
const registerTradeRoutes = require("./routes/tradeRoutes");
const registerRiskRoutes = require("./routes/riskRoutes");
const registerAdminRoutes = require("./routes/adminRoutes");

const projectRoot = path.resolve(__dirname, "..");
const dotenvCandidates = [".env", "env"];
for (const candidate of dotenvCandidates) {
  const fullPath = path.join(projectRoot, candidate);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
    break;
  }
}
const MODEL_PREDICTIONS_PATH = path.resolve(
  process.env.MODEL_PREDICTIONS_PATH || path.join(__dirname, "data", "psx_model_symbol_predictions.json")
);

const PORT = Number(process.env.BACKEND_PORT || 4001);
const ACTIVITIES_PATH = path.resolve(__dirname, "data", "activities.json");
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const DEFAULT_STARTING_INVESTMENT_USD = 10_000;

const app = express();
app.use(cors());
app.use(express.json());

const rateWindowMs = Number(process.env.API_RATE_WINDOW_MS || 60_000);
const rateMax = Number(process.env.API_RATE_MAX || 240);
const rateBuckets = new Map();
const advisorPromptBuckets = new Map();
const ADVISOR_MIN_INTERVAL_MS = 5 * 60 * 1000;
const ADVISOR_MAX_IN_WINDOW = 3;
const ADVISOR_WINDOW_MS = 6 * 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_TTL_MS = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MS || 30 * 60 * 1000);
const PASSWORD_RESET_SECRET =
  process.env.PASSWORD_RESET_SECRET || process.env.GEMINI_API_KEY || "walle-t-password-reset-secret";

app.use("/api", (req, res, next) => {
  const key = `${req.ip || "unknown"}:${req.path}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + rateWindowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + rateWindowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > rateMax) {
    return res.status(429).json({
      ok: false,
      message: "Too many requests. Please retry shortly.",
      details: `rate_limit_exceeded windowMs=${rateWindowMs} max=${rateMax}`,
    });
  }

  const started = Date.now();
  res.on("finish", () => {
    const elapsed = Date.now() - started;
    if (elapsed > 1200) {
      console.warn(`[api-latency] ${req.method} ${req.path} ${elapsed}ms`);
    }
  });
  return next();
});

function formatDurationMs(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function checkAndConsumeAdvisorPrompt(userId) {
  const key = String(userId || "").trim();
  const now = Date.now();
  const earliestAllowed = now - ADVISOR_WINDOW_MS;
  const promptTimes = (advisorPromptBuckets.get(key) || []).filter((ts) => ts >= earliestAllowed);

  const lastPromptAt = promptTimes[promptTimes.length - 1];
  if (lastPromptAt && now - lastPromptAt < ADVISOR_MIN_INTERVAL_MS) {
    const retryAfterMs = ADVISOR_MIN_INTERVAL_MS - (now - lastPromptAt);
    return {
      allowed: false,
      retryAfterMs,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
      message:
        "Advisor is locked right now. You can send only one prompt every 5 minutes.",
    };
  }

  if (promptTimes.length >= ADVISOR_MAX_IN_WINDOW) {
    const retryAfterMs = ADVISOR_WINDOW_MS - (now - promptTimes[0]);
    return {
      allowed: false,
      retryAfterMs,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
      message:
        "Advisor limit reached. You can send max 3 prompts in a 6-hour window.",
    };
  }

  promptTimes.push(now);
  advisorPromptBuckets.set(key, promptTimes);
  return { allowed: true };
}

function ensureJsonFile(filePath, fallbackJson) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, fallbackJson, "utf-8");
}

function readJsonFile(filePath, fallbackValue) {
  try {
    ensureJsonFile(filePath, JSON.stringify(fallbackValue ?? null, null, 2));
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function writeJsonFile(filePath, value) {
  ensureJsonFile(filePath, JSON.stringify(value ?? null, null, 2));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function readModelPredictions() {
  try {
    if (!fs.existsSync(MODEL_PREDICTIONS_PATH)) return null;
    const raw = fs.readFileSync(MODEL_PREDICTIONS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.predictions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

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
let usersCache = {
  users: null,
  fetchedAt: 0,
};

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

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function moneyLabel(value) {
  const n = toFiniteNumber(value);
  if (n == null) return "n/a";
  return `$${n.toFixed(2)}`;
}

function sumNumericValues(obj, { skipKeys = [] } = {}) {
  if (!obj || typeof obj !== "object") return 0;
  const skipped = new Set(skipKeys);
  return Object.entries(obj).reduce((sum, [key, value]) => {
    if (skipped.has(key)) return sum;
    const n = toFiniteNumber(value);
    return n == null ? sum : sum + n;
  }, 0);
}

function buildFinancialProfileSummary(profile) {
  if (!profile || typeof profile !== "object") {
    return {
      assetsTotal: 0,
      liabilitiesTotal: 0,
      summary: "No profile found. Ask one follow-up about income, expenses, assets, liabilities, and risk tolerance.",
    };
  }

  const assetsTotalRaw =
    toFiniteNumber(profile.assets?.total) ?? sumNumericValues(profile.assets, { skipKeys: ["total"] });
  const liabilitiesTotalRaw =
    toFiniteNumber(profile.liabilities?.total) ??
    sumNumericValues(profile.liabilities, { skipKeys: ["total"] });

  const assetsTotal = Math.max(0, assetsTotalRaw || 0);
  const liabilitiesTotal = Math.max(0, liabilitiesTotalRaw || 0);

  return {
    assetsTotal,
    liabilitiesTotal,
    summary: [
      `Age: ${profile.age ?? "n/a"}`,
      `Country: ${profile.country || "n/a"}`,
      `Monthly income: ${moneyLabel(profile.monthlyIncome)}`,
      `Monthly expenses: ${moneyLabel(profile.monthlyExpenses)}`,
      `Current cash (outside simulated ledger): ${moneyLabel(profile.currentCash)}`,
      `Other assets total: ${moneyLabel(assetsTotal)}`,
      `Other liabilities total: ${moneyLabel(liabilitiesTotal)}`,
      `Net assets excluding portfolio ledger: ${moneyLabel(assetsTotal - liabilitiesTotal)}`,
    ].join("\n"),
  };
}

function buildLedgerSummary(transactions, ledger) {
  const tx = Array.isArray(transactions) ? transactions : [];
  const holdings = Array.isArray(ledger?.holdings) ? ledger.holdings : [];
  const cash = toFiniteNumber(ledger?.cash) || 0;

  const latest = tx
    .slice(0, 8)
    .map((entry) => {
      const date = entry?.createdAt ? String(entry.createdAt).slice(0, 10) : "n/a";
      const type = String(entry?.type || "UNKNOWN").toUpperCase();
      const symbol = String(entry?.symbol || "-").trim() || "-";
      const qty = toFiniteNumber(entry?.qty);
      const amount = toFiniteNumber(entry?.amount);
      return `- ${date} ${type} ${symbol} qty=${qty == null ? "-" : qty} amount=${
        amount == null ? "-" : amount.toFixed(2)
      }`;
    })
    .join("\n");

  const holdingLines =
    holdings.length === 0
      ? "No active holdings."
      : holdings.map((h) => `- ${h.symbol}: ${Number(h.qty).toFixed(4)} units`).join("\n");

  return [
    `Ledger cash: ${moneyLabel(cash)}`,
    `Holdings count: ${holdings.length}`,
    "Current holdings:",
    holdingLines,
    `Recent transactions (${Math.min(8, tx.length)} shown):`,
    latest || "No transactions recorded.",
  ].join("\n");
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

function isGeminiQuotaError(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes('"code":429') ||
    message.toLowerCase().includes("quota")
  );
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

function parseSpreadsheetId(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // If it's already an ID (typically 40+ chars, no slashes)
  if (!raw.includes("/") && raw.length >= 20) return raw;

  try {
    const u = new URL(raw);
    const match = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (match?.[1]) return match[1];
    const idFromQuery = u.searchParams.get("id");
    if (idFromQuery) return idFromQuery;
  } catch {
    // ignore
  }
  return null;
}

function getTransactionalSheetConfig() {
  const sheetId =
    parseSpreadsheetId(process.env.Transactional_History) ||
    process.env.TRANSACTION_SHEET_ID ||
    process.env.TRANSACTIONS_SHEET_ID ||
    null;

  // Reuse the same service account creds used for the Users sheet.
  const { clientEmail, privateKey } = getGoogleConfig();
  const sheetName =
    process.env.TRANSACTION_SHEET_NAME ||
    process.env.TRANSACTIONS_SHEET_NAME ||
    "Transactions";

  return { sheetId, clientEmail, privateKey, sheetName };
}

function getProfilesSheetConfig() {
  // Store full user profile in Google Sheets as well.
  // Default: reuse the Transactional_History spreadsheet to keep all user data together.
  const base = getTransactionalSheetConfig();
  const sheetName = process.env.PROFILES_SHEET_NAME || "Profiles";
  return { ...base, sheetName };
}

function makeSheetsClient({ sheetId, clientEmail, privateKey, scopes }) {
  if (!sheetId || !clientEmail || !privateKey) {
    throw new Error("Google Sheets env vars are incomplete");
  }
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes,
  });
  return google.sheets({ version: "v4", auth });
}

async function ensureTransactionHeaderRow(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:J1`;
  try {
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = Array.isArray(resp?.data?.values) ? resp.data.values : [];
    const firstRow = values[0] || [];
    if (firstRow.length > 0) return;
  } catch {
    // If the tab name doesn't exist, we'll just fallback during append.
    return;
  }

  const header = [
    "createdAt",
    "userId",
    "type",
    "symbol",
    "qty",
    "price",
    "amount",
    "cashAfter",
    "note",
    "metaJson",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:J`,
    valueInputOption: "RAW",
    requestBody: { values: [header] },
  });
}

async function appendTransactionRow(tx) {
  const { sheetId, clientEmail, privateKey, sheetName } = getTransactionalSheetConfig();
  const sheets = makeSheetsClient({
    sheetId,
    clientEmail,
    privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const createdAt = tx.createdAt || new Date().toISOString();
  const row = [
    createdAt,
    tx.userId,
    tx.type,
    tx.symbol || "",
    tx.qty == null ? "" : Number(tx.qty),
    tx.price == null ? "" : Number(tx.price),
    tx.amount == null ? "" : Number(tx.amount),
    tx.cashAfter == null ? "" : Number(tx.cashAfter),
    tx.note || "",
    tx.metaJson ? JSON.stringify(tx.metaJson) : "",
  ];

  const candidateRanges = [`${sheetName}!A:J`, "Transactions!A:J", "Sheet1!A:J", "A:J"];
  let lastError = null;

  // Best effort: add header if the tab exists and is empty.
  try {
    await ensureTransactionHeaderRow(sheets, sheetId, sheetName);
  } catch {
    // ignore
  }

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

async function readTransactionsForUser(userId, { limit = 200 } = {}) {
  const { sheetId, clientEmail, privateKey, sheetName } = getTransactionalSheetConfig();
  const sheets = makeSheetsClient({
    sheetId,
    clientEmail,
    privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const candidateRanges = [`${sheetName}!A:J`, "Transactions!A:J", "Sheet1!A:J", "A:J"];
  let rows = [];
  let lastError = null;
  for (const range of candidateRanges) {
    try {
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
      });
      rows = Array.isArray(resp?.data?.values) ? resp.data.values : [];
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!rows.length && lastError) throw lastError;

  const key = String(userId || "").trim();
  const out = [];
  for (const row of rows) {
    const [createdAt, rowUserId, type, symbol, qty, price, amount, cashAfter, note, metaJson] = row;
    if (!rowUserId || String(rowUserId).trim() !== key) continue;
    if (String(createdAt).toLowerCase() === "createdat") continue;

    const parsed = {
      createdAt: createdAt || "",
      userId: String(rowUserId).trim(),
      type: String(type || "").trim(),
      symbol: String(symbol || "").trim(),
      qty: qty === "" || qty == null ? null : Number(qty),
      price: price === "" || price == null ? null : Number(price),
      amount: amount === "" || amount == null ? null : Number(amount),
      cashAfter: cashAfter === "" || cashAfter == null ? null : Number(cashAfter),
      note: String(note || ""),
      metaJson: null,
    };
    if (metaJson) {
      try {
        parsed.metaJson = JSON.parse(String(metaJson));
      } catch {
        parsed.metaJson = { raw: String(metaJson) };
      }
    }
    out.push(parsed);
  }

  out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return out.slice(0, Math.max(1, Number(limit) || 200));
}

async function ensureProfileHeaderRow(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:K1`;
  try {
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = Array.isArray(resp?.data?.values) ? resp.data.values : [];
    const firstRow = values[0] || [];
    if (firstRow.length > 0) return;
  } catch {
    return;
  }

  const header = [
    "userId",
    "createdAt",
    "updatedAt",
    "age",
    "country",
    "monthlyIncome",
    "monthlyExpenses",
    "currentCash",
    "assetsJson",
    "liabilitiesJson",
    "extrasJson",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:K`,
    valueInputOption: "RAW",
    requestBody: { values: [header] },
  });
}

function normalizeProfileRow(profile) {
  const createdAt = profile.createdAt || new Date().toISOString();
  const updatedAt = profile.updatedAt || new Date().toISOString();
  const assetsJson = profile.assets && typeof profile.assets === "object" ? profile.assets : {};
  const liabilitiesJson = profile.liabilities && typeof profile.liabilities === "object" ? profile.liabilities : {};
  const extrasJson = profile.extras && typeof profile.extras === "object" ? profile.extras : {};

  return [
    profile.userId,
    createdAt,
    updatedAt,
    profile.age == null ? "" : Number(profile.age),
    String(profile.country || "").trim(),
    profile.monthlyIncome == null ? "" : Number(profile.monthlyIncome),
    profile.monthlyExpenses == null ? "" : Number(profile.monthlyExpenses),
    profile.currentCash == null ? "" : Number(profile.currentCash),
    JSON.stringify(assetsJson),
    JSON.stringify(liabilitiesJson),
    JSON.stringify(extrasJson),
  ];
}

async function readProfileFromSheet(userId) {
  const { sheetId, clientEmail, privateKey, sheetName } = getProfilesSheetConfig();
  const sheets = makeSheetsClient({
    sheetId,
    clientEmail,
    privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const candidateRanges = [`${sheetName}!A:K`, "Profiles!A:K", "Sheet1!A:K", "A:K"];
  let rows = [];
  let lastError = null;
  for (const range of candidateRanges) {
    try {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      rows = Array.isArray(resp?.data?.values) ? resp.data.values : [];
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!rows.length && lastError) throw lastError;

  const key = String(userId || "").trim();
  const parseJson = (v) => {
    if (!v) return {};
    try {
      return JSON.parse(String(v));
    } catch {
      return { raw: String(v) };
    }
  };

  for (const row of rows) {
    const [
      rowUserId,
      createdAt,
      updatedAt,
      age,
      country,
      monthlyIncome,
      monthlyExpenses,
      currentCash,
      assetsJson,
      liabilitiesJson,
      extrasJson,
    ] = row;
    if (!rowUserId) continue;
    if (String(rowUserId).toLowerCase() === "userid") continue;
    if (String(rowUserId).trim() !== key) continue;

    return {
      userId: key,
      createdAt: createdAt || "",
      updatedAt: updatedAt || "",
      age: age === "" || age == null ? null : Number(age),
      country: String(country || "").trim(),
      monthlyIncome: monthlyIncome === "" || monthlyIncome == null ? null : Number(monthlyIncome),
      monthlyExpenses: monthlyExpenses === "" || monthlyExpenses == null ? null : Number(monthlyExpenses),
      currentCash: currentCash === "" || currentCash == null ? null : Number(currentCash),
      assets: parseJson(assetsJson),
      liabilities: parseJson(liabilitiesJson),
      extras: parseJson(extrasJson),
    };
  }
  return null;
}

async function upsertProfileToSheet(profile) {
  const { sheetId, clientEmail, privateKey, sheetName } = getProfilesSheetConfig();
  const sheets = makeSheetsClient({
    sheetId,
    clientEmail,
    privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  // Best effort: add header if the tab exists and is empty.
  try {
    await ensureProfileHeaderRow(sheets, sheetId, sheetName);
  } catch {
    // ignore
  }

  const candidateRanges = [`${sheetName}!A:K`, "Profiles!A:K", "Sheet1!A:K", "A:K"];
  let rows = [];
  let usedRange = null;
  let lastError = null;
  for (const range of candidateRanges) {
    try {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      rows = Array.isArray(resp?.data?.values) ? resp.data.values : [];
      usedRange = range;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  const key = String(profile.userId || "").trim();
  if (!key) throw new Error("userId is required");

  let rowIndex = null;
  if (rows.length) {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const rowUserId = row[0];
      if (!rowUserId) continue;
      if (String(rowUserId).toLowerCase() === "userid") continue;
      if (String(rowUserId).trim() === key) {
        rowIndex = i + 1;
        break;
      }
    }
  }

  const rowValues = normalizeProfileRow(profile);

  if (rowIndex != null) {
    const targetSheet = usedRange?.includes("!") ? usedRange.split("!")[0] : sheetName;
    const updateRange = `${targetSheet}!A${rowIndex}:K${rowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: updateRange,
      valueInputOption: "RAW",
      requestBody: { values: [rowValues] },
    });
    return;
  }

  lastError = null;
  for (const range of candidateRanges) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values: [rowValues] },
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unknown Google Sheets append error");
}

function readProfiles() {
  // Deprecated: profiles are now stored in Google Sheets.
  return [];
}

function writeProfiles(profiles) {
  // Deprecated: profiles are now stored in Google Sheets.
  void profiles;
}

function getProfileByUserId(userId) {
  // Deprecated local lookup
  void userId;
  return null;
}

function upsertProfile(profile) {
  // Deprecated local upsert
  return profile;
}

function isProfileComplete(profile) {
  if (!profile) return false;
  const required = ["age", "country", "monthlyIncome", "monthlyExpenses", "currentCash"];
  return required.every((k) => profile[k] !== "" && profile[k] != null && !Number.isNaN(profile[k]));
}

function computeLedgerState(transactions) {
  let cash = 0;
  const holdings = new Map();

  const chron = [...transactions].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  for (const tx of chron) {
    const type = String(tx.type || "").toUpperCase();
    const symbol = String(tx.symbol || "").trim().toUpperCase();
    const qty = tx.qty == null ? 0 : Number(tx.qty);
    const amount = tx.amount == null ? 0 : Number(tx.amount);

    if (type === "DEPOSIT" || type === "CASH_IN") {
      cash += amount;
    } else if (type === "WITHDRAW" || type === "CASH_OUT") {
      cash -= Math.abs(amount);
    } else if (type === "BUY") {
      cash -= Math.abs(amount);
      if (symbol && qty > 0) holdings.set(symbol, (holdings.get(symbol) || 0) + qty);
    } else if (type === "SELL") {
      cash += Math.abs(amount);
      if (symbol && qty > 0) holdings.set(symbol, (holdings.get(symbol) || 0) - qty);
    } else if (type === "PORTFOLIO_IMPORT") {
      if (symbol && qty) holdings.set(symbol, (holdings.get(symbol) || 0) + Number(qty));
    }
  }

  for (const [sym, q] of holdings.entries()) {
    if (!Number.isFinite(q) || Math.abs(q) < 1e-9) holdings.delete(sym);
  }

  return {
    cash: Number.isFinite(cash) ? cash : 0,
    holdings: [...holdings.entries()]
      .map(([symbol, qty]) => ({ symbol, qty }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };
}

async function fetchPsxLatestPrice(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("symbol is required");
  const url = `https://dps.psx.com.pk/timeseries/eod/${encodeURIComponent(sym)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`PSX request failed (${res.status})`);
  const payload = await res.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  if (!rows.length) throw new Error("PSX returned no data for symbol");
  const last = rows[rows.length - 1];
  const price = Number(last?.[1]);
  if (!Number.isFinite(price)) throw new Error("PSX returned invalid latest price");
  return { price, ts: last?.[0] ?? null };
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

async function readUsersFromSheet({ forceRefresh = false } = {}) {
  const cacheTtlMs = Number(process.env.USERS_CACHE_TTL_MS || 30000);
  const now = Date.now();
  if (
    !forceRefresh &&
    Array.isArray(usersCache.users) &&
    usersCache.fetchedAt > 0 &&
    now - usersCache.fetchedAt < cacheTtlMs
  ) {
    return usersCache.users;
  }

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

  usersCache = {
    users,
    fetchedAt: Date.now(),
  };
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
      usersCache = { users: null, fetchedAt: 0 };
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unknown Google Sheets append error");
}

async function deleteUserFromSheet(userId) {
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
  const candidateRanges = [];
  if (sheetName) candidateRanges.push(`${sheetName}!A:F`);
  candidateRanges.push("Users!A:F");
  candidateRanges.push("Sheet1!A:F");
  candidateRanges.push("A:F");

  let rows = [];
  let selectedSheetName = sheetName || "Users";
  let lastError = null;
  for (const range of candidateRanges) {
    try {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      rows = Array.isArray(resp?.data?.values) ? resp.data.values : [];
      selectedSheetName = range.includes("!") ? range.split("!")[0] : selectedSheetName;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!rows.length && lastError) throw lastError;

  let rowIndex = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const id = String(row[4] || "").trim();
    if (String(row[2] || "").toLowerCase() === "email") continue;
    if (id && id === String(userId).trim()) {
      rowIndex = i + 1; // 1-indexed
      break;
    }
  }
  if (rowIndex == null) throw new Error("User row not found for deletion.");

  // Get the sheetId (tab id) for batchUpdate
  const spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabSheet = (spreadsheetMeta.data.sheets || []).find(
    (s) => String(s.properties?.title || "").toLowerCase() === selectedSheetName.toLowerCase()
  );
  const tabId = tabSheet?.properties?.sheetId ?? 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: tabId,
              dimension: "ROWS",
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });
  usersCache = { users: null, fetchedAt: 0 };
}

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  };
}

async function createUserAccount({ email, username, password }) {
  if (!email || !username || !password) {
    return { ok: false, status: 400, message: "email, username, and password are required." };
  }
  if (String(password).length < 6) {
    return { ok: false, status: 400, message: "Password must be at least 6 characters." };
  }

  let users = [];
  try {
    users = await readUsersFromSheet();
  } catch (error) {
    return {
      ok: false,
      status: 500,
      message: "Failed to read users from Google Sheet.",
      details: String(error.message || error),
    };
  }

  const emailKey = String(email).trim().toLowerCase();
  if (users.some((u) => String(u.email).toLowerCase() === emailKey)) {
    return { ok: false, status: 409, message: "Email already exists." };
  }
  if (users.some((u) => String(u.username).toLowerCase() === String(username).trim().toLowerCase())) {
    return { ok: false, status: 409, message: "Username already exists." };
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
    return {
      ok: false,
      status: 500,
      message: "Failed to store user in Google Sheet.",
      details: String(error.message || error),
    };
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

  return { ok: true, user };
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
  <body style="margin:0;background:linear-gradient(135deg,#eff6ff 0%,#f8fafc 50%,#eef2ff 100%);padding:24px;font-family:Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #dbe4f0;box-shadow:0 14px 30px rgba(15,23,42,0.08);overflow:hidden;">
      <tr>
        <td style="padding:0;background:linear-gradient(135deg,#1d4ed8,#0f172a);">
          <div style="padding:22px 24px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:.2px;">Walle-T Security Center</h1>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 24px 6px 24px;">
          <h2 style="margin:0 0 8px 0;color:#111827;">${escapeHtml(title)}</h2>
          <p style="margin:0;color:#334155;line-height:1.7;">${intro}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px 24px 24px;">${bodyHtml}</td>
      </tr>
      <tr>
        <td style="padding:0 24px 24px 24px;">
          <p style="margin:0;color:#6b7280;font-size:12px;">This is an automated security notification from Walle-T.</p>
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

async function resolveLoginLocation(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0].trim()) ||
    req.ip ||
    "";

  const normalized = String(ip).trim();
  if (!normalized || normalized === "::1" || normalized === "127.0.0.1" || normalized.toLowerCase() === "localhost") {
    return "Localhost";
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(normalized)}?fields=status,city,country`);
    if (!res.ok) return "Unknown location";
    const payload = await res.json();
    if (String(payload?.status || "").toLowerCase() !== "success") return "Unknown location";
    const city = String(payload?.city || "").trim();
    const country = String(payload?.country || "").trim();
    if (city && country) return `${city}, ${country}`;
    if (country) return country;
    return "Unknown location";
  } catch {
    return "Unknown location";
  }
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input) {
  const normalized = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf-8");
}

function stablePasswordMarker(passwordHash) {
  return crypto.createHash("sha256").update(String(passwordHash || "")).digest("hex").slice(0, 20);
}

function createPasswordResetToken(user) {
  const payloadObj = {
    uid: String(user?.id || ""),
    email: String(user?.email || "").toLowerCase(),
    ph: stablePasswordMarker(user?.passwordHash),
    exp: Date.now() + PASSWORD_RESET_TOKEN_TTL_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const payload = toBase64Url(JSON.stringify(payloadObj));
  const sig = crypto.createHmac("sha256", PASSWORD_RESET_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyPasswordResetToken(token) {
  const raw = String(token || "").trim();
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return { ok: false, reason: "Invalid token format." };
  const expected = crypto.createHmac("sha256", PASSWORD_RESET_SECRET).update(payload).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "Invalid token signature." };
  }
  try {
    const data = JSON.parse(fromBase64Url(payload));
    if (Date.now() > Number(data?.exp || 0)) {
      return { ok: false, reason: "Reset link expired." };
    }
    if (!data?.uid || !data?.email) {
      return { ok: false, reason: "Invalid token payload." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "Invalid token payload." };
  }
}

async function updateUserPasswordInSheet({ userId, passwordHash }) {
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
  const candidateRanges = [];
  if (sheetName) candidateRanges.push(`${sheetName}!A:F`);
  candidateRanges.push("Users!A:F");
  candidateRanges.push("Sheet1!A:F");
  candidateRanges.push("A:F");

  let rows = [];
  let selectedSheet = sheetName || "Users";
  let lastError = null;
  for (const range of candidateRanges) {
    try {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      rows = Array.isArray(resp?.data?.values) ? resp.data.values : [];
      selectedSheet = range.includes("!") ? range.split("!")[0] : selectedSheet;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!rows.length && lastError) throw lastError;

  let rowIndex = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const id = String(row[4] || "").trim();
    if (String(row[2] || "").toLowerCase() === "email") continue;
    if (id && id === String(userId).trim()) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex == null) {
    throw new Error("User row not found for password update.");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${selectedSheet}!D${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [[passwordHash]] },
  });
  usersCache = { users: null, fetchedAt: 0 };
}

function buildLoginEmailHtml(user, { location, resetUrl }) {
  const loginAt = new Date().toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" });

  return emailLayout({
    title: "Login Detected",
    intro: `Hi <strong>${escapeHtml(user.username)}</strong>, your account was just accessed.`,
    bodyHtml: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbe4f0;border-radius:10px;">
        <tr><td style="padding:12px 14px;border-bottom:1px solid #dbe4f0;"><strong>Time</strong>: ${escapeHtml(loginAt)}</td></tr>
        <tr><td style="padding:12px 14px;"><strong>Location</strong>: ${escapeHtml(location || "Unknown location")}</td></tr>
      </table>
      <p style="margin:14px 0 12px 0;color:#b91c1c;line-height:1.6;">
        If this was not you, secure your account immediately.
      </p>
      <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;">
        Change Password
      </a>
      <p style="margin:10px 0 0 0;color:#6b7280;font-size:12px;line-height:1.5;">
        This link expires in ${Math.max(1, Math.floor(PASSWORD_RESET_TOKEN_TTL_MS / 60000))} minutes.
      </p>
    `,
  });
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function generateSyntheticSeries(seedKey, { points = 120, start = 100, volatility = 0.004 } = {}) {
  const seed = hashString(seedKey);
  const out = [];
  let price = start;
  const now = Date.now();
  for (let i = points - 1; i >= 0; i -= 1) {
    const t = now - i * 60 * 60 * 1000;
    const wave = Math.sin((seed % 37) * 0.1 + i * 0.17) * volatility;
    const drift = ((seed % 11) - 5) * 0.00006;
    const step = wave + drift;
    price = Math.max(0.0001, price * (1 + step));
    out.push({
      time: new Date(t).toISOString(),
      value: Number(price.toFixed(6)),
    });
  }
  return out;
}

function parseForexPair(pair) {
  const normalized = String(pair || "").trim().toUpperCase();
  if (!/^[A-Z]{6}$/.test(normalized)) return null;
  return {
    pair: normalized,
    base: normalized.slice(0, 3),
    quote: normalized.slice(3),
  };
}

async function fetchForexFromProvider(pair) {
  const parsed = parseForexPair(pair);
  if (!parsed) throw new Error("Invalid forex pair");

  const end = new Date();
  const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const rangeUrl = `https://api.frankfurter.app/${startStr}..${endStr}?from=${parsed.base}&to=${parsed.quote}`;
  const latestUrl = `https://api.frankfurter.app/latest?from=${parsed.base}&to=${parsed.quote}`;

  const [rangeRes, latestRes] = await Promise.all([fetch(rangeUrl), fetch(latestUrl)]);
  if (!rangeRes.ok || !latestRes.ok) {
    throw new Error(`Forex provider failed (range=${rangeRes.status}, latest=${latestRes.status})`);
  }

  const rangeData = await rangeRes.json();
  const latestData = await latestRes.json();
  const rates = rangeData?.rates && typeof rangeData.rates === "object" ? rangeData.rates : {};
  const series = Object.entries(rates)
    .map(([date, values]) => {
      const value = Number(values?.[parsed.quote]);
      return { time: `${date}T00:00:00.000Z`, value };
    })
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  const latestValue = Number(latestData?.rates?.[parsed.quote]);
  if (!Number.isFinite(latestValue) || series.length === 0) {
    throw new Error("Forex provider returned no usable quote/series");
  }

  return {
    pair: parsed.pair,
    latest: { time: new Date().toISOString(), value: latestValue },
    series,
    source: "frankfurter",
  };
}

async function fetchOptionsFromProvider(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("symbol is required");

  const baseUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}`;
  const headers = { "user-agent": "Mozilla/5.0" };
  const mainRes = await fetch(baseUrl, { headers });
  if (!mainRes.ok) throw new Error(`Options provider failed (${mainRes.status})`);
  const main = await mainRes.json();
  const result = main?.optionChain?.result?.[0];
  if (!result) throw new Error("Options provider returned empty result");

  const expirationDates = Array.isArray(result.expirationDates) ? result.expirationDates.slice(0, 3) : [];
  const snapshots = [{ data: result, expiryTs: result?.options?.[0]?.expirationDate || expirationDates[0] }];
  for (const ts of expirationDates.slice(1)) {
    try {
      const r = await fetch(`${baseUrl}?date=${ts}`, { headers });
      if (!r.ok) continue;
      const j = await r.json();
      const d = j?.optionChain?.result?.[0];
      if (d) snapshots.push({ data: d, expiryTs: ts });
    } catch {
      // ignore non-critical expiry failures
    }
  }

  const chain = [];
  for (const snap of snapshots) {
    const options = snap.data?.options?.[0] || {};
    const calls = Array.isArray(options.calls) ? options.calls : [];
    const puts = Array.isArray(options.puts) ? options.puts : [];
    const byStrike = new Map();
    for (const c of calls) {
      const strike = Number(c?.strike);
      if (!Number.isFinite(strike)) continue;
      byStrike.set(strike, {
        callPremium: Number(c?.lastPrice ?? c?.bid ?? c?.ask),
        expiry: new Date((Number(c?.expiration) || snap.expiryTs) * 1000).toISOString().slice(0, 10),
      });
    }
    for (const p of puts) {
      const strike = Number(p?.strike);
      if (!Number.isFinite(strike)) continue;
      const prev = byStrike.get(strike) || {
        expiry: new Date((Number(p?.expiration) || snap.expiryTs) * 1000).toISOString().slice(0, 10),
      };
      prev.putPremium = Number(p?.lastPrice ?? p?.bid ?? p?.ask);
      byStrike.set(strike, prev);
    }
    for (const [strike, entry] of byStrike.entries()) {
      if (!Number.isFinite(entry.callPremium) && !Number.isFinite(entry.putPremium)) continue;
      chain.push({
        symbol: sym,
        expiry: entry.expiry,
        strike: Number(strike.toFixed(2)),
        callPremium: Number.isFinite(entry.callPremium) ? Number(entry.callPremium.toFixed(2)) : null,
        putPremium: Number.isFinite(entry.putPremium) ? Number(entry.putPremium.toFixed(2)) : null,
      });
    }
  }

  const quote = result?.quote || {};
  const spot = Number(
    quote?.regularMarketPrice ??
      quote?.postMarketPrice ??
      quote?.bid ??
      quote?.ask
  );
  if (!Number.isFinite(spot) || chain.length === 0) {
    throw new Error("Options provider returned no usable chain");
  }

  const series = generateSyntheticSeries(`underlying:${sym}`, {
    points: 120,
    start: spot,
    volatility: 0.0032,
  });

  return {
    symbol: sym,
    spot: Number(spot.toFixed(2)),
    chain: chain
      .sort((a, b) => {
        if (a.expiry !== b.expiry) return a.expiry.localeCompare(b.expiry);
        return a.strike - b.strike;
      })
      .slice(0, 300),
    series,
    source: "yahoo",
  };
}

async function priceHoldings(holdings) {
  const priced = [];
  let total = 0;
  for (const h of holdings) {
    const sym = String(h.symbol || "").trim().toUpperCase();
    const qty = Number(h.qty);
    if (!sym || !Number.isFinite(qty) || qty <= 0) continue;
    try {
      const { price } = await fetchPsxLatestPrice(sym);
      const value = price * qty;
      priced.push({ symbol: sym, qty, price, value });
      total += value;
    } catch {
      priced.push({ symbol: sym, qty, price: null, value: null });
    }
  }
  return { positions: priced, totalValue: total };
}

function buildNetWorthProjection({
  months = 120,
  baseNetWorthNow,
  monthlyNetCashflow,
  investableNow,
  annualReturn,
  expenseShock = 0,
}) {
  const series = [];
  let netWorth = baseNetWorthNow;
  let investable = investableNow;
  const monthlyR = Math.pow(1 + annualReturn, 1 / 12) - 1;

  for (let m = 0; m <= months; m += 1) {
    const t = new Date();
    t.setMonth(t.getMonth() + m);
    series.push({ time: t.toISOString().slice(0, 10), value: Number(netWorth.toFixed(2)) });

    const cashflow = monthlyNetCashflow * (1 - expenseShock);
    investable = investable * (1 + monthlyR);
    netWorth = netWorth + cashflow + investable * monthlyR;
  }

  return series;
}

registerHealthRoutes(app, {
  getGoogleConfig,
  getTransactionalSheetConfig,
  getProfilesSheetConfig,
  getGeminiClient,
  GEMINI_MODEL,
});

registerAuthRoutes(app, {
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
});

registerActivitiesRoutes(app, {
  readActivities,
  writeActivities,
  readUsersFromSheet,
  crypto,
});

registerAdvisorRoutes(app, {
  getGeminiClient,
  readUsersFromSheet,
  checkAndConsumeAdvisorPrompt,
  formatDurationMs,
  ADVISOR_MIN_INTERVAL_MS,
  ADVISOR_MAX_IN_WINDOW,
  ADVISOR_WINDOW_MS,
  readActivities,
  buildPortfolioSummary,
  readProfileFromSheet,
  readTransactionsForUser,
  computeLedgerState,
  buildFinancialProfileSummary,
  buildLedgerSummary,
  isProfileComplete,
  extractGroundingSources,
  isGeminiQuotaError,
  classifyGeminiError,
  GEMINI_MODEL,
});

registerProfileRoutes(app, {
  readProfileFromSheet,
  isProfileComplete,
  upsertProfileToSheet,
});

registerOnboardingRoutes(app, {
  readProfileFromSheet,
  upsertProfileToSheet,
  readTransactionsForUser,
  computeLedgerState,
  DEFAULT_STARTING_INVESTMENT_USD,
  appendTransactionRow,
  isProfileComplete,
});

registerPortfolioRoutes(app, {
  readProfileFromSheet,
  readTransactionsForUser,
  isProfileComplete,
  computeLedgerState,
});

registerTradeRoutes(app, {
  readTransactionsForUser,
  computeLedgerState,
  fetchPsxLatestPrice,
  appendTransactionRow,
  fetchForexFromProvider,
  hashString,
  generateSyntheticSeries,
  fetchOptionsFromProvider,
});

registerForecastRoutes(app, {
  readProfileFromSheet,
  isProfileComplete,
  readTransactionsForUser,
  computeLedgerState,
  priceHoldings,
  buildNetWorthProjection,
  getGeminiClient,
  GEMINI_MODEL,
});

registerModelPredictionRoutes(app, {
  readModelPredictions,
});

registerSettingsRoutes(app, {
  readProfileFromSheet,
  upsertProfileToSheet,
});

registerMarketRoutes(app, {
  fetchForexFromProvider,
  hashString,
  generateSyntheticSeries,
  fetchOptionsFromProvider,
});

registerRiskRoutes(app, {
  readTransactionsForUser,
  clamp,
});

registerAdminRoutes(app, {
  readUsersFromSheet,
  readTransactionsForUser,
  computeLedgerState,
  readProfileFromSheet,
  deleteUserFromSheet,
  priceHoldings,
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
