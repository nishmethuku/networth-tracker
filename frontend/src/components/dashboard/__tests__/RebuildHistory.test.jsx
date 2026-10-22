import { describe, it, expect } from "vitest";
import { describeRebuild } from "../RebuildHistory";

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
  it("handles up to date and nothing recorded", () => {
    expect(describeRebuild({ status: "up_to_date" })).toMatch(/already has a point/);
    expect(describeRebuild({ status: "nothing_recorded" })).toMatch(/Add a holding/);
  });
});
