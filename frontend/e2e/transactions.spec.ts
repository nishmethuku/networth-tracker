import { test, expect, mockBackend, API_BASE, FAKE_USER_ID } from "./fixtures";

/**
 * Regression check for a real bug found this session: the transaction-type
 * color logic in a couple of places (HoldingDetail.jsx, Transactions.jsx,
 * ImportTransactions.jsx) was still `buy ? success : danger` -- correct
 * back when buy/sell were the only two transaction types, but wrong once
 * dividend/interest shipped, since neither is "buy" so both rendered in
 * the danger (red) color as if they were a loss. Fixed to `sell ? danger
 * : success` everywhere, matching the already-correct logic in
 * VirtualTransactionList.jsx/TransactionCard.jsx.
 */
test("a dividend transaction renders in the success color, not danger, on the Transactions page", async ({ mockedPage: page }) => {
  const dividendTx = {
    id: 1,
    holding_id: 1,
    user_id: FAKE_USER_ID,
    holding_name: "Apple Inc",
    holding_symbol: "AAPL",
    asset_type: "stock",
    country: "United States",
    transaction_type: "dividend",
    transaction_date: "2026-01-01",
    quantity: 1,
    price_per_unit: 25.0,
    currency: "USD",
    fees: 0,
    notes: null,
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
  };

  await page.route(`${API_BASE}/transactions**`, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([dividendTx]) });
    return route.continue();
  });

  await page.goto("/transactions");
  const typeCell = page.getByText("dividend", { exact: true });
  await expect(typeCell).toBeVisible();

  const { cellColor, dangerColor, successColor } = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.appendChild(probe);
    probe.style.color = "var(--danger)";
    const danger = getComputedStyle(probe).color;
    probe.style.color = "var(--success)";
    const success = getComputedStyle(probe).color;
    probe.remove();
    const cell = [...document.querySelectorAll("td")].find((el) => el.textContent?.trim() === "dividend");
    return { cellColor: cell ? getComputedStyle(cell).color : null, dangerColor: danger, successColor: success };
  });

  // The direct regression check: a dividend must not render in the danger
  // (red, "this lost money") color -- it should match success (green).
  expect(cellColor).not.toBe(dangerColor);
  expect(cellColor).toBe(successColor);
});
