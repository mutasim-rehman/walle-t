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

const projectRoot = path.resolve(__dirname, "..");
const dotenvCandidates = [".env", "env"];
for (const candidate of dotenvCandidates) {
  const fullPath = path.join(projectRoot, candidate);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
    break;
  }
}

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
  return res.json({ ok: true, user: safeUser(result.user) });
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

  // Run onboarding bootstrap in the same request so signup+onboarding is one step.
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
    monthlyExpenses:
      payload.monthlyExpenses == null || payload.monthlyExpenses === "" ? null : Number(payload.monthlyExpenses),
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

  const advisorQuota = checkAndConsumeAdvisorPrompt(user.id);
  if (!advisorQuota.allowed) {
    return res.status(429).json({
      ok: false,
      message: `${advisorQuota.message} Try again in ${formatDurationMs(advisorQuota.retryAfterMs)}.`,
      retryAfterSec: advisorQuota.retryAfterSec,
      lock: {
        minIntervalMs: ADVISOR_MIN_INTERVAL_MS,
        maxPrompts: ADVISOR_MAX_IN_WINDOW,
        windowMs: ADVISOR_WINDOW_MS,
      },
    });
  }

  const activities = readActivities()
    .filter((activity) => activity.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const portfolio = buildPortfolioSummary(activities);

  let profile = null;
  try {
    profile = await readProfileFromSheet(user.id);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to read profile from Google Sheet.",
      details: String(error.message || error),
    });
  }

  let transactions = [];
  try {
    transactions = await readTransactionsForUser(user.id, { limit: 400 });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to read transactions from Google Sheet.",
      details: String(error.message || error),
    });
  }

  const ledger = computeLedgerState(transactions);
  const financialProfile = buildFinancialProfileSummary(profile);
  const ledgerSummary = buildLedgerSummary(transactions, ledger);
  const today = new Date().toISOString().slice(0, 10);
  const prompt = [
    "You are Walle-T's financial advisor chatbot for an educational trading simulator.",
    "Give practical financial guidance based on this user's current portfolio, transactions, and balance sheet.",
    "Use current affairs when relevant by grounding with Google Search.",
    "Do not claim certainty or guaranteed returns, and clearly label assumptions.",
    "This is educational analysis, not professional financial advice.",
    "",
    `Date: ${today}`,
    `User: ${user.username} (${user.email})`,
    "",
    "Saved activity context:",
    portfolio.summary,
    "",
    "Financial profile context:",
    financialProfile.summary,
    "",
    "Current simulated portfolio + transactions context:",
    ledgerSummary,
    "",
    "User question:",
    String(message).trim(),
    "",
    "Answer format:",
    "1. Short answer",
    "2. Portfolio observations (holdings, cashflow, concentration)",
    "3. Assets/liabilities implications",
    "4. Current-affairs impact",
    "5. Concrete next actions (3-5 bullets)",
  ].join("\n");

  try {
    let response = null;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          temperature: 0.3,
          tools: [{ googleSearch: {} }],
        },
      });
    } catch (searchError) {
      if (!isGeminiQuotaError(searchError)) throw searchError;
      // Fallback: if search-tool quota is exhausted, still try a plain response.
      response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          temperature: 0.3,
        },
      });
    }

    return res.json({
      ok: true,
      reply: String(response?.text || "").trim(),
      model: GEMINI_MODEL,
      portfolio,
      profileComplete: isProfileComplete(profile),
      financialProfile: {
        assetsTotal: financialProfile.assetsTotal,
        liabilitiesTotal: financialProfile.liabilitiesTotal,
        cash: ledger.cash,
        holdingsCount: ledger.holdings.length,
      },
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

app.get("/api/profile/:userId", (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ ok: false, message: "userId is required." });
  readProfileFromSheet(userId)
    .then((profile) => res.json({ ok: true, profile, isComplete: isProfileComplete(profile) }))
    .catch((error) =>
      res.status(500).json({
        ok: false,
        message:
          "Failed to read profile from Google Sheet. Ensure the Transactional_History spreadsheet is shared with your service account email.",
        details: String(error.message || error),
      })
    );
});

app.post("/api/profile/:userId", (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ ok: false, message: "userId is required." });
  const body = req.body || {};

  const profile = {
    userId,
    age: body.age == null || body.age === "" ? null : Number(body.age),
    country: String(body.country || "").trim(),
    monthlyIncome: body.monthlyIncome == null || body.monthlyIncome === "" ? null : Number(body.monthlyIncome),
    monthlyExpenses: body.monthlyExpenses == null || body.monthlyExpenses === "" ? null : Number(body.monthlyExpenses),
    currentCash: body.currentCash == null || body.currentCash === "" ? null : Number(body.currentCash),
    assets: body.assets && typeof body.assets === "object" ? body.assets : {},
    liabilities: body.liabilities && typeof body.liabilities === "object" ? body.liabilities : {},
    extras: body.extras && typeof body.extras === "object" ? body.extras : {},
    updatedAt: new Date().toISOString(),
    createdAt: body.createdAt || new Date().toISOString(),
  };

  upsertProfileToSheet(profile)
    .then(() => res.json({ ok: true, profile, isComplete: isProfileComplete(profile) }))
    .catch((error) =>
      res.status(500).json({
        ok: false,
        message:
          "Failed to store profile in Google Sheet. Ensure the Transactional_History spreadsheet is shared with your service account email.",
        details: String(error.message || error),
      })
    );
});

app.post("/api/onboarding/complete", async (req, res) => {
  const { userId, profile: rawProfile, initialHoldings } = req.body || {};
  const id = String(userId || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "userId is required." });

  // Save profile (minimal required)
  const profilePayload = rawProfile && typeof rawProfile === "object" ? rawProfile : {};
  let existingProfile = null;
  try {
    existingProfile = await readProfileFromSheet(id);
  } catch {
    existingProfile = null;
  }
  const nextProfile = {
    userId: id,
    age: profilePayload.age == null || profilePayload.age === "" ? null : Number(profilePayload.age),
    country: String(profilePayload.country || "").trim(),
    monthlyIncome:
      profilePayload.monthlyIncome == null || profilePayload.monthlyIncome === ""
        ? null
        : Number(profilePayload.monthlyIncome),
    monthlyExpenses:
      profilePayload.monthlyExpenses == null || profilePayload.monthlyExpenses === ""
        ? null
        : Number(profilePayload.monthlyExpenses),
    currentCash:
      profilePayload.currentCash == null || profilePayload.currentCash === ""
        ? null
        : Number(profilePayload.currentCash),
    assets: profilePayload.assets && typeof profilePayload.assets === "object" ? profilePayload.assets : {},
    liabilities: profilePayload.liabilities && typeof profilePayload.liabilities === "object" ? profilePayload.liabilities : {},
    extras: profilePayload.extras && typeof profilePayload.extras === "object" ? profilePayload.extras : {},
    updatedAt: new Date().toISOString(),
    createdAt: existingProfile?.createdAt || new Date().toISOString(),
  };
  try {
    await upsertProfileToSheet(nextProfile);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message:
        "Failed to store profile in Google Sheet. Ensure the Transactional_History spreadsheet is shared with your service account email.",
      details: String(error.message || error),
    });
  }

  // Ledger bootstrap (deposit only once)
  let existing = [];
  try {
    existing = await readTransactionsForUser(id, { limit: 500 });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message:
        "Failed to read transactions from Google Sheet. Ensure the Transactional_History spreadsheet is shared with your service account email.",
      details: String(error.message || error),
    });
  }

  const hasDeposit = existing.some((tx) => String(tx.type || "").toUpperCase() === "DEPOSIT");
  let cashAfter = computeLedgerState(existing).cash;
  const createdAt = new Date().toISOString();

  try {
    if (!hasDeposit) {
      cashAfter += DEFAULT_STARTING_INVESTMENT_USD;
      await appendTransactionRow({
        createdAt,
        userId: id,
        type: "DEPOSIT",
        symbol: "",
        qty: "",
        price: "",
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
        userId: id,
        type: "PORTFOLIO_IMPORT",
        symbol,
        qty,
        price: "",
        amount: "",
        cashAfter: "",
        note: "Imported initial portfolio holding.",
        metaJson: { source: "onboarding" },
      });
    }
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to write onboarding transactions to Google Sheet.",
      details: String(error.message || error),
    });
  }

  return res.json({ ok: true, profile: nextProfile, isComplete: isProfileComplete(nextProfile) });
});

app.get("/api/portfolio/:userId", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ ok: false, message: "userId is required." });

  let profile = null;
  try {
    profile = await readProfileFromSheet(userId);
  } catch {
    profile = null;
  }
  let transactions = [];
  try {
    transactions = await readTransactionsForUser(userId, { limit: 300 });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to read transactions from Google Sheet.",
      details: String(error.message || error),
    });
  }

  const ledger = computeLedgerState(transactions);
  return res.json({
    ok: true,
    profile,
    profileComplete: isProfileComplete(profile),
    cash: ledger.cash,
    holdings: ledger.holdings,
    transactions,
  });
});

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
      note: `Trade executed at latest PSX close.`,
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

app.post("/api/forecast", async (req, res) => {
  const { userId } = req.body || {};
  const id = String(userId || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "userId is required." });

  let profile = null;
  try {
    profile = await readProfileFromSheet(id);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to read profile from Google Sheet.",
      details: String(error.message || error),
    });
  }
  if (!isProfileComplete(profile)) {
    return res.status(400).json({ ok: false, message: "Profile is incomplete. Complete onboarding first." });
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
  const priced = await priceHoldings(ledger.holdings);

  const otherAssetsTotal = Number(profile?.assets?.total || 0) || 0;
  const otherLiabilitiesTotal = Number(profile?.liabilities?.total || 0) || 0;
  const cashOutsidePortfolio = Number(profile.currentCash || 0) || 0;

  const netWorthNow = cashOutsidePortfolio + ledger.cash + priced.totalValue + otherAssetsTotal - otherLiabilitiesTotal;
  const monthlyNetCashflow = (Number(profile.monthlyIncome || 0) || 0) - (Number(profile.monthlyExpenses || 0) || 0);
  const investableNow = ledger.cash + priced.totalValue;

  const base = buildNetWorthProjection({
    baseNetWorthNow: netWorthNow,
    monthlyNetCashflow,
    investableNow,
    annualReturn: 0.06,
    expenseShock: 0,
  });
  const best = buildNetWorthProjection({
    baseNetWorthNow: netWorthNow,
    monthlyNetCashflow,
    investableNow,
    annualReturn: 0.09,
    expenseShock: 0,
  });
  const worst = buildNetWorthProjection({
    baseNetWorthNow: netWorthNow,
    monthlyNetCashflow,
    investableNow,
    annualReturn: 0.03,
    expenseShock: 0.15,
  });

  // Optional narrative via Gemini (best effort).
  let narrative = "";
  const ai = getGeminiClient();
  if (ai) {
    try {
      const prompt = [
        "You are a financial future simulator assistant for an MVP app.",
        "Summarize the forecast results clearly as best/base/worst scenarios.",
        "Be realistic: no guaranteed returns, mention uncertainty and key drivers.",
        "Return 6-10 bullet points, each 1-2 sentences.",
        "",
        `User monthly income: ${Number(profile.monthlyIncome).toFixed(2)}`,
        `User monthly expenses: ${Number(profile.monthlyExpenses).toFixed(2)}`,
        `Net worth now: ${netWorthNow.toFixed(2)}`,
        `Investable now (cash+portfolio): ${investableNow.toFixed(2)}`,
        `Other assets total: ${otherAssetsTotal.toFixed(2)}`,
        `Other liabilities total: ${otherLiabilitiesTotal.toFixed(2)}`,
        "",
        `Base net worth in 10y: ${base[base.length - 1].value}`,
        `Best net worth in 10y: ${best[best.length - 1].value}`,
        `Worst net worth in 10y: ${worst[worst.length - 1].value}`,
      ].join("\n");

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { temperature: 0.3 },
      });
      narrative = String(response?.text || "").trim();
    } catch {
      narrative = "";
    }
  }

  return res.json({
    ok: true,
    now: {
      netWorth: netWorthNow,
      investable: investableNow,
      cashOutsidePortfolio,
      ledgerCash: ledger.cash,
      portfolioValue: priced.totalValue,
      otherAssetsTotal,
      otherLiabilitiesTotal,
      monthlyNetCashflow,
      positions: priced.positions,
    },
    series: { best, base, worst },
    narrative,
  });
});

app.get("/api/settings/:userId", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ ok: false, message: "userId is required." });
  let profile = null;
  try {
    profile = await readProfileFromSheet(userId);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to read settings from Google Sheet.",
      details: String(error.message || error),
    });
  }
  const settings = profile?.extras?.settings || {
    currency: "USD",
    timezone: "UTC",
    riskMode: "moderate",
    notifications: true,
  };
  return res.json({ ok: true, settings });
});

app.post("/api/settings/:userId", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ ok: false, message: "userId is required." });
  const incoming = req.body?.settings && typeof req.body.settings === "object" ? req.body.settings : {};

  let profile = null;
  try {
    profile = await readProfileFromSheet(userId);
  } catch {
    profile = null;
  }
  const nextProfile = {
    userId,
    age: profile?.age ?? null,
    country: profile?.country || "",
    monthlyIncome: profile?.monthlyIncome ?? null,
    monthlyExpenses: profile?.monthlyExpenses ?? null,
    currentCash: profile?.currentCash ?? null,
    assets: profile?.assets || {},
    liabilities: profile?.liabilities || {},
    extras: {
      ...(profile?.extras || {}),
      settings: {
        currency: String(incoming.currency || profile?.extras?.settings?.currency || "USD"),
        timezone: String(incoming.timezone || profile?.extras?.settings?.timezone || "UTC"),
        riskMode: String(incoming.riskMode || profile?.extras?.settings?.riskMode || "moderate"),
        notifications:
          typeof incoming.notifications === "boolean"
            ? incoming.notifications
            : Boolean(profile?.extras?.settings?.notifications ?? true),
      },
    },
    updatedAt: new Date().toISOString(),
    createdAt: profile?.createdAt || new Date().toISOString(),
  };
  try {
    await upsertProfileToSheet(nextProfile);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to save settings to Google Sheet.",
      details: String(error.message || error),
    });
  }
  return res.json({ ok: true, settings: nextProfile.extras.settings });
});

app.get("/api/market/forex/:pair", async (req, res) => {
  const pair = String(req.params.pair || "").trim().toUpperCase();
  if (!/^[A-Z]{6}$/.test(pair)) {
    return res.status(400).json({ ok: false, message: "pair must be 6 letters, e.g. EURUSD" });
  }
  try {
    const data = await fetchForexFromProvider(pair);
    return res.json({ ok: true, ...data, providerFallback: false });
  } catch (error) {
    const start = 1 + (hashString(pair) % 50) / 100;
    const series = generateSyntheticSeries(`forex:${pair}`, { points: 160, start, volatility: 0.0015 });
    return res.json({
      ok: true,
      pair,
      series,
      latest: series[series.length - 1],
      source: "synthetic-fallback",
      providerFallback: true,
      details: String(error.message || error),
    });
  }
});

app.get("/api/market/options/:symbol", async (req, res) => {
  const symbol = String(req.params.symbol || "").trim().toUpperCase();
  if (!symbol) return res.status(400).json({ ok: false, message: "symbol is required." });
  try {
    const data = await fetchOptionsFromProvider(symbol);
    return res.json({ ok: true, ...data, providerFallback: false });
  } catch (error) {
    const seed = hashString(symbol);
    const spot = 80 + (seed % 400) / 5;
    const expiries = [14, 30, 60].map((d) => {
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      return dt.toISOString().slice(0, 10);
    });
    const strikes = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15].map((p) => Number((spot * (1 + p)).toFixed(2)));
    const chain = [];
    for (const expiry of expiries) {
      for (const strike of strikes) {
        const moneyness = Math.abs((strike - spot) / spot);
        const timeValue = Math.max(0.5, (60 - Math.abs(new Date(expiry) - Date.now()) / (1000 * 60 * 60 * 24)) * 0.03);
        const basePremium = Math.max(0.2, spot * (0.015 + moneyness * 0.2) + timeValue);
        const callPremium = Number(basePremium.toFixed(2));
        const putPremium = Number((basePremium * (0.95 + moneyness)).toFixed(2));
        chain.push({
          symbol,
          expiry,
          strike,
          callPremium,
          putPremium,
        });
      }
    }
    const series = generateSyntheticSeries(`options:${symbol}`, { points: 140, start: spot, volatility: 0.0035 });
    return res.json({
      ok: true,
      symbol,
      spot: Number(spot.toFixed(2)),
      chain,
      series,
      source: "synthetic-fallback",
      providerFallback: true,
      details: String(error.message || error),
    });
  }
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
    const match = snapshot.chain.find(
      (entry) =>
        String(entry.expiry) === String(expiry) &&
        Number(entry.strike) === Number(strikeNum)
    );
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

app.get("/api/risk/:userId", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ ok: false, message: "userId is required." });
  let transactions = [];
  try {
    transactions = await readTransactionsForUser(userId, { limit: 1200 });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Failed to read transactions.", details: String(error.message || error) });
  }
  const byAsset = {
    stock: 0,
    forex: 0,
    option: 0,
    other: 0,
  };
  const bySymbolAmount = new Map();
  for (const tx of transactions) {
    const assetClass = tx.metaJson?.assetClass || (String(tx.type || "").includes("FOREX") ? "forex" : String(tx.type || "").includes("OPTION") ? "option" : ["BUY", "SELL", "PORTFOLIO_IMPORT"].includes(String(tx.type || "").toUpperCase()) ? "stock" : "other");
    const amount = Math.abs(Number(tx.amount || 0));
    if (!Number.isFinite(amount)) continue;
    if (!byAsset[assetClass]) byAsset[assetClass] = 0;
    byAsset[assetClass] += amount;
    const s = String(tx.symbol || "UNKNOWN");
    bySymbolAmount.set(s, (bySymbolAmount.get(s) || 0) + amount);
  }
  const totalExposure = Object.values(byAsset).reduce((a, b) => a + b, 0);
  const topSymbols = [...bySymbolAmount.entries()]
    .map(([symbol, exposure]) => ({ symbol, exposure }))
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, 5);
  const concentration = topSymbols.length ? topSymbols[0].exposure / Math.max(1, totalExposure) : 0;
  const riskScore = clamp(Math.round(100 - concentration * 55 - (byAsset.option / Math.max(1, totalExposure)) * 20 - (byAsset.forex / Math.max(1, totalExposure)) * 10), 15, 95);
  return res.json({
    ok: true,
    risk: {
      score: riskScore,
      totalExposure,
      concentration: Number((concentration * 100).toFixed(2)),
      assetMix: Object.fromEntries(Object.entries(byAsset).map(([k, v]) => [k, Number(v.toFixed(2))])),
      topSymbols,
      shocks: {
        equityMinus10Pct: Number((totalExposure * 0.1).toFixed(2)),
        fxMinus5Pct: Number((byAsset.forex * 0.05).toFixed(2)),
        volSpikeOptionsMinus20Pct: Number((byAsset.option * 0.2).toFixed(2)),
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
