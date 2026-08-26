import { test, expect, mockBackend, sampleHolding } from "./fixtures";

const holdings = [
  { ...sampleHolding, id: 1, symbol: "AAPL", name: "Apple Inc", display_value: 1500, total_gain: 500 },
  { ...sampleHolding, id: 2, symbol: "MSFT", name: "Microsoft Corp", display_value: 3000, total_gain: -200 },
  { ...sampleHolding, id: 3, symbol: "GOOG", name: "Alphabet Inc", display_value: 800, total_gain: 100 },
];

test("clicking the Value column header sorts holdings, and toggles direction on repeat click", async ({ mockedPage: page }) => {
  await mockBackend(page, { holdings });
  await page.goto("/portfolio");

  const rows = () => page.locator("table tbody tr");
  await expect(rows()).toHaveCount(3);

  await page.getByRole("button", { name: /Sort by Value/ }).click();
  let names = await rows().locator("td:first-child > div:first-child").allTextContents();
  expect(names).toEqual(["MSFT", "AAPL", "GOOG"]); // descending by value: 3000, 1500, 800

  await page.getByRole("button", { name: /Sort by Value/ }).click();
  names = await rows().locator("td:first-child > div:first-child").allTextContents();
  expect(names).toEqual(["GOOG", "AAPL", "MSFT"]); // ascending

  // sort state should be in the URL
  expect(page.url()).toContain("sort=value");
  expect(page.url()).toContain("dir=asc");
});

test("the filter input narrows holdings by name/ticker, debounced", async ({ mockedPage: page }) => {
  await mockBackend(page, { holdings });
  await page.goto("/portfolio");

  const filterInput = page.getByPlaceholder("Filter by name, ticker, or account...");
  await filterInput.fill("MSFT");
  await expect(page.locator("table tbody tr")).toHaveCount(1, { timeout: 2000 });
  await expect(page.getByText("MSFT", { exact: true })).toBeVisible();
  await expect(page.getByText("AAPL", { exact: true })).not.toBeVisible();

  await filterInput.fill("nonexistent-ticker-xyz");
  await expect(page.getByText(/No holdings match/)).toBeVisible({ timeout: 2000 });
});

test("the delete button is hidden until the row is hovered", async ({ mockedPage: page }) => {
  await mockBackend(page, { holdings });
  await page.goto("/portfolio");

  const firstDeleteBtn = page.locator("table tbody tr").first().getByRole("button", { name: "Delete" });
  await expect(firstDeleteBtn).toHaveCSS("opacity", "0");
  await page.locator("table tbody tr").first().hover();
  await expect(firstDeleteBtn).toHaveCSS("opacity", "1");
});
