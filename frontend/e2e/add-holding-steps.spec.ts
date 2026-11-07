import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

test("Add Holding goes in three steps with progress, Back, and a check before moving on", async ({ mockedPage: page }) => {
  await page.goto("/add-holding");
  const progress = page.getByRole("list", { name: "Progress" });
  await expect(progress.getByRole("listitem").filter({ hasText: "Type" })).toHaveAttribute("aria-current", "step");

  // Step 1 shows only the type questions.
  await expect(page.locator("#holding-asset-type")).toBeVisible();
  await expect(page.locator("#holding-date")).toBeHidden();
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Holding" })).toHaveCount(0);

  // Step 1 cannot be skipped without a country.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator("#holding-date")).toBeHidden();
  await page.locator("#holding-asset-type").selectOption("cash");
  await page.locator("#holding-country").selectOption("United States");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2: it cannot be skipped while a required field is empty.
  await expect(progress.getByRole("listitem").filter({ hasText: "Details" })).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Name is required")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Holding" })).toHaveCount(0);

  await page.locator("#holding-name").fill("Emergency fund");
  await page.locator("#holding-value").fill("5000");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3 has the finish button, and Back keeps what was typed.
  await expect(page.getByRole("button", { name: "Add Holding" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.locator("#holding-name")).toHaveValue("Emergency fund");

  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(scan.violations).toEqual([]);
});
