import { test, expect, API_BASE } from "./fixtures";

test("a loan can be set to update itself each month and shows its schedule", async ({ mockedPage: page }) => {
  let createdBody: Record<string, unknown> | null = null;
  const loan = {
    id: 7,
    user_id: "00000000-0000-4000-8000-000000000001",
    household_id: null,
    name: "Car loan",
    liability_type: "auto_loan",
    currency: "USD",
    current_balance: 10000,
    original_amount: null,
    interest_rate: 6,
    monthly_payment: 193.33,
    payment_due_date: null,
    auto_update: true,
    remaining_months: 60,
    next_auto_date: "2026-12-08",
    notes: null,
    is_private: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  await page.route(`${API_BASE}/liabilities/7/schedule`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        monthly_payment: 193.33,
        total_interest: 1599.8,
        total_paid: 11599.8,
        rows: [
          { month: 1, date: "2026-12-08", interest: 50, principal: 143.33, payment: 193.33, balance: 9856.67 },
          { month: 2, date: "2027-01-08", interest: 49.28, principal: 144.05, payment: 193.33, balance: 9712.62 },
        ],
      }),
    }),
  );
  await page.route(new RegExp(`${API_BASE}/liabilities(\\?.*)?$`), async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      createdBody = req.postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(loan) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(createdBody ? [loan] : []) });
  });

  await page.goto("/liabilities");
  await page.getByRole("button", { name: "+ Add Liability" }).click();
  await page.getByLabel("Name").fill("Car loan");
  await page.getByLabel("Current balance").fill("10000");
  await page.getByLabel("Interest rate % (optional)").fill("6");
  await page.getByLabel("Remaining months (optional)").fill("60");
  await page.getByLabel("Update the balance automatically each month").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect.poll(() => createdBody).not.toBeNull();
  expect(createdBody).toMatchObject({ auto_update: true, remaining_months: 60, interest_rate: 6 });

  await expect(page.getByText(/Updates automatically · next on 2026-12-08/)).toBeVisible();
  await page.getByRole("button", { name: "Payment schedule" }).click();
  await expect(page.getByText(/total interest/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "$9,856.67" })).toBeVisible();
});
