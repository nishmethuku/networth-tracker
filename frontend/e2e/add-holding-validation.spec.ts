import { test, expect } from "./fixtures";

test("Add Holding: a field shows a green checkmark once valid and touched, red error once invalid and touched", async ({
  mockedPage: page,
}) => {
  await page.goto("/add-holding");
  await page.locator("#holding-asset-type").selectOption("cash");

  const nameField = page.locator("#holding-name");
  await nameField.fill("My House");
  await nameField.blur();
  await expect(page.getByText("✓ Looks good").first()).toBeVisible();

  // clearing the now-touched, required Name field back to empty should
  // flip the checkmark to a red validation error instead
  await nameField.fill("");
  await nameField.blur();
  await expect(page.getByText("Name is required")).toBeVisible();
});
