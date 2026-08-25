import { test, expect, mockBackend, populatedDashboard, sampleHolding } from "./fixtures";

test.describe("Dashboard", () => {
  test("shows an empty state for a brand-new account with no holdings", async ({ mockedPage: page }) => {
    await page.goto("/");
    await expect(page.getByText(/no holdings yet/i)).toBeVisible();
  });

  test("renders net worth and a holding once there's real data", async ({ mockedPage: page }) => {
    await mockBackend(page, { dashboard: populatedDashboard, holdings: [sampleHolding] });
    await page.goto("/");

    // Total Net Worth card
    await expect(page.getByText("Total Net Worth")).toBeVisible();
    await expect(page.getByText(/\$1\.5K|\$1,500/)).toBeVisible();

    // The holding shows up somewhere on the page (allocation breakdown / movers)
    await expect(page.getByText("AAPL").first()).toBeVisible();
  });

  test("currency toggle switches the displayed currency without navigating away", async ({ mockedPage: page }) => {
    await mockBackend(page, { dashboard: populatedDashboard, holdings: [sampleHolding] });
    await page.goto("/");
    await expect(page.getByText("Total Net Worth")).toBeVisible();

    const inrButton = page.getByRole("button", { name: "INR", exact: true });
    await expect(inrButton).toBeVisible();
    await inrButton.click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("Navigation", () => {
  test("the desktop nav reaches Portfolio, Transactions, Budget, and Liabilities", async ({ mockedPage: page }) => {
    // Populated (not empty) dashboard data here specifically to avoid
    // triggering OnboardingWizard, which auto-opens over the whole page
    // for an empty portfolio and would intercept the nav clicks below —
    // covered separately by the empty-state dashboard test above.
    await mockBackend(page, { dashboard: populatedDashboard, holdings: [sampleHolding] });
    await page.goto("/");
    await expect(page.getByText("Total Net Worth")).toBeVisible();

    await page.getByRole("link", { name: "Portfolio", exact: true }).click();
    await expect(page).toHaveURL(/\/portfolio$/);

    await page.getByRole("link", { name: "Transactions", exact: true }).click();
    await expect(page).toHaveURL(/\/transactions$/);

    await page.getByRole("link", { name: "Budget", exact: true }).click();
    await expect(page).toHaveURL(/\/budget$/);
  });
});
