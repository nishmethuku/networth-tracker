import { test, expect } from "./fixtures";

test.describe("Help", () => {
  test("shows plain answers to common questions", async ({ mockedPage: page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();
    await page.getByText("How do I add gold or silver?").click();
    await expect(page.getByText(/not priced live/i)).toBeVisible();
  });
});
