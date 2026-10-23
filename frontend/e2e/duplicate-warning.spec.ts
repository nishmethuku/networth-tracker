import { test, expect, mockBackend, API_BASE, localISO } from "./fixtures";

const lunch = {
  id: 1,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: localISO(),
  amount: 12.5,
  currency: "USD",
  category: "food",
  description: "Lunch",
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  created_at: "2026-01-01T00:00:00Z",
};

test("quick add warns about a likely duplicate, then lets you save anyway", async ({ mockedPage: page }) => {
  await mockBackend(page);
  let posts = 0;
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...lunch, id: 2 }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([lunch]) });
  });

  await page.goto("/portfolio");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add expense (E)" }).click();
  const dialog = page.getByRole("dialog", { name: "Add expense" });
  await expect(dialog.locator("#qa-amount")).toBeFocused();
  await page.keyboard.type("12.5");
  // A note you have used before brings its usual category along.
  await dialog.getByLabel(/Note/).fill("Lunch");
  await expect(dialog.getByLabel("Category")).toHaveValue("food");

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("already logged");
  expect(posts).toBe(0);

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => posts).toBe(1);
});
