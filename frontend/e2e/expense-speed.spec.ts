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

test("Expenses can search, edit and repeat an entry", async ({ mockedPage: page }) => {
  await mockBackend(page);
  let updated: any = null;
  let created: any = null;
  const rows = [entry(1, 12.5, "food", "Lunch"), entry(2, 40, "transport", "Gas")];
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      created = req.postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...rows[0], id: 9 }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });

  // Registered last, so it wins over the generic list route above.
  await page.route(`${API_BASE}/budget/entries/1`, (route) => {
    updated = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...rows[0], ...updated }) });
  });

  await page.goto("/expenses");
  await expect(page.getByText("Lunch")).toBeVisible();
  await expect(page.getByText("Gas")).toBeVisible();

  // Search narrows the list.
  await page.getByLabel("Search expenses").fill("gas");
  await expect(page.getByText("Lunch")).toHaveCount(0);
  await expect(page.getByText("Gas")).toBeVisible();
  await page.getByLabel("Search expenses").fill("nothing like this");
  await expect(page.getByText(/no entries match/i)).toBeVisible();
  await page.getByLabel("Search expenses").fill("");

  // Edit the lunch amount.
  await page.getByRole("button", { name: /edit food entry/i }).click();
  const dialog = page.getByRole("dialog", { name: "Edit entry" });
  await dialog.getByLabel(/Amount/).fill("15");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => updated).not.toBeNull();
  expect(updated).toMatchObject({ amount: 15, category: "food", description: "Lunch" });

  // Repeat logs the same thing for today.
  await page.getByRole("button", { name: /repeat food entry/i }).click();
  await expect.poll(() => created).not.toBeNull();
  expect(created).toMatchObject({ entry_type: "expense", amount: 12.5, category: "food", description: "Lunch", entry_date: today });
});

test("quick add offers your frequent expenses as one-tap buttons", async ({ mockedPage: page }) => {
  await mockBackend(page);
  const rows = [entry(1, 5, "food", "Coffee"), entry(2, 6, "food", "Coffee"), entry(3, 40, "transport", "Gas")];
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });

  await page.goto("/portfolio");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("e");
  const dialog = page.getByRole("dialog", { name: "Add expense" });
  await expect(dialog.getByText(/spent today/i)).toBeVisible();
  await dialog.getByRole("button", { name: /coffee/i }).click();
  await expect(dialog.getByLabel(/Amount/)).toHaveValue("6");
  await expect(dialog.getByLabel("Category")).toHaveValue("food");
  await expect(dialog.getByLabel(/Note/)).toHaveValue("Coffee");
  // Gas was logged only once, so it is not offered.
  await expect(dialog.getByRole("button", { name: /gas/i })).toHaveCount(0);
});
