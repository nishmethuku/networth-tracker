import { describe, it, expect } from "vitest";
import { describeRebuild, previewSamples } from "../RebuildHistory";

describe("describeRebuild", () => {
  it("explains the liabilities limit", () => {
    expect(describeRebuild({ status: "has_liabilities" })).toMatch(/no liabilities/);
  });
  it("says what a preview found, with correct plurals", () => {
    expect(describeRebuild({ status: "preview", months: [{ date: "2026-02-01", total: 1 }] })).toBe(
      "Found 1 past month starting 2026-02-01.",
    );
    expect(
      describeRebuild({
        status: "preview",
        months: [
          { date: "2026-02-01", total: 1 },
          { date: "2026-03-01", total: 2 },
        ],
        skipped: [{ date: "2026-01-01", reasons: ["x"] }],
      }),
    ).toBe("Found 2 past months starting 2026-02-01 (1 skipped because a price was missing).");
  });
  it("handles a preview that found nothing", () => {
    expect(describeRebuild({ status: "preview", months: [] })).toMatch(/nothing was found/);
  });
  it("tells you to try again when time ran out before any month was priced", () => {
    expect(describeRebuild({ status: "preview", months: [], more_to_do: true })).toMatch(/again/);
  });
  it("handles up to date and nothing recorded", () => {
    expect(describeRebuild({ status: "up_to_date" })).toMatch(/already has a point/);
    expect(describeRebuild({ status: "nothing_recorded" })).toMatch(/Add a holding/);
  });
});

describe("previewSamples", () => {
  const month = (d) => ({ date: d, total: 1 });
  it("returns nothing for no months", () => {
    expect(previewSamples([])).toEqual([]);
    expect(previewSamples(undefined)).toEqual([]);
  });
  it("returns the first, middle and last month, without repeats", () => {
    const months = ["a", "b", "c", "d", "e"].map(month);
    expect(previewSamples(months).map((m) => m.date)).toEqual(["a", "c", "e"]);
    expect(previewSamples([month("a")]).map((m) => m.date)).toEqual(["a"]);
    expect(previewSamples([month("a"), month("b")]).map((m) => m.date)).toEqual(["a", "b"]);
  });
});
