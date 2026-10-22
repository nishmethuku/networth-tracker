import { test, expect } from "@playwright/test";

test("Ctrl+K jumps to a page by name without any AI call", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /try the demo/i }).click();
  await expect(page.getByText(/demo mode/i).first()).toBeVisible();
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("Control+k");
  const box = page.getByRole("textbox", { name: /go to a page or ask/i });
  await expect(box).toBeFocused();
  await box.fill("budget");
  await expect(page.getByRole("option", { name: /go to budget/i })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/budget$/);

  // Keywords work too, and arrow keys move the highlight.
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: /go to a page or ask/i }).fill("mortgage");
  await expect(page.getByRole("option", { name: /go to liabilities/i })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/liabilities$/);
});
