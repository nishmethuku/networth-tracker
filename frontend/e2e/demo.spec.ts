import { test, expect, type Page } from "@playwright/test";

/**
 * Demo mode runs the whole app on sample data with no sign-in and no calls
 * to the backend. These tests start it from the login page, walk every
 * page, and fail if any request is made to the API or any page crashes.
 */

const PAGES = [
  "/",
  "/portfolio",
  "/portfolio/1",
  "/liabilities",
  "/transactions",
  "/budget",
  "/income",
  "/tax-summary",
  "/insights",
  "/allocation-advisor",
  "/what-if",
  "/alerts",
  "/accounts",
  "/household",
];

async function startDemo(page: Page) {
  const apiCalls: string[] = [];
  const crashes: string[] = [];
  page.on("request", (r: { url(): string }) => {
    if (r.url().startsWith("http://localhost:5001")) apiCalls.push(r.url());
  });
  page.on("pageerror", (e: Error) => crashes.push(e.message));
  await page.goto("/login");
  // The login page itself still sends the usual wake-up ping, before the
  // demo is on. Only requests made once the demo has started count.
  await page.waitForLoadState("networkidle");
  apiCalls.length = 0;
  await page.getByRole("button", { name: /try the demo/i }).click();
  await expect(page.getByText(/demo mode/i).first()).toBeVisible();
  return { apiCalls, crashes };
}

test("the demo starts from the login page and shows sample net worth", async ({ page }) => {
  const { apiCalls } = await startDemo(page);
  await expect(page.getByText("Total Net Worth")).toBeVisible();
  await expect(page.getByText("Stress test")).toBeVisible();
  expect(apiCalls).toEqual([]);
});

test("every page loads in demo mode without crashing or calling the backend", async ({ page }) => {
  const { apiCalls, crashes } = await startDemo(page);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.getByText(/demo mode/i).first()).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  }
  expect(crashes).toEqual([]);
  expect(apiCalls).toEqual([]);
});

test("the Income page shows the sample dividends", async ({ page }) => {
  await startDemo(page);
  await page.goto("/income");
  await expect(page.getByRole("heading", { name: "Income" })).toBeVisible();
  await expect(page.getByText("Last 12 months").first()).toBeVisible();
  await expect(page.getByText("VTI")).toBeVisible();
});

test("exiting the demo returns to the login page and clears demo mode", async ({ page }) => {
  await startDemo(page);
  await page.getByRole("button", { name: /exit demo/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("Hide amounts masks every money amount on the Dashboard and Show amounts brings them back", async ({ page }) => {
  await startDemo(page);
  const netWorthCard = page.locator("body");
  await expect(netWorthCard).toContainText(/\$\d/); // real amounts are visible first
  await page.getByRole("button", { name: "Hide amounts" }).first().click();
  await expect(page.getByRole("button", { name: "Show amounts" }).first()).toBeVisible();
  await page.waitForTimeout(600); // the animated net worth number settles
  // A goal named "Reach $100K" is the user's own text, not a formatted amount.
  const text = (await page.locator(".page-content").innerText()).replace("Reach $100K", "");
  expect(text).toContain("••••");
  expect(text).not.toMatch(/\$\d/); // no dollar figure is left on the page
  await page.getByRole("button", { name: "Show amounts" }).first().click();
  await expect(netWorthCard).toContainText(/\$\d/);
});
