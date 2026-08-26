import { test as base, expect, type Page, type Route } from "@playwright/test";

/**
 * These E2E tests never talk to a real Supabase project or backend — both
 * are mocked so the suite needs zero secrets and runs the same locally and
 * in CI. Two pieces make that work:
 *
 * 1. A fake (unsigned, but structurally valid) Supabase session is seeded
 *    into localStorage before the app's first script runs, under the same
 *    key format the Supabase JS SDK itself uses (`sb-<project-ref>-auth-
 *    token`). The SDK reads this on init and treats the app as logged in
 *    without any network round trip, since the expiry is far in the
 *    future. The JWT's signature is never verified client-side — it's only
 *    ever forwarded as a Bearer token to backend requests, which are
 *    mocked below anyway.
 * 2. Every backend API call (`/dashboard`, `/holdings`, ...) is intercepted
 *    via page.route() and answered with fixture JSON instead of hitting a
 *    real server.
 */

// Must match playwright.config.ts's webServer.env.VITE_SUPABASE_URL exactly
// -- that's what the app is actually built against for these tests,
// regardless of whatever (if anything) frontend/.env contains locally.
const E2E_SUPABASE_URL = "https://e2e-test-project.supabase.co";
const PROJECT_REF = new URL(E2E_SUPABASE_URL).hostname.split(".")[0];
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
const API_BASE = "http://localhost:5001"; // the app's VITE_API_URL fallback when unset at build time

function base64url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function fakeJwt(payload: Record<string, unknown>): string {
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const body = base64url(payload);
  return `${header}.${body}.fake-signature-not-verified-client-side`;
}

export const FAKE_USER_ID = "00000000-0000-4000-8000-000000000001";
export const FAKE_USER_EMAIL = "e2e-test@example.com";

function fakeSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour out
  const accessToken = fakeJwt({ sub: FAKE_USER_ID, email: FAKE_USER_EMAIL, exp: expiresAt, aud: "authenticated" });
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "fake-refresh-token",
    user: {
      id: FAKE_USER_ID,
      email: FAKE_USER_EMAIL,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    },
  };
}

async function seedAuthedSession(page: Page) {
  const session = fakeSession();
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: session },
  );
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Empty-state fixtures — a brand-new account with no data yet. */
export const emptyDashboard = {
  total_net_worth: 0,
  total_assets: 0,
  total_liabilities: 0,
  currency: "USD",
  portfolio_xirr: null,
  allocation_by_type: [],
  allocation_by_country: [],
  allocation_by_currency: [],
  top_gainers: [],
  top_losers: [],
  realized_gain: 0,
  unrealized_gain: 0,
  income_received: 0,
};

/** A populated dashboard — one stock holding worth $1,500 with a $500 gain. */
export const populatedDashboard = {
  ...emptyDashboard,
  total_net_worth: 1500,
  total_assets: 1500,
  portfolio_xirr: 0.18,
  allocation_by_type: [{ label: "stock", value: 1500 }],
  allocation_by_country: [{ label: "United States", value: 1500 }],
  allocation_by_currency: [{ label: "USD", value: 1500 }],
  unrealized_gain: 500,
};

export const sampleHolding = {
  id: 1,
  user_id: FAKE_USER_ID,
  household_id: null,
  asset_type: "stock",
  symbol: "AAPL",
  name: "Apple Inc",
  country: "United States",
  account: "Brokerage",
  institution: null,
  currency: "USD",
  interest_rate: null,
  maturity_date: null,
  sip_amount: null,
  sip_frequency: null,
  sip_start_date: null,
  is_private: false,
  notes: null,
  tags: null,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  quantity: 10,
  avg_cost: 100,
  cost_basis: 1000,
  display_cost_basis: 1000,
  current_price: 150,
  realized_gain: 0,
  unrealized_gain: 500,
  display_unrealized_gain: 500,
  total_gain: 500,
  xirr: 0.18,
  income_received: 0,
  display_income_received: 0,
  first_value: null,
  display_first_value: null,
  gain: null,
  current_value: 1500,
  display_value: 1500,
};

type MockOptions = {
  holdings?: unknown[];
  dashboard?: unknown;
};

/**
 * Wires up an authed session plus a baseline set of API mocks covering
 * every GET the app fires on a typical page load, so navigating between
 * pages doesn't hang on an unmocked request. Individual tests can layer
 * additional page.route() calls for endpoints they care about.
 */
async function mockBackend(page: Page, opts: MockOptions = {}) {
  const holdings = opts.holdings ?? [];
  const dashboard = opts.dashboard ?? emptyDashboard;

  await page.route(`${API_BASE}/dashboard**`, (route) => json(route, dashboard));
  await page.route(`${API_BASE}/holdings**`, (route) => {
    if (route.request().method() === "GET") return json(route, holdings);
    return route.continue();
  });
  await page.route(`${API_BASE}/net-worth-history**`, (route) => json(route, []));
  await page.route(`${API_BASE}/transactions**`, (route) => json(route, []));
  await page.route(`${API_BASE}/liabilities**`, (route) => json(route, []));
  await page.route(`${API_BASE}/goals**`, (route) => json(route, []));
  await page.route(`${API_BASE}/allocation-targets**`, (route) => json(route, {}));
  await page.route(`${API_BASE}/allocation-drift**`, (route) => json(route, { has_target: false }));
  await page.route(`${API_BASE}/milestones**`, (route) => json(route, []));
  await page.route(`${API_BASE}/emergency-fund**`, (route) =>
    json(route, { months_covered: null, liquid_cash: 0, avg_monthly_expenses: 0 }),
  );
  await page.route(`${API_BASE}/exchange-rates**`, (route) => json(route, { base: "USD", rates: { USD: 1, INR: 83, AUD: 1.5 } }));
  await page.route(`${API_BASE}/benchmark**`, (route) =>
    json(route, { portfolioXirr: null, benchmarkXirr: null, benchmarkLabel: "S&P 500 (SPY)" }),
  );
  await page.route(`${API_BASE}/price-cache-status**`, (route) => json(route, {}));
  await page.route(`${API_BASE}/budget/categories**`, (route) =>
    json(route, {
      income: ["paycheck", "bonus", "interest", "gift", "other_income"],
      expense: [
        "housing",
        "food",
        "transport",
        "utilities",
        "healthcare",
        "entertainment",
        "shopping",
        "education",
        "insurance",
        "other_expense",
      ],
    }),
  );
  await page.route(`${API_BASE}/budget/summary**`, (route) =>
    json(route, { months: [], category_breakdown: [], limit_status: [], other_currency_entries: 0, latest_month: null }),
  );
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    if (route.request().method() === "GET") return json(route, []);
    return route.continue();
  });
  await page.route(`${API_BASE}/budget/subscriptions**`, (route) => json(route, { items: [], monthly_total: 0 }));
  await page.route(`${API_BASE}/budget/limits**`, (route) => {
    if (route.request().method() === "GET") return json(route, []);
    return route.continue();
  });
  await page.route(`${API_BASE}/households**`, (route) => {
    if (route.request().method() === "GET") return json(route, []);
    return route.continue();
  });
  await page.route(`${API_BASE}/invites**`, (route) => {
    if (route.request().method() === "GET") return json(route, []);
    return route.continue();
  });
}

export const test = base.extend<{ mockedPage: Page }>({
  mockedPage: async ({ page }, use) => {
    await seedAuthedSession(page);
    await mockBackend(page);
    await use(page);
  },
});

export { expect, mockBackend, json, API_BASE };
