import { test, expect, mockBackend, API_BASE, localISO } from "./fixtures";

const base = {
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: localISO(),
  currency: "USD",
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  created_at: "2026-01-01T00:00:00Z",
};
const rows = [
  { ...base, id: 1, amount: 50, category: "food", description: "Card dinner", charged_liability_id: 9 },
  { ...base, id: 2, amount: 8, category: "transport", description: "Cash bus", charged_liability_id: null },
];

test("deleting a card purchase puts the money back, a plain one does not", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await page.route(`${API_BASE}/budget/entries**`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) })
      : route.continue(),
  );
  const urls: string[] = [];
  await page.route(`${API_BASE}/budget/entries/*`, (route) => {
    if (route.request().method() === "DELETE") {
      urls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Entry deleted", reversed: {} }),
      });
    }
    return route.continue();
  });

  await page.goto("/expenses");
  await page.getByRole("button", { name: /delete food entry/i }).click();
  await expect(page.getByText("Entry deleted and the money put back")).toBeVisible();
  await page.getByRole("button", { name: /delete transport entry/i }).click();
  await expect.poll(() => urls.length).toBe(2);
  expect(urls[0]).toContain("/budget/entries/1?reverse=true");
  expect(urls[1]).toMatch(/\/budget\/entries\/2$/);
});
