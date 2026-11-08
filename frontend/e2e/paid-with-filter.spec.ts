import { test, expect, mockBackend, API_BASE, localISO, sampleHolding } from "./fixtures";

const e = (id: number, amount: number, description: string, extra: Record<string, unknown>) => ({
  id,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: localISO(),
  amount,
  currency: "USD",
  category: "food",
  description,
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});
const rows = [e(1, 5, "Snack", { charged_liability_id: 5 }), e(2, 50, "Dinner", { funding_holding_id: 9 }), e(3, 500, "Flight", {})];
const savings = { ...sampleHolding, id: 9, asset_type: "cash", symbol: null, name: "Savings", account: "Chase", quantity: null };
const visa = {
  id: 5,
  user_id: "x",
  household_id: null,
  name: "Visa",
  liability_type: "credit_card",
  currency: "USD",
  current_balance: 800,
  original_amount: null,
  interest_rate: 20,
  notes: null,
  is_private: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

test("list expenses by the card or account they were paid from", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await page.route(`${API_BASE}/budget/entries**`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) })
      : route.continue(),
  );
  await page.route(`${API_BASE}/liabilities**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([visa]) }),
  );
  await page.route(`${API_BASE}/holdings**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([savings]) }),
  );
  await page.goto("/expenses");
  await expect(page.getByText("— Flight")).toBeVisible();
  const filter = page.getByLabel("Filter by paid from");
  await filter.selectOption({ label: "Visa" });
  await expect(page.getByText("— Snack")).toBeVisible();
  await expect(page.getByText("— Dinner")).toHaveCount(0);
  await filter.selectOption({ label: "Savings" });
  await expect(page.getByText("— Dinner")).toBeVisible();
  await expect(page.getByText("— Snack")).toHaveCount(0);
  await filter.selectOption("none");
  await expect(page.getByText("— Flight")).toBeVisible();
  await expect(page.getByText("— Dinner")).toHaveCount(0);
});
