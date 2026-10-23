import { test, expect, mockBackend, API_BASE, localISO } from "./fixtures";

const entry = {
  id: 1,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: localISO(),
  amount: 12.5,
  currency: "USD",
  category: "food",
  description: "Lunch with a really long note about the team",
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  created_at: "2026-01-01T00:00:00Z",
};

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Expenses folds the form and insights away, and keeps notes readable", async ({ mockedPage: page }) => {
    await mockBackend(page);
    await page.route(`${API_BASE}/budget/entries**`, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([entry]) })
        : route.continue(),
    );
    await page.goto("/expenses");
    await expect(page.getByText("— Lunch with a really long note about the team")).toBeVisible();

    // The form and the insights start folded away.
    await expect(page.getByText("Add an entry", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("grid", { name: "Spending calendar" })).toBeHidden();
    await page.getByRole("button", { name: /show insights/i }).click();
    await expect(page.getByRole("grid", { name: "Spending calendar" })).toBeVisible();
    await page.getByRole("button", { name: /add an entry with the full form/i }).click();
    await expect(page.getByText("Add an entry", { exact: true })).toBeVisible();

    // The note gets the full row width instead of a sliver, and nothing scrolls sideways.
    const note = page.getByText("— Lunch with a really long note about the team");
    const box = await note.boundingBox();
    expect(box!.width).toBeGreaterThan(150);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
