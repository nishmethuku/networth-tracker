import { test, expect, mockBackend, API_BASE, localISO } from "./fixtures";

test("subcategories group under their parent with a total and expand to show the parts", async ({ mockedPage: page }) => {
  await mockBackend(page);
  const month = localISO().slice(0, 7);
  await page.route(`${API_BASE}/budget/categories**`, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 9, name: "Cellphone", parent: req.postDataJSON().parent ?? null, entry_type: "expense" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        income: ["paycheck"],
        expense: ["housing", "utilities", "Cellphone"],
        parents: { income: {}, expense: { Cellphone: "utilities" } },
      }),
    });
  });
  await page.route(`${API_BASE}/budget/summary**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        months: [{ month, income: 5000, expenses: 1580, net: 3420 }],
        category_breakdown: [
          { category: "housing", amount: 1000 },
          { category: "utilities", amount: 400 },
          { category: "Cellphone", amount: 180, parent: "utilities" },
        ],
        limit_status: [],
        other_currency_entries: 0,
        latest_month: month,
      }),
    }),
  );

  await page.goto("/budget");
  // Utilities shows its total (400 + 180) with "400 + 180" beneath it, and is collapsed at first.
  await expect(page.getByText(/\$580.00/).first()).toBeVisible();
  await expect(page.getByText(/\$400.00 USD \+ \$180.00 USD/)).toBeVisible();
  const toggle = page.getByRole("button", { name: /utilities/i });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const part = page.getByRole("listitem").filter({ hasText: /^Cellphone/ });
  await expect(part).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(part).toContainText("$180.00");

  // The add form on the Expenses page shows the category and its subcategory as two dropdowns.
  await page.goto("/expenses");
  await page.locator("#budget-category").selectOption("utilities");
  await expect(page.locator("#budget-subcategory option", { hasText: "Cellphone" })).toHaveCount(1);
  await expect(page.locator("#budget-subcategory")).toBeEnabled();
  await page.locator("#budget-category").selectOption("housing");
  await expect(page.locator("#budget-subcategory")).toBeDisabled();
});
