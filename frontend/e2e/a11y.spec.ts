import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated accessibility scan (axe) of every page in demo mode. Fails on
 * serious or critical problems only; minor ones are reported but allowed.
 */
const PAGES = [
  "/",
  "/portfolio",
  "/liabilities",
  "/transactions",
  "/budget",
  "/income",
  "/tax-summary",
  "/insights",
  "/what-if",
  "/alerts",
  "/accounts",
  "/settings",
  "/review",
];

for (const theme of ["light", "dark"]) {
  test(`no serious accessibility violations on any page (${theme})`, async ({ page }) => {
    test.setTimeout(180000);
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /try the demo/i }).click();
    await expect(page.getByText(/demo mode/i).first()).toBeVisible();

    const report: string[] = [];
    let serious = 0;
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForTimeout(800);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      for (const v of results.violations) {
        const isSerious = v.impact === "serious" || v.impact === "critical";
        if (isSerious) serious += 1;
        report.push(
          `${isSerious ? "SERIOUS" : "minor  "} ${theme} ${path} ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help} | e.g. ${v.nodes[0]?.target?.join(" ")}`,
        );
      }
    }
    console.log("\n" + report.join("\n"));
    expect(serious, report.join("\n")).toBe(0);
  });
}
