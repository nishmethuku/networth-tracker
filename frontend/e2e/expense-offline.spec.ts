import { test, expect, mockBackend, API_BASE } from "./fixtures";

const today = new Date().toISOString().slice(0, 10);
const row = (id: number) => ({
  id,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: today,
  amount: 12.5,
  currency: "USD",
  category: "food",
  description: "Lunch",
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  created_at: `${today}T00:00:00Z`,
});

test("an expense saved without a connection is kept and sent when it comes back", async ({ mockedPage: page }) => {
  await mockBackend(page);
  let online = false;
  const posted: any[] = [];
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      if (!online) return route.abort("failed");
      posted.push(req.postDataJSON());
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row(50)) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/portfolio");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("e");
  const dialog = page.getByRole("dialog", { name: "Add expense" });
  await dialog.getByLabel("Amount").fill("7.25");
  await dialog.getByLabel("Category").selectOption("food");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText(/saved on this device/i)).toBeVisible();
  await expect(dialog).toBeHidden();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("nw_pending_expenses") || "[]"));
  expect(stored).toHaveLength(1);
  expect(stored[0].payload).toMatchObject({ amount: 7.25, category: "food" });

  online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]).toMatchObject({ amount: 7.25, category: "food" });
  await expect(page.getByText(/synced 1 expense/i)).toBeVisible();
  const left = await page.evaluate(() => JSON.parse(localStorage.getItem("nw_pending_expenses") || "[]"));
  expect(left).toHaveLength(0);
});

test("deleting an expense offers Undo, and quick add can switch currency", async ({ mockedPage: page }) => {
  await mockBackend(page);
  let restored: any = null;
  let deleted = false;
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    const req = route.request();
    if (req.method() === "DELETE") {
      deleted = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Entry deleted" }) });
    }
    if (req.method() === "POST") {
      restored = req.postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row(77)) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deleted ? [] : [row(1)]) });
  });

  await page.goto("/expenses");
  await expect(page.getByText("Lunch")).toBeVisible();
  await page.getByRole("button", { name: /delete food entry/i }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => restored).not.toBeNull();
  expect(restored).toMatchObject({ amount: 12.5, category: "food", description: "Lunch", entry_date: today });

  await page.keyboard.press("e");
  const dialog = page.getByRole("dialog", { name: "Add expense" });
  await dialog.getByLabel("Currency").selectOption("INR");
  await expect(dialog.getByLabel("Currency")).toHaveValue("INR");
});
