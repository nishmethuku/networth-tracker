import { test, expect, mockBackend, API_BASE } from "./fixtures";

const today = new Date().toISOString().slice(0, 10);
const entry = (id: number, amount: number, category: string, description: string) => ({
  id,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: today,
  amount,
  currency: "USD",
  category,
  description,
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  created_at: `${today}T00:00:00Z`,
});

test("Expenses is its own page with the add form and this month's entries", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([entry(1, 12.5, "food", "Lunch"), entry(2, 40, "transport", "Gas")]),
    });
  });

  await page.goto("/expenses");
  await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
  await expect(page.getByText("Add an entry")).toBeVisible();
  await expect(page.getByText("Lunch")).toBeVisible();
  await expect(page.getByText("Spent")).toContainText("$52.50");
  await expect(page).toHaveTitle(/Expenses/);

  // Budget no longer carries the form, it points here instead.
  await page.goto("/budget");
  await expect(page.getByText("Add an entry")).toHaveCount(0);
  await page.getByRole("link", { name: /go to expenses/i }).click();
  await expect(page).toHaveURL(/\/expenses$/);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the center plus in the bottom bar opens add expense, not add holding", async ({ mockedPage: page }) => {
    await mockBackend(page);
    await page.goto("/portfolio");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByRole("dialog", { name: "Add expense" })).toBeVisible();
    await expect(page).toHaveURL(/\/portfolio$/);
  });
});
