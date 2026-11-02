import AxeBuilder from "@axe-core/playwright";
import { test, expect, mockBackend, API_BASE, localISO } from "./fixtures";

type Cat = { id: number; name: string; parent: string | null };

const PRESETS = [
  "housing",
  "food",
  "transport",
  "utilities",
  "healthcare",
  "entertainment",
  "shopping",
  "education",
  "insurance",
  "other_expense",
];
const INCOME = ["paycheck", "bonus", "interest", "gift", "other_income"];

/** A small stateful stand-in for the categories API, so a whole add, rename, move, remove flow can run. */
async function mockCategories(page: any, custom: Cat[], calls: { method: string; url: string; body: any }[]) {
  let nextId = 100;
  await page.route(`${API_BASE}/budget/categories**`, async (route: any) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    const body = method === "GET" || method === "DELETE" ? null : req.postDataJSON();
    if (method !== "GET") calls.push({ method, url, body });
    const id = Number(url.match(/categories\/(\d+)/)?.[1]);
    if (method === "POST") {
      const created = { id: nextId++, name: body.name, parent: body.parent ?? null };
      custom.push(created);
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...created, entry_type: "expense" }) });
    }
    if (method === "PUT") {
      const row = custom.find((c) => c.id === id)!;
      const old = row.name;
      if ("name" in body) row.name = body.name;
      if ("parent" in body) row.parent = body.parent;
      for (const c of custom) if (c.parent === old) c.parent = row.name;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
    }
    if (method === "DELETE") {
      const at = custom.findIndex((c) => c.id === id);
      const [gone] = custom.splice(at, 1);
      for (const c of custom) if (c.parent === gone.name) c.parent = null;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Category deleted" }) });
    }
    const parents: Record<string, string> = {};
    for (const c of custom) if (c.parent) parents[c.name] = c.parent;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        income: INCOME,
        expense: [...PRESETS, ...custom.map((c) => c.name)],
        parents: { income: {}, expense: parents },
        custom: { income: [], expense: custom },
      }),
    });
  });
}

test("add, rename, move and remove categories and subcategories from the Expenses page", async ({ mockedPage: page }) => {
  await mockBackend(page);
  const custom: Cat[] = [];
  const calls: { method: string; url: string; body: any }[] = [];
  await mockCategories(page, custom, calls);

  await page.goto("/expenses");
  await page.getByRole("button", { name: "Manage categories" }).click();
  const list = page.getByRole("list", { name: "Expense categories" });
  await expect(list.getByText("Built in").first()).toBeVisible();

  // Add a category.
  await page.getByRole("button", { name: "+ Add category" }).click();
  await page.getByLabel("New category name").fill("Pets");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(list.getByText("Pets", { exact: true })).toBeVisible();
  await expect.poll(() => calls[calls.length - 1]?.body).toMatchObject({ entry_type: "expense", name: "Pets" });

  // Add a subcategory inside it.
  await page.getByRole("button", { name: "Add a subcategory inside Pets" }).click();
  await page.getByLabel("New subcategory name inside Pets").fill("Vet");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(list.getByText("↳ Vet")).toBeVisible();
  await expect.poll(() => calls[calls.length - 1]?.body).toMatchObject({ name: "Vet", parent: "Pets" });

  // Rename the category: its subcategory follows.
  await page.getByRole("button", { name: "Edit Pets" }).click();
  await page.getByLabel("Name for Pets").fill("Pet care");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(list.getByText("Pet care", { exact: true })).toBeVisible();
  await expect(list.getByText("↳ Vet")).toBeVisible();
  await expect.poll(() => calls[calls.length - 1]).toMatchObject({ method: "PUT", body: { name: "Pet care", parent: null } });

  // Move the subcategory under a built-in category.
  await page.getByRole("button", { name: "Edit Vet" }).click();
  await page.getByLabel("Put Vet inside").selectOption("healthcare");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => calls[calls.length - 1]?.body).toMatchObject({ parent: "healthcare" });
  await expect(list.getByRole("listitem").filter({ hasText: "↳ Vet" })).toBeVisible();

  // A category that holds subcategories stays at the top level.
  await page.getByRole("button", { name: "Edit Healthcare" }).count(); // built in: no edit button
  await expect(page.getByRole("button", { name: "Edit Healthcare" })).toHaveCount(0);

  // Remove with "move entries to".
  await page.getByRole("button", { name: "Remove Pet care" }).click();
  await page.getByLabel("Move its entries to").selectOption("other_expense");
  await page.getByRole("group", { name: "Remove Pet care" }).getByRole("button", { name: "Remove" }).click();
  await expect(list.getByText("Pet care", { exact: true })).toHaveCount(0);
  await expect.poll(() => calls[calls.length - 1]?.method).toBe("DELETE");
  await expect.poll(() => calls[calls.length - 1]?.url).toContain("move_to=other_expense");
});

test("the add form no longer creates categories and links to the manager", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await mockCategories(page, [], []);
  await page.goto("/expenses");
  await expect(page.getByRole("option", { name: "+ New category…" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Add, rename or remove categories/ })).toBeVisible();
  await page.getByRole("link", { name: /Add, rename or remove categories/ }).click();
  await expect(page.getByRole("button", { name: "Hide", exact: true })).toBeVisible();
});

test("quick add shows both the category and the subcategory", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await mockCategories(page, [{ id: 1, name: "Cellphone", parent: "utilities" }], []);
  await page.goto("/portfolio");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add expense (E)" }).click();
  const dialog = page.getByRole("dialog", { name: "Add expense" });
  await dialog.getByLabel("Category", { exact: true }).selectOption("utilities");
  const sub = dialog.getByLabel("Subcategory");
  await expect(sub).toBeEnabled();
  await sub.selectOption("Cellphone");
  await expect(sub).toHaveValue("Cellphone");
  await dialog.getByLabel("Category", { exact: true }).selectOption("food");
  await expect(sub).toBeDisabled();
});

const entry = {
  id: 7,
  user_id: "x",
  household_id: null,
  entry_type: "expense",
  entry_date: localISO(),
  amount: 12.5,
  currency: "USD",
  category: "food",
  description: "Lunch",
  is_private: false,
  is_recurring: false,
  recurring_frequency: null,
  linked_liability_id: null,
  charged_liability_id: null,
  funding_holding_id: null,
  deposit_target_holding_id: null,
  created_at: "2026-01-01T00:00:00Z",
};

test("every field of an existing entry can be changed, including its type", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await mockCategories(page, [{ id: 1, name: "Cellphone", parent: "utilities" }], []);
  let sent: any = null;
  await page.route(`${API_BASE}/budget/entries**`, (route) => {
    if (route.request().method() === "PUT") {
      sent = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...entry, ...sent }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([entry]) });
  });

  await page.goto("/expenses");
  await page.getByRole("button", { name: "Edit Food entry" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit entry" });

  // As an expense: new amount, currency, category and subcategory, note, date, repeat.
  await dialog.getByLabel("Amount").fill("30");
  await dialog.getByLabel("Currency").selectOption("INR");
  await dialog.getByLabel("Category", { exact: true }).selectOption("utilities");
  await dialog.getByLabel("Subcategory").selectOption("Cellphone");
  await dialog.getByLabel("Note").fill("Phone bill");
  await dialog.getByLabel("Date").fill(localISO());
  await dialog.getByLabel("Recurring (subscription, rent, bill, etc.)").check();
  await dialog.getByLabel("Repeat frequency").selectOption("quarterly");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect
    .poll(() => sent)
    .toMatchObject({
      entry_type: "expense",
      amount: 30,
      currency: "INR",
      category: "Cellphone",
      description: "Phone bill",
      is_recurring: true,
      recurring_frequency: "quarterly",
    });

  // Switching to income swaps the category list and clears the expense-only accounts.
  sent = null;
  await page
    .getByRole("button", { name: /Edit .* entry/ })
    .first()
    .click();
  const again = page.getByRole("dialog", { name: "Edit entry" });
  await again.getByRole("button", { name: "+ Income" }).click();
  await expect(again.getByLabel("Category", { exact: true }).locator("option", { hasText: "Paycheck" })).toHaveCount(1);
  await again.getByLabel("Category", { exact: true }).selectOption("gift");
  await again.getByRole("button", { name: "Save changes" }).click();
  await expect
    .poll(() => sent)
    .toMatchObject({ entry_type: "income", category: "gift", funding_source_holding_id: null, charge_liability_id: null });
});

test("the edit dialog and the category manager pass the accessibility scan", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await mockCategories(page, [{ id: 1, name: "Pets", parent: null }], []);
  await page.route(`${API_BASE}/budget/entries**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(route.request().method() === "GET" ? [entry] : entry),
    }),
  );
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Manage categories" }).click();
  await page.getByRole("button", { name: "Edit Pets" }).click();
  await page.getByRole("button", { name: "Cancel" }).first().click();
  let results = await new AxeBuilder({ page }).include("#manage-categories").analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

  await page.getByRole("button", { name: "Edit Food entry" }).click();
  await expect(page.getByRole("dialog", { name: "Edit entry" })).toBeVisible();
  results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test("the More menu opens above the cards on the page", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await page.goto("/");
  // A brand-new account sees the welcome steps first; skip them.
  await page.getByRole("button", { name: "Skip" }).click();
  await page.locator(".desktop-top-nav").getByRole("button", { name: /More/ }).click();
  const item = page.getByRole("link", { name: "Accounts" });
  await expect(item).toBeVisible();
  // The element on top at the middle of the last menu item must be the menu item itself, not a card.
  const onTop = await item.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top === el || el.contains(top);
  });
  expect(onTop).toBe(true);
});
