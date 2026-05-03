# Walle-T — Project Presentation

**Course:** CS-2004 — Fundamentals of Software Engineering (Iteration 3)  
**Team:** Hamza Faheem (24I-6034), Mutasim Ur Rehman (24I-2514), Ali Farooq (24I-2576)

---

## 1. Introduction

### Background

Financial literacy and investment participation are growing among students and young professionals, but many users still struggle to connect learning with practical decision-making. Existing platforms tend to be either too advanced for beginners or too shallow for meaningful skill building.

**Walle-T** was conceived to bridge this gap by combining market exploration, AI-based guidance, risk-aware onboarding, and simulated trading in one environment. The product follows an **educational-first** approach: users practice strategy building with virtual assets before entering real markets.

### Problem Statement

Users often depend on **disconnected tools** for portfolio tracking, market updates, and advice. That fragmentation leads to inconsistent decisions, weak risk awareness, and low confidence—especially for novices. Generic advisory content also ignores **user-specific** factors such as income, liabilities, and risk appetite.

**Central problem:** There is no integrated, profile-aware, beginner-friendly system that supports both learning and simulation-based practice in one place.

---

## 2. Objectives

- Design and implement a **unified web application** for market exploration, portfolio simulation, and AI-assisted advisory.
- Enable **secure onboarding** and profile collection to personalize recommendations and the overall experience.
- Provide **simulated buy/sell** workflows with **persistent transaction history** so learners can practice without real capital risk.
- Integrate **forecasting outputs** and **risk-oriented interfaces** to improve decision awareness.
- Deliver a **modular architecture** that can grow from MVP scale toward production-style deployment.

*(Educational simulation and information support only—not real brokerage execution.)*

---

## 3. Proposed System (Brief Overview)

**Walle-T** is an integrated **AI-assisted financial workspace** that connects:

- Market views (multi-market exploration within one SPA)
- A **virtual trading ledger** with persisted trades
- **Onboarding-driven profiling** for personalization
- **Risk visualization** and structured financial baseline capture
- **Conversational guidance** grounded in profile and portfolio context where applicable

The stack is a **React + Vite** single-page app talking to an **Express** backend API. Persistence uses **Google Sheets** for rapid MVP iteration; external services include **Google Gemini** for advisory generation and **offline Python pipelines** that produce forecasting artifacts consumed as JSON.

Together, these pieces form an **AI-assisted financial sandbox** for exploration, simulation, and learning.

---

## 4. Core Features / Key Functionalities

| Area | What it delivers |
|------|------------------|
| **Authentication** | Registration, login, session validation; password reset via email when SMTP is configured |
| **Onboarding & profile** | Structured capture of demographics and financial baseline; stored for personalization |
| **Dashboard** | Central hub after login/onboarding with navigation and portfolio context |
| **Markets** | Stocks (including PSX-oriented content), forex, and related exploration routes |
| **Simulated trading** | Virtual buy/sell with validation, appended ledger rows, derived cash and holdings |
| **Portfolio** | Holdings, balances, and history from the ledger and profile inputs |
| **AI advisor** | Chat-style prompts with server-side rate limits and quota protection |
| **Risk** | Interactive risk experience tied to user context |
| **Forecasting / predictions** | ML or model-exported symbol predictions (e.g., PSX) via API and dedicated UI routes |
| **Profile & settings** | Review and update user-backed settings via the storage layer |
| **Operations** | Lightweight health/diagnostics endpoints for connectivity checks |

Outputs are labeled as **informational**; simulated trading is **not** licensed investment advice or real brokerage.

---

## 5. Tools & Technologies

| Layer | Technology | Role |
|-------|------------|------|
| **Frontend** | React 19 | UI, routing, client state |
| **Build** | Vite 8 | Dev server and production bundles |
| **Routing** | react-router-dom 7 | SPA routes, lazy-loaded pages, protected routes |
| **Styling** | Vanilla CSS | Glass-style layout, responsiveness |
| **Icons** | Lucide React | Consistent iconography |
| **3D / motion** | Three.js, React Three Fiber, Drei | Loading screen and decorative visuals |
| **Rich text in UI** | react-markdown, remark-gfm | Formatted advisor or content text |
| **Backend** | Node.js + Express 5 | REST-style `/api` |
| **Config** | dotenv | Environment-driven configuration |
| **Security** | bcryptjs, Node `crypto` | Password hashing; reset tokens |
| **Persistence** | googleapis (Sheets API v4) | Users, profiles, transactions |
| **AI** | `@google/genai` (Gemini) | Advisor generation |
| **Email** | Nodemailer | Password reset when configured |
| **ML / data** | Python scripts + JSON | Offline training; predictions served as static JSON |

**Repository layout:** `frontend/` (Vite app), `backend/` (`server.js`, `routes/`, `data/`).

---

## 6. Implementation Highlights

### Frontend

- **SPA** with lazy-loaded route components and an initial loading transition for perceived performance.
- **Protected routes** gate authenticated experiences; auth state is centralized (e.g., context + guard pattern).
- Pages call the backend with **JSON over HTTP**; charts use a lightweight **custom SVG line chart** where applicable.
- **Dashboard-first** navigation: Login → Onboarding → Dashboard → Markets, Portfolio, Risk, Advisor, Profile, Settings, company prediction views.

### Backend

- **Express** app with CORS, JSON parsing, and **`/api`-scoped** middleware: IP/path rate limiting and slow-request logging.
- **Advisor fairness:** extra in-memory limits (spacing and rolling-window caps) to protect cost and quotas.
- **Modular routes:** each feature area registers handlers (`auth`, `profile`, `onboarding`, `portfolio`, `trade`, `market`, `forecast`, `modelPrediction`, `activities`, `advisor`, `risk`, `settings`, `health`, etc.).
- **Sheets-backed** users, profiles, and transaction tabs; **local JSON** for activities cache and ML prediction payloads.
- **Graceful degradation** when external APIs fail, with user-visible errors rather than silent ledger corruption.

---

## 7. Future Work

- **Migrate persistence** from Google Sheets to a transactional database (e.g., PostgreSQL) with indexing for scale and consistency.
- **Richer analytics:** advanced portfolio metrics, watchlists, alerts, comparative benchmarking, and improved charting.
- **Automated testing in CI:** broader unit, integration, and regression coverage.
- **Advisor quality & safety:** stronger prompt governance, feedback loops, and traceable reasoning templates.
- **Forecasting:** expand models, add confidence reporting, periodic retraining, and monitoring.
- **UX depth:** clearer risk explanations, onboarding tooltips, and localization for beginner-friendly examples (per informal feedback).
- **Formal evaluation:** larger-scale usability studies and load testing beyond classroom/demo scale.

---

*Based on Iteration 3 project documentation and repository implementation (`IMPLEMENTATION.md`, `SYSTEM_ANALYSIS_AND_REQUIREMENTS.md`).*
