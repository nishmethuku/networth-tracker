import { test, expect, mockBackend, API_BASE, localISO } from "./fixtures";

const e = (id: number, amount: number, category: string, description: string) => ({
  id,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: localISO(),
  amount,
  currency: "USD",
  category,
  description,
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  created_at: "2026-01-01T00:00:00Z",
});
const rows = [e(1, 5, "food", "Snack"), e(2, 50, "food", "Dinner"), e(3, 500, "transport", "Flight")];

async function setup(page: import("@playwright/test").Page) {
  await mockBackend(page);
  await page.route(`${API_BASE}/budget/entries**`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) })
      : route.continue(),
  );
}

test("filter by amount range and sort biggest first", async ({ mockedPage: page }) => {
  await setup(page);
  await page.goto("/expenses");
  await expect(page.getByText("— Dinner")).toBeVisible();
  await page.getByLabel("Minimum amount").fill("10");
  await page.getByLabel("Maximum amount").fill("100");
  await expect(page.getByText("— Snack")).toHaveCount(0);
  await expect(page.getByText("— Flight")).toHaveCount(0);
  await expect(page.getByText("— Dinner")).toBeVisible();
  await page.getByLabel("Minimum amount").fill("");
  await page.getByLabel("Maximum amount").fill("");
  await page.getByLabel("Sort entries").selectOption("biggest");
  const order = await page.locator("span", { hasText: /— (Snack|Dinner|Flight)/ }).allTextContents();
  expect(order.map((t) => t.replace(/[— ]/g, ""))).toEqual(["Flight", "Dinner", "Snack"]);
});

test("select several entries to move them to another category, or delete them", async ({ mockedPage: page }) => {
  await setup(page);
  const puts: Array<{ url: string; body: Record<string, unknown> }> = [];
  const deletes: string[] = [];
  await page.route(`${API_BASE}/budget/entries/*`, (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      puts.push({ url: req.url(), body: req.postDataJSON() });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows[0]) });
    }
    if (req.method() === "DELETE") {
      deletes.push(req.url());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Entry deleted", reversed: {} }),
      });
    }
    return route.continue();
  });
  page.on("dialog", (d) => d.accept());

  await page.goto("/expenses");
  await expect(page.getByText("— Dinner")).toBeVisible();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("checkbox", { name: /Select Food entry Snack/ }).check();
  await page.getByRole("checkbox", { name: /Select Food entry Dinner/ }).check();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByLabel("Move to category").selectOption("transport");
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect.poll(() => puts.length).toBe(2);
  expect(puts[0].body).toMatchObject({ category: "transport" });

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("checkbox", { name: /Select Transport entry Flight/ }).check();
  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect.poll(() => deletes.length).toBe(1);
  expect(deletes[0]).toMatch(/\/budget\/entries\/3$/);
});
