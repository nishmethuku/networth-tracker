import { test, expect, mockBackend, populatedDashboard, sampleHolding } from "./fixtures";

const cash = (id: number, name: string, account: string) => ({
  ...sampleHolding,
  id,
  asset_type: "cash",
  symbol: null,
  name,
  account,
  quantity: null,
});

test("the Cash & Bank section says how many accounts there are, and how many in each bank", async ({ mockedPage: page }) => {
  await mockBackend(page, {
    dashboard: populatedDashboard,
    holdings: [
      sampleHolding,
      cash(11, "Checking", "Chase"),
      cash(12, "Savings", "Chase"),
      cash(13, "Everyday", "Ally"),
      cash(14, "Joint", "Ally"),
    ],
  });
  await page.goto("/portfolio");
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const bar = page.getByTestId("count-cash");
  await expect(bar).toContainText("Accounts 4");
  await expect(page.getByText("Ally: 2 · Chase: 2")).toBeVisible();
  await expect(page.getByTestId("count-stock")).toContainText("Holdings 1");
});
