# Net Worth Tracker

A full-stack family net worth tracker: real transaction-based portfolio accounting (average cost basis, realized/unrealized gains, XIRR), ten asset types across multiple countries and currencies, household sharing with editor/viewer roles, broker CSV import, price alerts, benchmark comparison, and a weekly email digest.

## Stack

- **Frontend**: React 18, Vite, React Router, TanStack Query, Recharts
- **Backend**: Flask, SQLAlchemy, Flask-Migrate (Alembic)
- **Database & Auth**: Supabase (Postgres + Auth — email/password and Google OAuth)
- **Live/historical prices**: Finnhub (US live), Yahoo Finance (historical + NSE fallback, unofficial/keyless), NSE libraries + mftool (India), CoinGecko (crypto), metals-api.com (gold/silver/platinum), frankfurter.app (FX)
- **Email**: Resend (weekly digest, price alerts, milestone celebrations)
- **Deployment**: Vercel (frontend) + Render (backend, Docker) + GitHub Actions (daily snapshot, weekly digest, alert-check crons)

## Features

- Email/password and Google sign-in via Supabase Auth; every user sees only their own data
- **Holdings & transactions**: stocks, mutual funds, crypto, commodities, real estate, fixed deposits, PPF, EPF, cash, loans. Quantity-based types (stock/mutual_fund/crypto/commodity) track a full buy/sell ledger with average-cost basis, realized gains, unrealized gains, and per-holding + portfolio-wide XIRR; everything else tracks periodic value updates.
- **Multi-currency**: every holding is denominated in its native currency; the dashboard converts to your chosen display currency (USD/INR/AUD) using live FX rates, cached daily
- **Broker CSV import**: Zerodha, Groww (stocks + mutual funds), Fidelity, Robinhood — parsed into a preview you review and confirm before anything is saved
- **Household sharing**: create a household, invite members as editor (can add/edit) or viewer (read-only), holdings can be flagged private to stay out of the shared view entirely
- **Dashboard**: net worth, allocation by type/country, top gainers/losers, realized vs unrealized gains, net worth vs S&P 500 (SPY) / Nifty 50 (NIFTYBEES) comparison, net worth milestone celebrations
- **Tax summary**: realized gains grouped by financial year (India Apr–Mar, elsewhere calendar year)
- **Price alerts**: per-holding price thresholds or net worth thresholds, checked every 4 hours, delivered by email
- **Weekly email digest**: net worth, this week's change, top movers
- Daily net worth snapshots stored in the database and charted over time
- Light/dark theme, mobile bottom nav below 640px width

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

**Alerts & milestones**
- `GET/POST /alerts`, `DELETE /alerts/:id`
- `GET /milestones`, `POST /milestones/:id/acknowledge`

**Households**
- `POST /households`, `GET /households`, `GET /households/:id/members`, `POST /households/:id/invites` (role: editor/viewer), `POST /households/:id/leave`, `DELETE /households/:id/members/:userId`
- `GET /invites`, `POST /invites/:id/accept`

**Symbol search**
- `GET /search-symbols` (stocks/mutual funds), `GET /search-crypto`

**Internal (secret-protected, called by GitHub Actions crons)**
- `POST /internal/snapshot`, `POST /internal/weekly-digest`, `POST /internal/check-alerts`

## License

MIT
