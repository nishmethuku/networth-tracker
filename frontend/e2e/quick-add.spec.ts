import { test, expect, mockBackend, API_BASE } from "./fixtures";

test("the E key and the floating button open a quick expense form that saves in two steps", async ({ mockedPage: page }) => {
  await mockBackend(page);
  let posted: any = null;
  await page.route(`${API_BASE}/budget/entries`, (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 1, ...posted, user_id: "x", household_id: null, created_at: "2026-10-22T00:00:00Z" }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/portfolio");
  await expect(page.getByRole("button", { name: /add expense/i })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("e");
  const dialog = page.getByRole("dialog", { name: "Add expense" });
  await expect(dialog).toBeVisible();
  // The amount is focused, so typing goes straight in.
  await expect(dialog.locator("#qa-amount")).toBeFocused();
  await page.keyboard.type("12.50");
  await dialog.getByLabel("Category").selectOption("food");
  await dialog.getByLabel(/Note/).fill("Lunch");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({ entry_type: "expense", amount: 12.5, category: "food", description: "Lunch" });
  expect(posted.entry_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(dialog).toBeHidden();

  // Second time: the floating button opens it and remembers the last category.
  await page.getByRole("button", { name: /add expense/i }).click();
  await expect(page.getByRole("dialog", { name: "Add expense" }).getByLabel("Category")).toHaveValue("food");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add expense" })).toBeHidden();
});

test("the quick add form asks for an amount before saving", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await page.goto("/portfolio");
  await page.getByRole("button", { name: /add expense/i }).click();
  const dialog = page.getByRole("dialog", { name: "Add expense" });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(/amount/i);
});
