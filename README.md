# Net Worth Tracker

A full-stack family net worth tracker: real transaction-based portfolio accounting (average cost basis, realized/unrealized gains, XIRR), ten asset types across multiple countries and currencies, household sharing with editor/viewer roles, broker CSV import, price alerts, benchmark comparison, a weekly email digest, and an optional Gemini-powered AI copilot.

## Stack

- **Frontend**: React 18, Vite (route-level code-splitting + PWA plugin), React Router, TanStack Query, Recharts, framer-motion, react-hook-form + zod, react-i18next
- **Backend**: Flask, SQLAlchemy, Flask-Migrate (Alembic), Flask-Limiter
- **Database & Auth**: Supabase (Postgres + Auth — email/password and Google OAuth)
- **AI**: Google Gemini, chosen for its free tier (copilot chat, AI-narrated digest, allocation advisor, transaction categorizer, spreadsheet import, natural-language search) — fully optional, degrades to a clean "not configured" response without an API key
- **Live/historical prices**: Finnhub (US live), Yahoo Finance (historical + NSE fallback, unofficial/keyless), NSE libraries + mftool (India), CoinGecko (crypto), metals-api.com (gold/silver/platinum), frankfurter.app (FX)
- **Email**: Resend (weekly digest, price alerts, milestone celebrations)
- **Deployment**: Vercel (frontend) + Render (backend, Docker) + GitHub Actions (daily snapshot, weekly digest, alert-check crons)

## Features

- Email/password and Google sign-in via Supabase Auth; every user sees only their own data
- **Holdings & transactions**: stocks, mutual funds, crypto, commodities, real estate, fixed deposits, PPF, EPF, cash, loans. Quantity-based types (stock/mutual_fund/crypto/commodity) track a full buy/sell ledger with average-cost basis, realized gains, unrealized gains, and per-holding + portfolio-wide XIRR; everything else tracks periodic value updates.
- **Multi-currency**: every holding is denominated in its native currency; the dashboard converts to your chosen display currency (USD/INR/AUD) using live FX rates, cached daily
- **Broker CSV import**: Zerodha, Groww (stocks + mutual funds), Fidelity, Robinhood — parsed into a preview you review and confirm before anything is saved
- **AI spreadsheet import** (optional, owner/editor only): upload your own Excel/CSV in whatever layout you already use — Gemini reads it and maps rows to holdings, same review-before-saving flow as broker import
- **Budget**: income/expense tracking with monthly trends and category breakdown — deliberately separate from net worth, so logging a paycheck never touches a holding automatically. Recurring entries (subscriptions, rent, bills) get their own view with next-due dates and a monthly total; optional per-category spending limits with an in-app progress indicator; on-demand AI spending insights.
- **Bank statement import** (optional, owner/editor only): upload a bank/credit card statement (Excel, CSV, or PDF) — Gemini extracts and categorizes each transaction into your budget, same review-before-saving flow as broker/spreadsheet import
- **Household sharing**: create a household, invite members as editor (can add/edit) or viewer (read-only), holdings can be flagged private to stay out of the shared view entirely
- **Dashboard**: net worth chart (range pills, milestone markers), drill-down allocation donut (type/country), gainers/losers heat-map with sparklines, returns by asset type, net worth vs S&P 500 (SPY) / Nifty 50 (NIFTYBEES) comparison, milestone celebrations, pull-to-refresh on mobile
- **AI copilot** (optional, owner/editor only): floating chat with full portfolio context (streamed), AI-narrated weekly digest, allocation advisor with real rebalance math, transaction tag suggestions, natural-language portfolio search (Cmd+K)
- **Tax summary**: realized gains grouped by financial year (India Apr–Mar, elsewhere calendar year), short-term/long-term split with a rough tax liability estimate, year-over-year comparison
- **Recurring investments (SIP)**: mark a holding as a recurring contribution, see upcoming dates and a projected future value
- **Price alerts**: per-holding price thresholds or net worth thresholds, checked every 4 hours, delivered by email
- **Weekly email digest**: net worth, this week's change, top movers, one-click unsubscribe
- Daily net worth snapshots stored in the database and charted over time
- **Settings**: profile, display currency/language, data export (JSON), delete-my-data
- Light/dark theme, installable PWA, English/Hindi language toggle, keyboard shortcuts (`?` for the list), full mobile UX (bottom nav, swipe-to-delete, bottom sheets, card layouts, offline indicator)

## Project Structure

```
networth_tracker/
├── backend/
│   ├── app.py                  # Flask routes (auth-scoped, orchestration only)
│   ├── auth.py                 # Supabase JWT verification (JWKS)
│   ├── models.py               # SQLAlchemy models (Postgres)
│   ├── holdings_service.py     # Cost basis, realized/unrealized gains, XIRR, dashboard aggregation
│   ├── price_service.py        # DB-cached current/historical price + FX lookups
│   ├── benchmark_service.py    # Portfolio XIRR vs SPY/NIFTYBEES
│   ├── tax_service.py          # Realized gains by financial year
│   ├── csv_import_service.py   # Broker CSV parsers (Zerodha/Groww/Fidelity/Robinhood)
│   ├── alert_service.py        # Price/net-worth alert evaluation
│   ├── email_service.py        # Resend integration (digest/alert/milestone emails)
│   ├── household_service.py    # Household/invite/membership logic (owner/editor/viewer)
│   ├── snapshot_service.py     # Daily net worth snapshot + milestone detection
│   ├── digest_service.py       # Weekly digest computation + send
│   ├── finance.py              # XIRR (Newton's method + bisection fallback)
│   └── utils.py                # Live/historical price fetching + in-memory caching
├── frontend/
│   └── src/
│       ├── contexts/           # Auth, Theme, live FX Rates React contexts
│       ├── components/         # Pages: Dashboard, Portfolio, HoldingDetail, AddHolding,
│       │                       #   Transactions, ImportTransactions, Alerts, TaxSummary, Households
│       ├── api/                # API client, auth-token attachment, response mapping
│       └── lib/supabaseClient.js
├── supabase/migrations/        # Initial schema + RLS policies (raw SQL, applied once each)
├── migrations/                 # Flask-Migrate/Alembic migrations (schema changes going forward)
└── .github/workflows/          # Daily snapshot, weekly digest, alert-check crons
```

## Local Setup

See [DEPLOY.md](./DEPLOY.md) for full setup (Supabase project, environment variables) and deployment instructions.

Quick start once `.env` files are filled in:

```bash
# Backend
./start_backend.sh

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

## API Overview

All endpoints except `/internal/*` require an `Authorization: Bearer <supabase-access-token>` header. Add `?household_id=<uuid>` to view a shared household's data instead of your own (where supported).

**Holdings & transactions**
- `GET/POST /holdings`, `GET/PUT/DELETE /holdings/:id`
- `GET/POST /holdings/:id/transactions`, `PUT/DELETE /transactions/:id`, `GET /transactions` (global log, filterable)
- `GET/POST /holdings/:id/valuations`, `DELETE /valuations/:id`
- `GET /holdings/:id/price-history`, `GET /price-lookup`

**Dashboard & analysis**
- `GET /dashboard` — net worth, allocation, gainers/losers, realized/unrealized summary
- `GET /net-worth-history` — real daily snapshot history
- `GET /benchmark?symbol=SPY|NIFTYBEES.NS` — your XIRR vs the index
- `GET /tax-summary` — realized gains by financial year
- `GET /exchange-rates`

**CSV import**
- `GET /import/brokers`, `POST /import/parse`, `POST /import/confirm`
- `POST /import/smart-parse` (multipart file upload, AI-assisted), `POST /import/smart-confirm`
- `POST /import/bank-statement-parse` (multipart, Excel/CSV/PDF, AI-assisted), `POST /import/bank-statement-confirm`

**Budget (income/expenses, independent of holdings)**
- `GET /budget/categories`, `GET/POST /budget/entries`, `PUT/DELETE /budget/entries/:id`
- `GET /budget/summary?months=N&currency=...` (includes `limit_status` and, for a shared household, `by_member`)
- `GET /budget/subscriptions?currency=...` — recurring entries grouped with next-due dates and a monthly total
- `GET/POST /budget/limits`, `DELETE /budget/limits/:id` — per-category monthly spending limits
- `POST /api/ai/budget-insights` (owner/editor only, requires `GEMINI_API_KEY`) — on-demand spending narrative

**Alerts & milestones**
- `GET/POST /alerts`, `DELETE /alerts/:id`
- `GET /milestones`, `POST /milestones/:id/acknowledge`

**Households**
- `POST /households`, `GET /households`, `GET /households/:id/members`, `POST /households/:id/invites` (role: editor/viewer), `POST /households/:id/leave`, `DELETE /households/:id/members/:userId`
- `GET /invites`, `POST /invites/:id/accept`

**Symbol search**
- `GET /search-symbols` (stocks/mutual funds), `GET /search-crypto`

**AI (owner/editor only, requires `GEMINI_API_KEY`)**
- `POST /api/ai/chat` — SSE-streamed copilot chat
- `POST /api/ai/allocation-advisor`, `POST /api/ai/search`
- `POST /transactions/:id/suggest-tags`

**Recurring investments (SIP)**
- `GET /holdings/:id/sip-projection?years=N` — upcoming dates + projected future value (SIP fields are set via `PUT /holdings/:id`)

**Account (Settings page)**
- `GET /account/export`, `DELETE /account/data` (body: `{"confirm": "DELETE"}`)
- `GET /price-cache-status`

**Internal (secret-protected, called by GitHub Actions crons)**
- `POST /internal/snapshot`, `POST /internal/weekly-digest`, `POST /internal/check-alerts`, `GET /internal/unsubscribe?token=...`

## License

MIT
