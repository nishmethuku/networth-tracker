import AxeBuilder from "@axe-core/playwright";
import { test, expect, API_BASE } from "./fixtures";

const syncOn = { enabled: true, provider: "plaid", connections: [] };

test("a brand-new account sees the welcome steps, can pick Connect a bank, and passes the accessibility scan", async ({
  mockedPage: page,
}) => {
  await page.route(`${API_BASE}/sync/status**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(syncOn) }),
  );
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: /welcome/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Step 1 of 2")).toBeVisible();

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(800); // let the color fade finish so axe reads final colors
    const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  }

  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("dialog", { name: /what would you like to do first/i })).toBeVisible();
  await page.getByRole("button", { name: /connect a bank/i }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Escape closes the welcome steps and they do not come back after a reload", async ({ mockedPage: page }) => {
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: /welcome/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(/no holdings yet/i)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
