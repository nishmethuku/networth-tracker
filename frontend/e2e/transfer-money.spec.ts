import { test, expect, mockBackend, API_BASE, sampleHolding } from "./fixtures";

const checking = { ...sampleHolding, id: 8, asset_type: "cash", symbol: null, name: "Checking", account: "Chase", quantity: null };
const savings = { ...sampleHolding, id: 9, asset_type: "cash", symbol: null, name: "Savings", account: "Chase", quantity: null };

test("moving money between two cash accounts sends one transfer and lists it with an undo", async ({ mockedPage: page }) => {
  await mockBackend(page);
  let sent: any = null;
  let undone = false;
  const record = { id: 3, from_holding_id: 8, to_holding_id: 9, from_name: "Checking", to_name: "Savings", amount: 75, currency: "USD", transfer_date: "2026-11-01", note: null };
  await page.route(`${API_BASE}/holdings**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([checking, savings]) }),
  );
  await page.route(`${API_BASE}/transfers**`, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      sent = req.postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ transfer: record }) });
    }
    if (req.method() === "DELETE") {
      undone = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Transfer undone" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sent ? [record] : []) });
  });

  await page.goto("/accounts");
  await page.getByRole("button", { name: "Record transfer" }).click();
  await expect(page.getByRole("alert")).toContainText("Pick the account");
  await page.getByLabel("From account").selectOption("8");
  await page.getByLabel("To account").selectOption("8");
  await page.getByRole("spinbutton", { name: "Amount" }).fill("75");
  await page.getByRole("button", { name: "Record transfer" }).click();
  await expect(page.getByRole("alert")).toContainText("two different accounts");
  await page.getByLabel("To account").selectOption("9");
  await page.getByRole("button", { name: "Record transfer" }).click();
  await expect.poll(() => sent).toMatchObject({ from_holding_id: "8", to_holding_id: "9", amount: 75 });
  await expect(page.getByText("Checking to Savings")).toBeVisible();

  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Undo transfer from Checking to Savings/ }).click();
  await expect.poll(() => undone).toBe(true);
});
