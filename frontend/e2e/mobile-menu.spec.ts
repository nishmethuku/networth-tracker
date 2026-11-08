import { test, expect, mockBackend } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test("the phone menu opens as a full-height drawer on the right, with Sign Out at the bottom", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await page.goto("/");
  // The welcome steps cover the page for a brand-new account.
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Open menu" }).click();

  const signOut = page.getByRole("button", { name: "Sign Out" });
  await expect(signOut).toBeVisible();
  const box = (await signOut.boundingBox())!;
  // Pinned to the bottom of the screen and to the right side, not floating over the page content.
  expect(box.y + box.height).toBeGreaterThan(700);
  expect(box.x).toBeGreaterThan(390 * 0.1);
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(signOut).toHaveCount(0);
});
