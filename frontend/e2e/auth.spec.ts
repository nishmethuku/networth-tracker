import { test, expect } from "@playwright/test";

test.describe("Authentication gate", () => {
  test("an unauthenticated visitor is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("#email")).toBeVisible();
  });

  test("visiting a protected deep link while logged out still redirects to /login", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page).toHaveURL(/\/login$/);
  });
});
