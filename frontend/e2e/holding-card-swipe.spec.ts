import { test, expect, mockBackend, populatedDashboard, sampleHolding } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test("holding cards on a phone are not tinted by the hidden Delete layer", async ({ mockedPage: page }) => {
  await mockBackend(page, { dashboard: populatedDashboard, holdings: [sampleHolding] });
  await page.goto("/portfolio");
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const layer = page.locator('[aria-hidden="true"]', { hasText: "Delete" }).first();
  await expect(layer).toBeAttached();
  await expect(layer).toHaveCSS("opacity", "0");
});
