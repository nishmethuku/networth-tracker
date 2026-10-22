import { test, expect } from "@playwright/test";

test("Dashboard shows financial independence, spending categories and CSV download in the demo", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /try the demo/i }).click();
  await expect(page.getByText(/demo mode/i).first()).toBeVisible();
  await expect(page.getByText("Financial independence").first()).toBeVisible();
  await expect(page.getByRole("progressbar", { name: /financial independence/i })).toBeVisible();
  await expect(page.getByText("Where your spending goes")).toBeVisible();
  await expect(page.getByText("Housing", { exact: true })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /download history/i }).click();
  expect((await download).suggestedFilename()).toMatch(/^net-worth-history-\d{4}-\d{2}-\d{2}\.csv$/);
});
