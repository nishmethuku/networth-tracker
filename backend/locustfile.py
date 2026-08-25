"""
Load test for the read-heavy endpoints a real session actually hits on a
typical page load (Dashboard, Portfolio, Transactions, Insights) — the
paths a logged-in user's browser fires in parallel, not synthetic
single-endpoint hammering.

Usage:
    export LOAD_TEST_TOKEN=<a real Supabase access token for a test account>
    locust -f backend/locustfile.py --host http://localhost:5002

Get a token quickly with a throwaway account (see the live-testing pattern
in this repo's session history / DEPLOY.md) — never point this at a real
user's account or, without explicit intent, at the production URL:
Render's free tier and Supabase's free-tier connection pool are both
finite, and generating real load against production is a deliberate
choice, not something to do by accident. --host defaults to nothing on
purpose, so you always have to say where this is running against.

Every simulated user shares one auth token, which is realistic for
testing backend performance under concurrent request volume (the thing
this is actually measuring) but not for testing per-user rate limiting,
since this app's Flask-Limiter is keyed by source IP (get_remote_address),
not by user/token — every request from this one machine shares whatever
rate-limit bucket that IP gets. See LOAD_TEST_RESULTS.md for what running
this actually found: with REDIS_URL unset, gunicorn's 2 worker processes
each keep their own separate in-memory counter, so the documented "60 per
minute" limit was not being enforced at all in practice (measured: 70
sequential requests to one route, 0 rejected) -- confirmed fixed once
REDIS_URL points at a real Redis instance (same 70 requests then correctly
60'd through before 429s start). Point this test at a backend with
REDIS_URL configured if you want to test past that threshold without
immediately hitting 429s for reasons unrelated to what you're measuring.
"""
import os

from locust import HttpUser, task, between


TOKEN = os.environ.get("LOAD_TEST_TOKEN")
if not TOKEN:
    raise RuntimeError("Set LOAD_TEST_TOKEN to a valid Supabase access token before running this load test.")


class NetWorthTrackerUser(HttpUser):
    # 1-3s between requests per simulated user -- roughly matching how a
    # real person actually browses (read a screen, click something, wait
    # for it to load) rather than a tight hammering loop.
    wait_time = between(1, 3)

    def on_start(self):
        self.client.headers.update({"Authorization": f"Bearer {TOKEN}"})

    @task(5)
    def dashboard(self):
        self.client.get("/dashboard?currency=USD", name="/dashboard")

    @task(3)
    def holdings_summary(self):
        self.client.get("/holdings?currency=USD&summary=true", name="/holdings (summary)")

    @task(2)
    def transactions(self):
        self.client.get("/transactions", name="/transactions")

    @task(2)
    def net_worth_history(self):
        self.client.get("/net-worth-history?currency=USD", name="/net-worth-history")

    @task(1)
    def exchange_rates(self):
        self.client.get("/exchange-rates?base=USD", name="/exchange-rates")
