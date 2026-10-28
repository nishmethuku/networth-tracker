import AxeBuilder from "@axe-core/playwright";
import { test, expect, API_BASE } from "./fixtures";

const status = {
  enabled: true,
  provider: "plaid",
  connections: [
    {
      id: 7,
      provider: "plaid",
      kind: "bank",
      institution_name: "First Platypus Bank",
      status: "active",
      last_synced_at: null,
      last_error: null,
    },
    {
      id: 8,
      provider: "plaid",
      kind: "bank",
      institution_name: "Old Credit Union",
      status: "error",
      last_synced_at: null,
      last_error: "The bank needs you to sign in again. Reconnect it.",
    },
  ],
};

test("Settings lists linked banks, syncs one, and the card passes the accessibility scan", async ({ mockedPage: page }) => {
  let pulled = false;
  await page.route(`${API_BASE}/sync/status**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) }),
  );
  await page.route(`${API_BASE}/sync/connections/7/pull`, (route) => {
    pulled = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ added: 2, skipped_duplicates: 0, skipped_pending: 1 }),
    });
  });

  await page.goto("/settings");
  await expect(page.getByText("Connected banks")).toBeVisible();
  await expect(page.getByText("First Platypus Bank")).toBeVisible();
  await expect(page.getByText(/sign in again/i)).toBeVisible();

  await page.getByRole("button", { name: /sync first platypus bank now/i }).click();
  await expect.poll(() => pulled).toBe(true);
  await expect(page.getByText("Added 2 transactions")).toBeVisible();

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(800); // let the color fade finish so axe reads final colors
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  }
});

test("Settings shows no bank card when syncing is off", async ({ mockedPage: page }) => {
  await page.route(`${API_BASE}/sync/status**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false, provider: null, connections: [] }),
    }),
  );
  await page.goto("/settings");
  await expect(page.getByText("Install the app").or(page.getByText("Profile")).first()).toBeVisible();
  await expect(page.getByText("Connected banks")).toHaveCount(0);
});
