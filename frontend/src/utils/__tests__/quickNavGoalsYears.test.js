import { describe, it, expect } from "vitest";
import { matchPages } from "../quickNav";
import { requiredMonthly } from "../requiredMonthly";
import { yearlySummary } from "../yearlySummary";

describe("matchPages", () => {
  it("ranks exact and prefix title matches first", () => {
    expect(matchPages("budget")[0].to).toBe("/budget");
    expect(matchPages("port")[0].to).toBe("/portfolio");
    expect(matchPages("year")[0].to).toBe("/review");
  });
  it("matches keywords", () => {
    expect(matchPages("mortgage")[0].to).toBe("/liabilities");
    expect(matchPages("backup")[0].to).toBe("/settings");
  });
  it("is empty for blank, unknown, or sentence-length queries", () => {
    expect(matchPages("")).toEqual([]);
    expect(matchPages("zzzzqq")).toEqual([]);
    expect(matchPages("show me all my crypto holdings that are up")).toEqual([]);
  });
});

describe("requiredMonthly", () => {
  it("is zero-rate simple division", () => {
    // 12 months, 0% growth, 1200 to go => 100 a month
    expect(requiredMonthly(0, 1200, "2027-10-22", "2026-10-22", 0)).toBeCloseTo(100, 0);
  });
  it("needs less with growth", () => {
    const flat = requiredMonthly(5000, 20000, "2028-10-22", "2026-10-22", 0);
    const grown = requiredMonthly(5000, 20000, "2028-10-22", "2026-10-22", 6);
    expect(grown).toBeLessThan(flat);
  });
  it("is zero when growth alone reaches it, null for past dates or bad input", () => {
    expect(requiredMonthly(10000, 10100, "2027-10-22", "2026-10-22", 5)).toBe(0);
    expect(requiredMonthly(1, 2, "2026-01-01", "2026-10-22")).toBeNull();
    expect(requiredMonthly(NaN, 2, "2027-01-01", "2026-10-22")).toBeNull();
  });
});

describe("yearlySummary", () => {
  const h = [
    { date: "2024-06-01", netWorth: 100 },
    { date: "2024-12-31", netWorth: 200 },
    { date: "2025-12-31", netWorth: 300 },
    { date: "2026-10-01", netWorth: 450 },
  ];
  it("lists year ends newest first with yearly changes", () => {
    const r = yearlySummary(h, 2026);
    expect(r.map((x) => x.year)).toEqual([2026, 2025, 2024]);
    expect(r[0]).toMatchObject({ endValue: 450, delta: 150, partial: true });
    expect(r[1].pct).toBeCloseTo(50);
    expect(r[2].delta).toBeNull();
  });
  it("is empty without history", () => {
    expect(yearlySummary([], 2026)).toEqual([]);
    expect(yearlySummary(null, 2026)).toEqual([]);
  });
});
