# Walle-T

Trading + financial-advisor simulator. **Frontend** is a Vite/React SPA deployed on Vercel; **backend** is an Express service deployed on Render with Google Sheets as the data layer.

Live URL: `https://walle-t.vercel.app`.

---

## Architecture

```
Browser  ──HTTPS──▶  Vercel SPA  ──/api rewrite──▶  Render backend  ──▶  Google Sheets / Gemini / market providers
```

- Same-origin `/api/*` from the browser; Vercel server-side rewrites that to the Render service.
- Authentication uses signed session tokens (HMAC-SHA256). The frontend stores `{ user, token }` in `localStorage` and sends `Authorization: Bearer <token>` on every request.
- Per-user serialization (`runSerial`) prevents racy double-spend on the Sheets-backed ledger.

---

## Local development

### Prerequisites
- Node.js 20+
- A Google service account with `Sheets` scope shared on the user/transactional spreadsheets
- (Optional) Gemini API key for the advisor and forecast narrative

### Run
```bash
# from repo root
cp .env.example .env   # if you keep one; else create .env manually with the keys below

# backend
cd backend && npm install && npm run dev   # listens on $PORT or $BACKEND_PORT or 4001

# frontend (separate terminal)
cd frontend && npm install && npm run dev  # Vite on http://localhost:5173, proxies /api → 4001
```

---

## Production deployment

### Frontend on Vercel
- Build command: `vite build` (default).
- Output dir: `dist` (default).
- `frontend/vercel.json` rewrites:
  - `/api/:path*` → the Render backend URL (currently `https://walle-t-1.onrender.com`).
  - `/psx/:path*` → `https://dps.psx.com.pk`.
  - `/(.*)` → `index.html` (SPA fallback).
- Update the rewrite if the Render hostname changes.

### Backend on Render
- Start command: `node server.js`.
- Render injects `PORT`; the server binds to `process.env.PORT || BACKEND_PORT || 4001`.
- Health check: `GET /api/health` (public, returns `{ ok: true, time }`). Detailed flags live at `GET /api/health/deep` and require an admin token.

---

## Environment variables (backend, Render dashboard)

### Mandatory
| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | HMAC secret for user session tokens. **Required in production**, fail-fast if missing. |
| `PASSWORD_RESET_SECRET` | HMAC secret for password-reset links. **Required in production**. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list. Defaults to `https://walle-t.vercel.app,http://localhost:5173`. |
| `PUBLIC_APP_URL` | Used in email links and the password-reset form `action`. Set to `https://walle-t.vercel.app` (or your custom domain). |
| `GOOGLE_SPREADSHEET_ID` | Users sheet ID. Aliases: `Google_Sheet_Id`. |
| `GOOGLE_CLIENT_EMAIL` | Service-account email. Aliases: `GOOGLE_SERVICE_ACCOUNT_EMAIL`. |
| `GOOGLE_PRIVATE_KEY` | Service-account private key. Use `\n` for newlines. Alias: `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. |
| `Transactional_History` | Spreadsheet for transactions + profiles. URL or ID accepted. |
| `GEMINI_API_KEY` | Advisor + forecast narrative. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Outgoing email (login alerts, password-reset link). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin panel login credentials. |

> **SMTP names are `SMTP_*`**, not `SMPT_*`. The codebase tolerates `SMPT_*` for a few legacy fields, but always set `SMTP_*` in new deployments.

### Optional
| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3-flash-preview` | Override the advisor model. |
| `SESSION_TOKEN_TTL_MS` | 7 days | Session token lifetime. |
| `PASSWORD_RESET_TOKEN_TTL_MS` | 30 minutes | Reset link lifetime. |
| `USERS_CACHE_TTL_MS` | 120000 | In-memory cache for the users sheet. |
| `PROVIDER_TIMEOUT_MS` | 10000 | Timeout for outgoing market-data calls. |
| `API_RATE_WINDOW_MS`, `API_RATE_MAX` | 60000 / 240 | Per-IP rate-limit window. |
| `RATE_BUCKET_SWEEP_MS` | 60000 | How often the rate-limit map is pruned. |
| `RATE_BUCKET_MAX_KEYS` | 10000 | Hard cap on tracked rate-limit keys. |
| `SMTP_SECURE` | `false` | Set `true` for port 465 implicit TLS. |
| `SMTP_FROM`, `SMTP_APP_NAME` | derived | Customize the sender. |
| `GOOGLE_SHEET_NAME`, `TRANSACTION_SHEET_NAME`, `PROFILES_SHEET_NAME` | auto | Override sheet/tab names. |
| `MODEL_PREDICTIONS_PATH` | `backend/data/psx_model_symbol_predictions.json` | Path to the model output JSON. |

---

## Frontend env vars (Vercel)
None are required for the standard rewrite-based setup. Optionally:
- `VITE_BACKEND_LINK` or `VITE_API_BASE_URL` — set explicitly only if you want the browser to call Render directly instead of using the Vercel rewrite.

---

## Pre-deploy checklist
1. Render dashboard contains every mandatory env var above.
2. **Rotate** every secret that previously lived in a tracked `.env`/`env` file (Gemini key, service-account private key, SMTP password).
3. `frontend/vercel.json` rewrite host matches the live Render URL.
4. `backend/data/profiles.json`, `users.json`, `activities.json` are gitignored and not present in the production image.
5. Login → confirm you receive the alert email; the **Change Password** button opens `https://walle-t.vercel.app/api/auth/password-reset?token=...` and the form POST succeeds.
6. Open `/api/health` from the public Render URL and confirm `{ ok: true }`. Then open `/api/health/deep` with `x-admin-token: <token>` to verify dependencies.
7. Open the SPA, log in as user A, manually edit `localStorage.wallet_session_v1.user.id` to user B's id, and confirm subsequent calls fail with **401** (no IDOR).

---

## Repo layout
- `frontend/` – Vite/React app (`npm run dev`, `npm run build`).
- `backend/` – Express server entry `server.js` plus `routes/*.js` modules.
- `backend/data/` – Local-only JSON snapshots (gitignored).
- `*.py`, `*.jsonl` – data-prep / model-training scripts; not shipped.
