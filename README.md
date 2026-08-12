# Net Worth Tracker

A full-stack app for tracking personal net worth, assets, and investments across accounts, countries, and family members.

## Stack

- **Frontend**: React 18, Vite, React Router, TanStack Query, Recharts
- **Backend**: Flask, SQLAlchemy, Flask-Migrate (Alembic)
- **Database & Auth**: Supabase (Postgres + Auth — email/password and Google OAuth)
- **Live prices**: Finnhub (US), NSE libraries + mftool (India stocks/mutual funds)
- **Deployment**: Vercel (frontend) + Render (backend, Docker) + GitHub Actions (daily snapshot cron)

## Features

- Email/password and Google sign-in via Supabase Auth; every user sees only their own data
- Manual asset tracking: stocks, mutual funds, real estate, precious metals, cash, deposits, loans — with live price lookup and autocomplete for stocks/mutual funds
- Dashboard with net worth, P/L, and CAGR broken down by country → account → holding
- Household sharing: create a household, invite family members by email, and any member can view/add/edit assets explicitly shared into it — private assets stay private
- Daily net worth snapshots stored in the database and charted over time (in addition to a same-day estimate for accounts too new to have snapshot history yet)
- Light/dark theme, filters by asset type/country/account/tag, notes and tags on any asset

## Project Structure

```
networth_tracker/
├── backend/
│   ├── app.py               # Flask routes (auth-scoped, orchestration only)
│   ├── auth.py               # Supabase JWT verification
│   ├── models.py              # SQLAlchemy models (Postgres)
│   ├── services.py            # Asset metric calculations
│   ├── household_service.py   # Household/invite/membership logic
│   ├── snapshot_service.py    # Daily net worth snapshot computation
│   ├── finance.py             # CAGR calculation
│   └── utils.py                # Live price fetching (Finnhub/NSE/mftool) + caching
├── frontend/
│   └── src/
│       ├── contexts/          # Auth + Theme React contexts
│       ├── components/        # Pages and UI components
│       ├── api/                 # API client, auth-token attachment, response mapping
│       └── lib/supabaseClient.js
├── supabase/migrations/       # Initial schema + RLS policies (raw SQL, applied once)
├── migrations/                 # Flask-Migrate/Alembic migrations (schema changes going forward)
└── .github/workflows/          # Daily snapshot cron
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

All endpoints except `/internal/snapshot` require an `Authorization: Bearer <supabase-access-token>` header. Add `?household_id=<uuid>` to `/assets`, `/stocks`, `/summary`, `/analytics` to view a shared household's data instead of your own.

- `GET/POST /assets`, `GET/PUT/DELETE /assets/:id` — asset CRUD
- `GET /stocks` — stocks/mutual funds view
- `GET /summary` — dashboard aggregates (country → account → holding)
- `GET /analytics` — allocation pie, CAGR histogram, estimated net worth over time
- `GET /net-worth-history` — real daily snapshot history
- `GET /search-symbols` — stock/mutual fund autocomplete
- `POST /households`, `GET /households`, `GET /households/:id/members`, `POST /households/:id/invites`, `POST /households/:id/leave`, `DELETE /households/:id/members/:userId`
- `GET /invites`, `POST /invites/:id/accept`
- `POST /internal/snapshot` — secret-protected, called by the daily cron job

## License

MIT
