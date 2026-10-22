import { test, expect } from "@playwright/test";

test("Insights shows the spending trend and year table in the demo", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /try the demo/i }).click();
  await expect(page.getByText(/demo mode/i).first()).toBeVisible();
  await page.goto("/insights");
  await expect(page.getByText("Income and spending")).toBeVisible();
  await expect(page.getByText("Year by year")).toBeVisible();
});
