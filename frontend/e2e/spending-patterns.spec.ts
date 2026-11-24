import { test, expect, mockBackend, API_BASE, localISO } from "./fixtures";

function monthsAgo(n: number, day = 10) {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth() - n, day));
}

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
  entry(1, monthsAgo(1), 300, "food", "Groceries"),
  entry(2, monthsAgo(2), 300, "food", "Groceries"),
  entry(3, monthsAgo(3), 300, "food", "Groceries"),
  entry(4, localISO(), 18, "food", "Chipotle"),
];

test("quick add offers Undo after saving", async ({ mockedPage: page }) => {
  await mockBackend(page);
  let deleted = false;
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(entry(77, localISO(), 6, "food", "Tea")) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route(`${API_BASE}/budget/entries/77**`, (route) => {
    deleted = route.request().method() === "DELETE";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Entry deleted" }) });
  });

  await page.goto("/portfolio");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add expense (E)" }).click();
  const dialog = page.getByRole("dialog", { name: "Add expense" });
  await expect(dialog.locator("#qa-amount")).toBeFocused();
  await page.keyboard.type("6");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => deleted).toBe(true);
});
