import { test, expect, mockBackend } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("picking a color scheme changes the app and is remembered", async ({ mockedPage: page }) => {
  await mockBackend(page);
  await page.goto("/settings");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-palette", "wine");
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());

  await page.getByRole("radio", { name: "Ocean" }).click();
  await expect(root).toHaveAttribute("data-palette", "ocean");
  await expect(page.getByRole("radio", { name: "Ocean" })).toHaveAttribute("aria-checked", "true");
  const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
  expect(after).not.toBe(before);

  await page.reload();
  await expect(root).toHaveAttribute("data-palette", "ocean");
});

for (const mode of ["light", "dark"] as const) {
  test(`every color scheme passes color contrast in ${mode} mode`, async ({ mockedPage: page }) => {
    await mockBackend(page);
    await page.addInitScript((m) => localStorage.setItem("theme", m), mode);
    await page.goto("/settings");
    for (const name of ["Wine", "Ocean", "Forest", "Violet", "Sunset", "Graphite"]) {
      await page.getByRole("radio", { name }).click();
      await page.waitForTimeout(350);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .options({ rules: { "color-contrast": { enabled: true } } })
        .analyze();
      const contrast = results.violations.filter((v) => v.id === "color-contrast");
      expect(contrast, `${name} ${mode}: ${JSON.stringify(contrast.map((v) => v.nodes.map((n) => n.target)))}`).toEqual([]);
    }
  });
}
