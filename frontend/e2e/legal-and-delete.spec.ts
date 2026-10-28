import AxeBuilder from "@axe-core/playwright";
import { test, expect, API_BASE } from "./fixtures";

test("privacy policy and terms open without signing in", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByText("We do not sell your data")).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();
  await expect(page.getByText("Not financial advice", { exact: true })).toBeVisible();
});

test("deleting the account needs the typed phrase and sends it", async ({ mockedPage: page }) => {
  let body: any = null;
  await page.route(`${API_BASE}/account`, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    body = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ login_deleted: true }) });
  });
  await page.goto("/settings");
  const button = page.getByRole("button", { name: "Delete my account" });
  await expect(button).toBeDisabled();
  await page.getByLabel("Type DELETE ACCOUNT to confirm").fill("DELETE ACCOUNT");
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(() => body).toEqual({ confirm: "DELETE ACCOUNT" });
});

for (const path of ["/privacy", "/terms"]) {
  for (const theme of ["light", "dark"]) {
    test(`${path} passes the accessibility scan in ${theme} mode`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.waitForTimeout(800); // let the color fade finish
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
}
