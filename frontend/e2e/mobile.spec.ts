import { type Page } from "@playwright/test";
import { test, expect, mockBackend, populatedDashboard, sampleHolding } from "./fixtures";

/**
 * A grid with a hard minmax() floor (e.g. minmax(400px, 1fr)) doesn't
 * shrink below that floor even in a single-column layout — it overflows
 * instead, which no jsdom-based unit test can catch (jsdom doesn't lay
 * out CSS at all). This is exactly the class of bug fixed earlier this
 * session by switching those grids to `isMobile ? "1fr" : ...`, verified
 * at the time only by reading the code, never in an actual narrow
 * viewport. These tests close that gap for real.
 *
 * Checking document.documentElement.scrollWidth (the usual "is there
 * horizontal overflow" check) turned out not to catch this case here,
 * confirmed by deliberately reintroducing the bug and watching the
 * assertion still pass: the overflow shows up on document.body.scrollWidth
 * but gets silently clipped before it reaches documentElement, with no
 * explicit `overflow` CSS rule anywhere responsible for it (a multi-level
 * nested flex/grid quirk, not a deliberate design). That's arguably worse
 * than a scrollbar -- content silently cut off with no way to reach it --
 * and it's exactly the kind of thing that makes "check scrollWidth" an
 * unreliable general-purpose test. Checking every element's own
 * bounding box against the viewport catches it directly regardless of
 * which ancestor does or doesn't propagate the overflow.
 */
async function expectNoElementOverflowsViewport(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport set");
  const overflowing = await page.evaluate((viewportWidth) => {
    const found: { tag: string; className: string; right: number }[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      // A couple of px of slop for scrollbar-gutter/subpixel rounding --
      // this is about catching real overflow (tens/hundreds of px), not
      // hunting for 1px rounding artifacts.
      if (rect.width > 0 && rect.right > viewportWidth + 2) {
        found.push({ tag: el.tagName, className: (el as HTMLElement).className?.toString().slice(0, 60) ?? "", right: rect.right });
      }
    }
    return found;
  }, viewport.width);
  expect(overflowing, `Elements extending past the ${viewport.width}px viewport: ${JSON.stringify(overflowing.slice(0, 5))}`).toEqual([]);
}

test.describe("Mobile layout", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("Dashboard has no horizontal overflow on a narrow viewport", async ({ mockedPage: page }) => {
    await mockBackend(page, { dashboard: populatedDashboard, holdings: [sampleHolding] });
    await page.goto("/");
    await expect(page.getByText("Total Net Worth")).toBeVisible();

    await expectNoElementOverflowsViewport(page);
  });

  test("What-If has no horizontal overflow on a narrow viewport", async ({ mockedPage: page }) => {
    await mockBackend(page, { dashboard: populatedDashboard, holdings: [sampleHolding] });
    await page.goto("/what-if");
    await expect(page.getByText("Assumptions")).toBeVisible();

    await expectNoElementOverflowsViewport(page);
  });

  test("Liabilities has no horizontal overflow on a narrow viewport", async ({ mockedPage: page }) => {
    await page.goto("/liabilities");
    await expect(page.getByText(/no liabilities tracked yet/i)).toBeVisible();

    await expectNoElementOverflowsViewport(page);
  });
});
