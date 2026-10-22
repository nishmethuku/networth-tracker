import { test, expect } from "@playwright/test";

test("the ? button explains a finance term in plain words", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /try the demo/i }).click();
  await expect(page.getByText(/demo mode/i).first()).toBeVisible();
  await page.goto("/");
  const button = page.getByRole("button", { name: "What is XIRR?" });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("note").filter({ hasText: "yearly return rate" })).toBeVisible();
  await button.click();
  await expect(page.getByRole("note")).toHaveCount(0);
});
