import { test, expect, mockBackend, API_BASE } from "./fixtures";

test.describe("Liabilities", () => {
  test("shows an empty state, then adding a liability posts the right payload and renders it", async ({ mockedPage: page }) => {
    let createdBody: unknown = null;
    const createdLiability = {
      id: 1,
      user_id: "00000000-0000-4000-8000-000000000001",
      household_id: null,
      name: "Home mortgage",
      liability_type: "mortgage",
      currency: "USD",
      current_balance: 250000,
      original_amount: 300000,
      interest_rate: 6.5,
      notes: null,
      is_private: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    await page.route(`${API_BASE}/liabilities**`, async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        createdBody = req.postDataJSON();
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(createdLiability) });
      }
      if (req.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(createdBody ? [createdLiability] : []),
        });
      }
      return route.continue();
    });

    await page.goto("/liabilities");
    await expect(page.getByText(/no liabilities tracked yet/i)).toBeVisible();

    await page.getByRole("button", { name: "+ Add Liability" }).click();
    await page.getByLabel("Name").fill("Home mortgage");
    await page.getByLabel("Current balance").fill("250000");
    await page.getByLabel("Original amount (optional)").fill("300000");
    await page.getByLabel("Interest rate % (optional)").fill("6.5");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect.poll(() => createdBody).not.toBeNull();
    expect(createdBody).toMatchObject({
      name: "Home mortgage",
      liability_type: "mortgage",
      current_balance: 250000,
      original_amount: 300000,
      interest_rate: 6.5,
    });

    await expect(page.getByText("Home mortgage", { exact: true })).toBeVisible();
  });

  test("the payoff calculator computes months-to-payoff for an existing liability", async ({ mockedPage: page }) => {
    await mockBackend(page);
    await page.route(`${API_BASE}/liabilities**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            user_id: "x",
            household_id: null,
            name: "Personal loan",
            liability_type: "personal_loan",
            currency: "USD",
            current_balance: 1200,
            original_amount: null,
            interest_rate: 0,
            notes: null,
            is_private: false,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]),
      }),
    );

    await page.goto("/liabilities");
    await expect(page.getByText("Personal loan", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Payoff calculator" }).click();
    const paymentInput = page.locator('input[type="number"]').first();
    await paymentInput.fill("100");

    // $1200 balance / $100/mo at 0% interest = exactly 12 months.
    await expect(page.getByText(/paid off in\s*12\s*months?/i)).toBeVisible();
  });
});
