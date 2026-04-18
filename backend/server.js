const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const PORT = Number(process.env.BACKEND_PORT || 4001);
const USERS_PATH = path.resolve(__dirname, "data", "users.json");
const ACTIVITIES_PATH = path.resolve(__dirname, "data", "activities.json");

const app = express();
app.use(cors());
app.use(express.json());

function ensureUsersFile() {
  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USERS_PATH)) fs.writeFileSync(USERS_PATH, "[]", "utf-8");
}

function readUsers() {
  ensureUsersFile();
  try {
    const raw = fs.readFileSync(USERS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureUsersFile();
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), "utf-8");
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

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  };
}

app.get("/api/health", (_req, res) => {
  const cfg = getGoogleConfig();
  res.json({
    ok: true,
    sheetIdPresent: Boolean(cfg.sheetId),
    serviceEmailPresent: Boolean(cfg.clientEmail),
    privateKeyPresent: Boolean(cfg.privateKey),
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

  const users = readUsers();
  const emailKey = String(email).trim().toLowerCase();
  const usernameKey = String(username).trim().toLowerCase();
  if (users.some((u) => String(u.email).toLowerCase() === emailKey)) {
    return res.status(409).json({ ok: false, message: "Email already exists." });
  }
  if (users.some((u) => String(u.username).toLowerCase() === usernameKey)) {
    return res.status(409).json({ ok: false, message: "Username already exists." });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = {
    id: crypto.randomUUID(),
    email: String(email).trim(),
    username: String(username).trim(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeUsers(users);

  try {
    await appendSignupToSheet({ email: user.email, username: user.username });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "User created locally, but failed to write to Google Sheet.",
      details: String(error.message || error),
    });
  }

  return res.json({ ok: true, user: safeUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const { usernameOrEmail, password } = req.body || {};
  if (!usernameOrEmail || !password) {
    return res.status(400).json({ ok: false, message: "username/email and password are required." });
  }

  const key = String(usernameOrEmail).trim().toLowerCase();
  const users = readUsers();
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

app.post("/api/activities", (req, res) => {
  const { userId, symbol, activityType, budget, note } = req.body || {};
  if (!userId || !symbol || !activityType) {
    return res.status(400).json({
      ok: false,
      message: "userId, symbol, and activityType are required.",
    });
  }

  const users = readUsers();
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

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
