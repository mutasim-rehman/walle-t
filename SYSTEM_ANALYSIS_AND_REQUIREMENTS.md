# Chapter 2: System Analysis and Requirements

## 2.1 Existing System (if any)

Many individuals still rely on **manual** tracking (spreadsheets, notebooks) or on **disconnected tools**: one app for quotes, another for news, email from a broker, and ad hoc web calculators. Typical limitations include:

- **Fragmented workflows**: Market data, portfolio tracking, and personalized advice rarely live in one place; users copy numbers between tools and lose context.
- **High friction for novices**: Professional terminals and dense spreadsheets assume domain knowledge; casual investors struggle to interpret risk and diversification.
- **Weak personalization**: Generic articles and alerts do not reflect a user’s income, liabilities, goals, or simulated positions.
- **Separation of practice from planning**: Paper trading or demos often ignore the user’s real financial profile; planning tools often ignore executable practice in simulated markets.

The existing ecosystem therefore pushes users toward either oversimplified apps or overly complex professional stacks—neither consistently combines **profile-aware AI**, **simulated trading**, and **forecast-style analytics** in one guided experience.

## 2.2 Proposed System

**Walle-T** is an integrated AI-assisted financial workspace that connects market views, a virtual trading ledger, onboarding-driven profiling, risk visualization, and conversational guidance. The proposed system provides:

- **Unified dashboard**: Central entry point after login/onboarding for navigation and high-level portfolio context.
- **Multi-market views**: Dedicated flows for stocks (including PSX-oriented content), forex, and related market exploration within the SPA.
- **AI financial advisor**: Chat-style assistance powered by **Google Gemini**, grounded in stored profile and portfolio/ledger context where applicable.
- **Onboarding and risk**: Structured capture of financial basics and risk-oriented UX to steer recommendations and education.
- **ML-assisted forecasting**: Server-delivered symbol predictions (PSX-oriented pipeline, JSON-backed) surfaced in the UI for informed exploration—not a guarantee of returns.
- **Gamified / simulated trading**: Buy/sell actions against virtual cash with transactions persisted for history and portfolio computation.

## 2.3 Stakeholders Identification

| Stakeholder | Interest |
|-------------|----------|
| **End users (retail learners / hobby traders)** | Learn markets, practice trades, see projections and advice tailored to their profile without risking real capital in the simulator. |
| **Platform administrators / operators** | Reliable uptime, API quotas (Gemini, Google Sheets), service account access to spreadsheets, monitoring of errors and rate limits. |
| **Developers / maintainers** | Clear modular boundaries (routes, sheets access), secure handling of secrets, ability to extend markets or models. |
| **Third-party providers (Google Cloud, Gemini, Sheets)** | Correct API usage, key hygiene, acceptable traffic patterns; their SLAs and pricing constrain operational feasibility. |
| **Educational / supervisory stakeholders** (if deployed institutionally) | Appropriate disclaimers that outputs are informational and that simulated trading is not investment advice or a substitute for licensed counseling where required by law. |

## 2.4 Functional Requirements

- **FR1 — Authentication**: User registration, login, session validation aligned with backend checks, and password reset via email where configured (Nodemailer).
- **FR2 — Onboarding**: Capture demographic and financial baseline data used to build/update a profile stored for personalization.
- **FR3 — Market exploration**: Present market-oriented pages (e.g., stocks, forex) with data fetched or rendered per backend/front-end design.
- **FR4 — Simulated trading**: Execute virtual buy/sell flows with persistent transaction rows and derived cash/holdings state.
- **FR5 — Portfolio view**: Display holdings, balances, and history derived from the ledger and profile inputs.
- **FR6 — AI advisor**: Accept user prompts; return model-generated replies with server-side rate controls to protect quotas and fairness.
- **FR7 — Risk assessment UX**: Interactive risk-related experience tied to user context (presentation and calculations as implemented).
- **FR8 — Forecasting / predictions**: Expose ML-backed or model-exported predictions for symbols (e.g., PSX pipeline) through dedicated UI routes.
- **FR9 — Profile and settings**: Allow users to review/update profile-backed settings persisted via the storage layer.
- **FR10 — Health / diagnostics** (operational): Expose lightweight status endpoints for spreadsheet connectivity checks where implemented.

## 2.5 Non-Functional Requirements

- **NFR1 — Security**: Password hashing (bcrypt-style via `bcryptjs`), no plaintext passwords in storage, secrets via environment variables; CORS and JSON APIs designed for a known frontend origin in deployment.
- **NFR2 — Performance**: Responsive UI; backend logs slow API handling (e.g., warnings above ~1.2s on finish) to spot regressions.
- **NFR3 — Availability / resilience**: Graceful degradation when external APIs fail; user-visible errors instead of silent corruption of ledger state.
- **NFR4 — Scalability (MVP scope)**: Google Sheets as operational datastore suits moderate concurrency and MVP deployment; growth may require migration to a transactional database.
- **NFR5 — Usability**: Glass-style UI, icons (Lucide), optional 3D loading/visual accents (Three.js / React Three Fiber); lazy-loaded routes for perceived speed.
- **NFR6 — Maintainability**: Modular Express routes (`backend/routes/*.js`), centralized integration logic in `server.js` for sheets and AI clients.
- **NFR7 — Ethical / compliance posture**: Clear labeling of simulation vs. real trading; advisor output framed as informational; adherence to provider terms for Gemini and Sheets.

## 2.6 Feasibility Analysis (Technical, Economic, Operational)

### 2.6.1 Technical feasibility

The stack is **mainstream and well documented**: React 19 + Vite on the client; Node.js + Express 5 on the server; Google Sheets API for persistence; Gemini SDK for generation. PSX-oriented ML outputs can be produced offline (Python training scripts) and consumed as static JSON—avoiding training complexity in the runtime server.

**Constraints**: Sheets API latency and quota, eventual consistency of appended rows, and the need for a correctly permissioned service account. These are manageable for an MVP but imply a future ceiling before migrating to a relational DB.

**Verdict**: Feasible with current architecture; risks are integration and quota management rather than unknown algorithms.

### 2.6.2 Economic feasibility

**Cost drivers**: Gemini API usage, Google Cloud project billing (Sheets/Drive as applicable), email delivery, and hosting for frontend/backend.

**Mitigations**: Rate limiting on advisor endpoints, caching user reads where implemented, and Sheets as a low-ops datastore during early phases.

**Verdict**: Economically viable for development, demos, and small user bases; costs scale with AI tokens and active users.

### 2.6.3 Operational feasibility

Target users can operate the product through a **browser**: register, complete onboarding, navigate markets, trade in simulation, and chat with the advisor. Administrators need only spreadsheet sharing discipline, env configuration, and basic monitoring.

**Risks**: Non-technical admins may misconfigure service accounts or env vars; documentation and health checks reduce support burden.

**Verdict**: Operationally feasible provided deployment checklists and disclaimers are kept visible to operators and users.
