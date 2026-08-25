# Load Test Results

Run 2026-08-25 against a local gunicorn instance configured identically to production (`--workers 2 --timeout 300`, matching the Dockerfile), talking to the real Supabase database with a throwaway test account (4 holdings across stock/crypto/real_estate/cash — a realistic small portfolio, not an empty or synthetic one). Tool: [Locust](https://locust.io/) (`backend/locustfile.py`).

## Methodology

15 simulated concurrent users, spawn rate 3/s, 45s sustained run, 1-3s think time between requests per user (approximating real browsing behavior rather than a tight hammering loop). Traffic weighted toward the endpoints a real Dashboard page load actually fires: `/dashboard` (heaviest — allocation aggregation, gainers/losers with historical price lookups, portfolio XIRR), `/holdings?summary=true`, `/transactions`, `/net-worth-history`, `/exchange-rates`.

## Results: baseline concurrent load

280 requests, **0 failures**, sustained ~6.5 req/s.

| Endpoint | Requests | p50 | p95 | p99 | Max |
|---|---|---|---|---|---|
| `/dashboard` | 100 | 330ms | 550ms | 1300ms | 1300ms |
| `/holdings?summary=true` | 62 | 230ms | 340ms | 470ms | 470ms |
| `/transactions` | 44 | 170ms | 310ms | 510ms | 510ms |
| `/net-worth-history` | 47 | 96ms | 320ms | 340ms | 340ms |
| `/exchange-rates` | 27 | 100ms | 260ms | 310ms | 310ms |
| **Aggregated** | **280** | **230ms** | **470ms** | **620ms** | **1300ms** |

`/dashboard` is the clear outlier — expected, since it's the only endpoint doing real aggregation work (allocation by type/country/currency, top gainers/losers with per-holding historical price lookups capped at 15, portfolio-wide XIRR via Newton's method). Its p99 (1300ms) is ~4x its p50, suggesting occasional cold cache hits on the price-history lookups rather than a systemic issue — worth profiling further if this ever needs to scale past a personal/family user count, but not a problem at the load a 2-person household actually generates.

## A real bug found and confirmed fixed: rate limiting was broken across gunicorn's workers

While preparing this test, a focused check (70 sequential requests to `/dashboard` from one client, well past the documented "60 per minute" limit) surfaced a live, previously-undetected instance of a bug already suspected and partially fixed this session (see `[[cron_jobs_fixed]]` / the Redis rate-limiting commit) — this test is what actually *proved* it, before and after:

**Before** (in-memory rate-limit storage, `REDIS_URL` unset — matches what a Render deploy without `REDIS_URL` configured would run today):

```
70 sequential requests to /dashboard -> 70x HTTP 200
```

Zero requests were rejected, despite the route's documented limit being 60/minute. Root cause: gunicorn's 2 worker processes (`--workers 2`, per the Dockerfile) each hold their own separate in-memory counter — Flask-Limiter's `memory://` storage backend is per-process, not shared. Requests get load-balanced across both workers, so each worker only ever sees roughly half the traffic and neither individually crosses 60.

**After** (Redis-backed storage, `REDIS_URL` set — installed Redis locally via Homebrew specifically to verify this):

```
70 sequential requests to /dashboard -> 59x HTTP 200, then 11x HTTP 429
```

The limit engages almost exactly at the documented threshold once both workers share one counter via Redis.

**Why this matters beyond this one test**: any Render deployment of this app that hasn't set `REDIS_URL` has a rate limiter that is not actually enforcing its documented limit — every route effectively allows roughly (60 × number of workers) requests per minute per client instead of 60. This isn't a hypothetical scaling concern; it's live, current, measured behavior. `REDIS_URL` should be treated as a required production setting, not an optional one, until/unless the app moves to a single-worker deployment.

## What this doesn't cover

- **Sustained load past 45s** — long enough to see the shape of the response-time distribution, not long enough to catch a slow memory leak or connection-pool exhaustion under hours of traffic.
- **Realistic multi-user concurrency** — all simulated users shared one auth token (see `backend/locustfile.py`'s docstring for why), so this measures backend compute/query performance under concurrent request volume, not per-user isolation or Supabase connection-pool behavior under many *distinct* real sessions.
- **Write-heavy load** — every request here was a GET. Buy/sell/valuation writes, CSV import, and AI-backed routes weren't load tested; the AI routes in particular are bounded by Gemini's own free-tier rate limits well before this app's own limiter would matter.
- **The free-tier Render instance's actual resource ceiling** (CPU/memory limits) — this ran against a local machine, not the real deployed instance, since deliberately generating sustained load against a live free-tier service (which the app's real users also depend on) isn't something to do without a specific reason to.

## Reproducing this

```bash
# get a real access token for a throwaway test account, then:
export LOAD_TEST_TOKEN=<token>
./backend/venv/bin/locust -f backend/locustfile.py --host http://localhost:5002 \
  --users 15 --spawn-rate 3 --run-time 45s --headless
```
