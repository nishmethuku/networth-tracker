import { test, expect } from "@playwright/test";

test("page titles, shortcuts and the skip link work", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /try the demo/i }).click();
  await expect(page.getByText(/demo mode/i).first()).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveTitle(/Net Worth/);

  await page.keyboard.press("r");
  await expect(page).toHaveURL(/\/review$/);
  await expect(page).toHaveTitle(/Year in Review/);

  await page.keyboard.press("b");
  await expect(page).toHaveURL(/\/budget$/);
  await expect(page).toHaveTitle(/Budget/);

  // The first Tab stop on a fresh page is the skip link, and it reaches the main area.
  await page.goto("/portfolio");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeVisible();
});
