import { test, expect, mockBackend, populatedDashboard, sampleHolding, API_BASE, localISO } from "./fixtures";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
}
const today = daysAgo(0);

const entry = (id: number, date: string, amount: number, category: string, description: string) => ({
  id,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: date,
  amount,
  currency: "USD",
  category,
  description,
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  created_at: `${date}T00:00:00Z`,
});

const rows = [
  entry(1, today, 12.5, "food", "Lunch"),
  entry(2, today, 40, "transport", "Gas"),
  entry(3, daysAgo(60), 15.99, "entertainment", "Netflix"),
  entry(4, daysAgo(30), 15.99, "entertainment", "Netflix"),
  entry(5, today, 15.99, "entertainment", "Netflix"),
  entry(6, daysAgo(75), 22, "food", "Old pizza"),
];

async function mockEntries(page: import("@playwright/test").Page) {
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });
}

test("the dashboard shows a Spending card and its button opens quick add", async ({ mockedPage: page }) => {
  await mockBackend(page, { dashboard: populatedDashboard, holdings: [sampleHolding] });
  await mockEntries(page);
  await page.goto("/");
  await expect(page.getByLabel("Latest expenses")).toContainText("Lunch");
  await expect(page.getByText("Card payments are left out so nothing is counted twice")).toBeVisible();
  await page.getByRole("button", { name: "+ Add expense" }).click();
  await expect(page.getByRole("dialog", { name: "Add expense" })).toBeVisible();
});

test("quick add understands a typed sentence", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await page.goto("/portfolio");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add expense (E)" }).click();
  await page.getByRole("button", { name: /type it instead/i }).click();
  const typed = page.getByLabel("Type it (optional)");
  await typed.fill("coffee 4.50 yesterday");
  await expect(page.getByText(/press Enter to fill the form/)).toContainText("4.50");
  await typed.press("Enter");
  await expect(page.locator("#qa-amount")).toHaveValue("4.5");
  await expect(page.getByLabel("Note (optional)")).toHaveValue("Coffee");
});

test("Expenses has a calendar you can tap, a recurring tip, and search across months", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await mockEntries(page);
  let putBody: Record<string, unknown> | null = null;
  await page.route(`${API_BASE}/budget/entries/5`, (route) => {
    if (route.request().method() === "PUT") {
      putBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows[4]) });
    }
    return route.continue();
  });

  await page.goto("/expenses");
  await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();

  // Calendar: tap today to see only today, then clear it.
  const dayNumber = String(Number(today.slice(8, 10)));
  await page
    .getByRole("button", { name: new RegExp(`${dayNumber}.*\\$`) })
    .first()
    .click();
  await expect(page.getByText(/only\./)).toBeVisible();
  await page.getByRole("button", { name: "Show the whole month" }).click();
  await expect(page.getByText(/only\./)).toHaveCount(0);

  // Recurring suggestion: Netflix shows about monthly, and one tap tracks it.
  await expect(page.getByText("Looks recurring")).toBeVisible();
  await page.getByRole("button", { name: "Track as monthly" }).click();
  await expect.poll(() => putBody).toMatchObject({ is_recurring: true, recurring_frequency: "monthly" });

  // "/" jumps to search, and searching all months finds an older entry.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search expenses")).toBeFocused();
  await page.getByLabel("Search expenses").fill("pizza");
  await expect(page.getByText("Old pizza")).toHaveCount(0);
  await page.getByLabel("Search all months").check();
  await expect(page.getByText("Old pizza")).toBeVisible();
});
