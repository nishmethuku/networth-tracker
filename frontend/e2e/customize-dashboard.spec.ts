import { test, expect } from "@playwright/test";

test("hiding a Dashboard card sticks across reloads and can be undone", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /try the demo/i }).click();
  await expect(page.getByText(/demo mode/i).first()).toBeVisible();
  await page.goto("/");

  const stress = page.getByText("Stress test", { exact: true }).first();
  await expect(stress).toBeVisible();

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("checkbox", { name: "Stress test" }).uncheck();
  await expect(page.getByRole("heading", { name: "Stress test" })).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Customize" }).click();
  await expect(page.getByRole("checkbox", { name: "Stress test" })).not.toBeChecked();

  await page.getByRole("button", { name: "Show everything again" }).click();
  await expect(page.getByRole("checkbox", { name: "Stress test" })).toBeChecked();
});
