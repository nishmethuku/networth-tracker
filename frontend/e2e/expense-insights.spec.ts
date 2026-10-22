import { test, expect, mockBackend, API_BASE } from "./fixtures";

const now = new Date();
const today = now.toISOString().slice(0, 10);
const month = today.slice(0, 7);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => ymd(new Date(now.getTime() - n * 86400000));

const row = (id: number, amount: number, category: string, description: string, entry_date = today) => ({
  id,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date,
  amount,
  currency: "USD",
  category,
  description,
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  created_at: `${entry_date}T00:00:00Z`,
});

test("Expenses shows a limit bar, a bill that is due to log, and leaves card payments out of the total", async ({ mockedPage: page }) => {
  await mockBackend(page);
  let logged: any = null;
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      logged = req.postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row(90, 1100, "housing", "Rent")) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([row(1, 100, "food", "Groceries"), row(2, 900, "CC-payment", "Visa bill")]),
    });
  });
  await page.route(`${API_BASE}/budget/summary**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        months: [{ month, income: 0, expenses: 100, net: -100 }],
        category_breakdown: [{ category: "food", amount: 100 }],
        limit_status: [{ category: "food", limit: 120, spent: 100, percent: 83.3 }],
        other_currency_entries: 0,
        latest_month: month,
      }),
    }),
  );
  await page.route(`${API_BASE}/budget/subscriptions**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currency: "USD",
        monthly_total: 1100,
        items: [
          { category: "housing", description: "Rent", amount: 1100, frequency: "monthly", next_due: daysAgo(3), monthly_equivalent: 1100 },
        ],
      }),
    }),
  );

  await page.goto("/expenses");
  // The $900 card payment is listed but not counted: spent is only the $100 of groceries.
  await expect(page.getByText("Card payment, not counted as spending")).toBeVisible();
  await expect(page.getByText("Spent")).toContainText("$100.00");
  await expect(page.getByRole("progressbar", { name: /food limit used/i })).toBeVisible();

  await expect(page.getByText("Due to log")).toBeVisible();
  await page.getByRole("button", { name: /log rent now/i }).click();
  await expect.poll(() => logged).not.toBeNull();
  expect(logged).toMatchObject({
    entry_type: "expense",
    amount: 1100,
    category: "housing",
    description: "Rent",
    entry_date: today,
    is_recurring: true,
  });
});
