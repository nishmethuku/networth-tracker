# Deployment Guide

Architecture: **Vercel** (frontend) + **Render** (Flask backend, Docker) + **Supabase** (Postgres + Auth).

## 1. Supabase (already set up if you're reading this after initial setup)

- Project created, schema applied (`supabase/migrations/0001_init.sql`)
- Auth → Providers → Google enabled (see below) if you want Google sign-in
- Collect: `SUPABASE_URL`, `DATABASE_URL` (Session pooler variant), `SNAPSHOT_SECRET` (any random string you generate)

### Enabling Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com) → create/select a project → **APIs & Services → Credentials**
2. **Create Credentials → OAuth client ID** → Application type: **Web application**
3. Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Copy the generated **Client ID** and **Client Secret**
5. In Supabase: **Authentication → Providers → Google** → paste the Client ID/Secret → Save

## 2. Backend → Render

1. [render.com](https://render.com) → **New → Blueprint** → connect this GitHub repo (it will pick up `render.yaml`)
2. Render will prompt for the env vars marked `sync: false`: `DATABASE_URL`, `SUPABASE_URL`, `SNAPSHOT_SECRET`, `FINNHUB_API_KEY`, `METALS_API_KEY`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `FRONTEND_URL` (fill this in once you have the Vercel URL from step 3, then redeploy). `METALS_API_KEY`, `RESEND_API_KEY`, and `ANTHROPIC_API_KEY` are all optional — without them, commodity prices show as unavailable, emails are logged instead of sent, and AI features (copilot chat, allocation advisor, transaction categorizer, natural-language search, AI digest narrative) return a clean "not configured" response. Everything else still works.
3. Deploy — the Dockerfile runs `flask db upgrade` before starting gunicorn, so any pending Alembic migrations apply automatically on every deploy
4. Note the resulting backend URL (e.g. `https://networth-tracker-backend.onrender.com`)

Render's free tier spins down after 15 minutes of inactivity — the first request after idle will be slow (cold start). Fine for personal/family use; upgrade the plan if that's annoying.

## 3. Frontend → Vercel

1. [vercel.com](https://vercel.com) → **New Project** → import this repo, set **Root Directory** to `frontend`
2. Environment variables: `VITE_API_URL` (your Render backend URL from step 2), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
3. Deploy — `frontend/vercel.json` handles the SPA rewrite so React Router routes survive a page refresh
4. Go back to Render and set `FRONTEND_URL` to this Vercel URL, then redeploy the backend (needed for CORS)

## 4. Scheduled jobs (GitHub Actions)

Three workflows call secret-protected `/internal/*` endpoints on a schedule — all three share the same two repo secrets. In your GitHub repo: **Settings → Secrets and variables → Actions**, add:

- `BACKEND_URL` — your Render backend URL
- `SNAPSHOT_SECRET` — must match the value set on Render (also used as the digest/alert secret unless you set `DIGEST_SECRET` separately)

| Workflow | Schedule | Calls |
|---|---|---|
| `daily-snapshot.yml` | Daily | `/internal/snapshot` — net worth history + milestone detection |
| `weekly-digest.yml` | Mondays | `/internal/weekly-digest` — emails each user/household a summary |
| `check-alerts.yml` | Every 4 hours | `/internal/check-alerts` — triggers and emails any crossed price/net-worth alerts |

You can trigger any of them manually from the **Actions** tab (`workflow_dispatch`) to test before waiting for the schedule.

## Environment Variable Reference

### Backend (Render)
| Var | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (Session pooler) |
| `SUPABASE_URL` | Used to verify user JWTs via the project's JWKS endpoint |
| `SNAPSHOT_SECRET` | Shared secret for `/internal/*`, must match the GitHub Actions secret |
| `DIGEST_SECRET` | Optional — separate secret for digest/alerts; falls back to `SNAPSHOT_SECRET` if unset |
| `FINNHUB_API_KEY` | Live US stock price lookups (free tier) |
| `METALS_API_KEY` | Optional — gold/silver/platinum prices via metals-api.com (free tier) |
| `RESEND_API_KEY` | Optional — real email delivery for digest/alerts/milestones; without it, emails are logged instead |
| `ANTHROPIC_API_KEY` | Optional — powers the AI copilot chat, AI digest narrative, allocation advisor, transaction categorizer, and natural-language search; without it, those features return a clean "not configured" response |
| `EMAIL_FROM` | Optional — sender address, defaults to Resend's shared `onboarding@resend.dev` |
| `FRONTEND_URL` | Vercel URL, used for CORS in production |
| `FLASK_ENV` | Set to `production` (restricts CORS to `FRONTEND_URL`) |

### Frontend (Vercel)
| Var | Purpose |
|---|---|
| `VITE_API_URL` | Render backend URL |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key (safe for client use) |

## Local Development

```bash
# Backend
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cd .. && cp .env.example .env  # fill in real values
./start_backend.sh

# Frontend (separate terminal)
cd frontend
cp .env.example .env  # fill in real values
npm install
npm run dev
```

Schema changes going forward: edit `backend/models.py`, then `flask db migrate -m "description"` and `flask db upgrade` (with `FLASK_APP=backend.app` and your `.env` loaded).
