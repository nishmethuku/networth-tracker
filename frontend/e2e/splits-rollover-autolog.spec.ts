import { test, expect, mockBackend, API_BASE, localISO } from "./fixtures";

const month = localISO().slice(0, 7);
const groceries = {
  id: 1,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: localISO(),
  amount: 50,
  currency: "USD",
  category: "food",
  description: "Grocery run",
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  charged_liability_id: 9,
  created_at: "2026-01-01T00:00:00Z",
};

test("splitting an expense keeps the first part and adds the rest on the same card", async ({ mockedPage: page }) => {
  await mockBackend(page);
  const posts: Array<Record<string, unknown>> = [];
  let put: Record<string, unknown> | null = null;
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      posts.push(req.postDataJSON());
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...groceries, id: 2 }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([groceries]) });
  });
  await page.route(`${API_BASE}/budget/entries/1`, (route) => {
    if (route.request().method() === "PUT") {
      put = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(groceries) });
    }
    return route.continue();
  });

  await page.goto("/expenses");
  await page.getByRole("button", { name: /split food entry/i }).click();
  const dialog = page.getByRole("dialog", { name: "Split expense" });
  await dialog.getByLabel("Part 1 amount").fill("30");
  await dialog.getByLabel("Part 2 category").selectOption("shopping");
  await dialog.getByLabel("Part 2 amount").fill("15");
  await dialog.getByRole("button", { name: "Split", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("5.00 is still unassigned");

  await dialog.getByLabel("Part 2 amount").fill("20");
  await dialog.getByRole("button", { name: "Split", exact: true }).click();
  await expect.poll(() => put).toMatchObject({ amount: 30, category: "food" });
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ amount: 20, category: "shopping", charge_liability_id: 9, entry_date: groceries.entry_date });
});

test("a limit shows what carried over and can turn carry over on", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await page.route(`${API_BASE}/budget/entries**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([groceries]) }),
  );
  await page.route(`${API_BASE}/budget/summary**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        months: [{ month, income: 0, expenses: 50, net: -50 }],
        category_breakdown: [{ category: "food", amount: 50 }],
        limit_status: [{ category: "food", limit: 160, base_limit: 100, carried_over: 60, rollover: true, spent: 50, percent: 31.3 }],
        other_currency_entries: 0,
        latest_month: month,
      }),
    }),
  );
  let body: Record<string, unknown> | null = null;
  await page.route(`${API_BASE}/budget/limits**`, (route) => {
    if (route.request().method() === "POST") {
      body = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 1, category: "food", monthly_limit: 100, currency: "USD", rollover: false }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto("/expenses");
  await expect(page.getByText(/left over from last month/)).toContainText("$60");
  await page.getByRole("button", { name: /carry over unspent food budget: on/i }).click();
  await expect.poll(() => body).toMatchObject({ category: "food", monthly_limit: 100, rollover: false });
});

test("the year card shows, and automatic bill logging runs once when switched on", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await page.route(`${API_BASE}/budget/entries**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([groceries]) }),
  );
  await page.route(`${API_BASE}/budget/year**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        year: new Date().getFullYear(),
        currency: "USD",
        months: Array.from({ length: 12 }, (_, i) => ({
          month: `${new Date().getFullYear()}-${String(i + 1).padStart(2, "0")}`,
          expenses: i === 2 ? 900 : 100,
          income: 0,
        })),
        total_spent: 2000,
        total_income: 0,
        average_month: 166.67,
        biggest_month: { month: `${new Date().getFullYear()}-03`, expenses: 900, income: 0 },
        top_categories: [{ category: "housing", amount: 1200 }],
        last_year_spent: 1500,
      }),
    }),
  );
  await page.route(`${API_BASE}/budget/subscriptions**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currency: "USD",
        monthly_total: 15,
        items: [
          {
            category: "entertainment",
            description: "Netflix",
            amount: 15,
            frequency: "monthly",
            next_due: "2099-01-01",
            monthly_equivalent: 15,
          },
        ],
      }),
    }),
  );
  let logCalls = 0;
  await page.route(`${API_BASE}/budget/recurring/log-due`, (route) => {
    logCalls += 1;
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ count: 2, created: [] }) });
  });

  await page.goto("/expenses");
  await expect(page.getByText(/so far$/)).toBeVisible();
  await expect(page.getByLabel(/Top categories in/)).toContainText("Housing");
  expect(logCalls).toBe(0);

  await page.getByLabel(/Log my recurring bills automatically/).check();
  await page.reload();
  await expect.poll(() => logCalls).toBe(1);
  await expect(page.getByText(/Logged 2 recurring bills/)).toBeVisible();
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(logCalls).toBe(1);
});
