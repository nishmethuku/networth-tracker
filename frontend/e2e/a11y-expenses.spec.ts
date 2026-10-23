import AxeBuilder from "@axe-core/playwright";
import { test, expect, mockBackend, populatedDashboard, sampleHolding, API_BASE, localISO } from "./fixtures";

/**
 * Accessibility scan of the Expenses page with real-looking data, open dialogs and the phone
 * layout, in both themes. The demo-mode scan cannot reach these because it has no expenses.
 */
function monthsAgo(n: number, day = 10) {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth() - n, day));
}
const row = (id: number, date: string, amount: number, category: string, description: string, extra: Record<string, unknown> = {}) => ({
  id,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: date,
  amount,
  currency: "USD",
  category,
  description,
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});
const rows = [
  row(1, localISO(), 12.5, "food", "Lunch"),
  row(2, localISO(), 40, "transport", "Gas"),
  row(3, monthsAgo(1), 300, "food", "Groceries"),
  row(4, monthsAgo(2), 300, "food", "Groceries"),
  row(5, monthsAgo(3), 300, "food", "Groceries"),
  row(6, monthsAgo(1, 3), 15.99, "entertainment", "Netflix"),
  row(7, monthsAgo(2, 3), 15.99, "entertainment", "Netflix"),
  row(8, localISO(), 15.99, "entertainment", "Netflix"),
];
const month = localISO().slice(0, 7);

async function scan(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = serious.map((v) => `${label} ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help} | e.g. ${v.nodes[0]?.target?.join(" ")}`);
  expect(serious.length, report.join("\n")).toBe(0);
}

for (const theme of ["light", "dark"]) {
  for (const phone of [false, true]) {
    test(`Expenses with data and dialogs has no serious accessibility problems (${theme}${phone ? ", phone" : ""})`, async ({
      mockedPage: page,
    }) => {
      test.setTimeout(120000);
      if (phone) await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await mockBackend(page, { dashboard: populatedDashboard, holdings: [sampleHolding] });
      await page.route(`${API_BASE}/budget/entries**`, (route) =>
        route.request().method() === "GET"
          ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) })
          : route.continue(),
      );
      await page.route(`${API_BASE}/budget/summary**`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            months: [{ month, income: 3000, expenses: 68.49, net: 2931 }],
            category_breakdown: [{ category: "food", amount: 12.5 }],
            limit_status: [{ category: "food", limit: 160, base_limit: 100, carried_over: 60, rollover: true, spent: 12.5, percent: 7.8 }],
            other_currency_entries: 0,
            latest_month: month,
          }),
        }),
      );
      await page.route(`${API_BASE}/budget/subscriptions**`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            currency: "USD",
            monthly_total: 15.99,
            items: [
              {
                category: "entertainment",
                description: "Netflix",
                amount: 15.99,
                frequency: "monthly",
                next_due: "2099-01-01",
                monthly_equivalent: 15.99,
              },
            ],
          }),
        }),
      );
      await page.route(`${API_BASE}/budget/limits**`, (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
      );

      await page.goto("/expenses");
      await expect(page.getByText("— Lunch")).toBeVisible();
      if (phone) await page.getByRole("button", { name: /show insights/i }).click();
      await page.waitForTimeout(500);
      await scan(page, "page");

      await page.getByRole("button", { name: "Select", exact: true }).click();
      await scan(page, "select mode");
      await page.getByRole("button", { name: "Done selecting" }).click();

      await page
        .getByRole("button", { name: /split food entry/i })
        .first()
        .click();
      await expect(page.getByRole("dialog", { name: "Split expense" })).toBeVisible();
      await scan(page, "split dialog");
      await page.keyboard.press("Escape");

      await page
        .getByRole("button", { name: /edit food entry/i })
        .first()
        .click();
      await expect(page.getByRole("dialog", { name: "Edit entry" })).toBeVisible();
      await scan(page, "edit dialog");
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle");

      await page.keyboard.press("e");
      await expect(page.getByRole("dialog", { name: "Add expense" })).toBeVisible();
      await scan(page, "quick add");
    });
  }
}
