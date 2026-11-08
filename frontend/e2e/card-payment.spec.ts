import { test, expect, mockBackend, API_BASE, sampleHolding } from "./fixtures";

const card = {
  id: 5,
  user_id: sampleHolding.user_id,
  household_id: null,
  name: "Visa",
  liability_type: "credit_card",
  currency: "USD",
  current_balance: 800,
  original_amount: null,
  interest_rate: 20,
  notes: null,
  is_private: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const savings = { ...sampleHolding, id: 9, asset_type: "cash", symbol: null, name: "Savings", account: "Chase", quantity: null };

test("paying a card bill takes the money out of the savings account unless told otherwise", async ({ mockedPage: page }) => {
  await mockBackend(page);
  let paid: any = null;
  await page.route(`${API_BASE}/liabilities**`, (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.url().includes("/payments")) {
      paid = req.postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          liability: { ...card, current_balance: 700 },
          funding_source: { holding_id: 9, value: 4900, currency: "USD" },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([card]) });
  });
  await page.route(`${API_BASE}/holdings**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([savings]) }),
  );

  await page.goto("/liabilities");
  await page.getByRole("button", { name: "Record payment" }).click();
  // The only cash account is already chosen, so the money comes out of it.
  await expect(page.getByLabel("Paid from")).toHaveValue("9");
  await page.locator("#pay-5-amount").fill("100");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect.poll(() => paid).toMatchObject({ amount: 100, funding_source_holding_id: 9 });
  await expect(page.getByText(/account you paid from is now/)).toBeVisible();
});

test("with several cash accounts the payment cannot be saved until one is chosen", async ({ mockedPage: page }) => {
  await mockBackend(page);
  let paid: any = null;
  const checking = { ...savings, id: 8, name: "Checking" };
  await page.route(`${API_BASE}/liabilities**`, (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.url().includes("/payments")) {
      paid = req.postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          liability: { ...card, current_balance: 700 },
          funding_source: { holding_id: 9, value: 4900, currency: "USD" },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([card]) });
  });
  await page.route(`${API_BASE}/holdings**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([checking, savings]) }),
  );

  await page.goto("/liabilities");
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.locator("#pay-5-amount").fill("100");
  await expect(page.getByLabel("Paid from")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save payment" })).toBeDisabled();
  await page.getByLabel("Paid from").selectOption("9");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect.poll(() => paid).toMatchObject({ amount: 100, funding_source_holding_id: 9 });
});
