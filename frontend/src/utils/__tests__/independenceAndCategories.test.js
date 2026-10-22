import { describe, it, expect } from "vitest";
import { financialIndependence } from "../financialIndependence";
import { topCategories } from "../spendingCategories";
import { historyToCsv } from "../historyCsv";

const months = [
  { month: "2026-07", expenses: 3000 },
  { month: "2026-08", expenses: 5000 },
  { month: "2026-09", expenses: 4000 },
  { month: "2026-10", expenses: 500 },
];

describe("financialIndependence", () => {
  it("uses 25x yearly spending from complete months only", () => {
    const r = financialIndependence(months, "2026-10", 120000, 1000);
    expect(r.monthlySpending).toBe(4000);
    expect(r.target).toBe(4000 * 12 * 25);
    expect(r.progressPct).toBeCloseTo(10);
  });
  it("falls back to the month in progress when it is the only one", () => {
    const r = financialIndependence([{ month: "2026-10", expenses: 2000 }], "2026-10", 0, 500);
    expect(r.monthlySpending).toBe(2000);
  });
  it("returns null with no spending", () => {
    expect(financialIndependence([], "2026-10", 1000, 100)).toBeNull();
    expect(financialIndependence(null, "2026-10", 1000, 100)).toBeNull();
    expect(financialIndependence([{ month: "2026-09", expenses: 0 }], "2026-10", 1000, 100)).toBeNull();
  });
  it("reports zero years when already past the target and caps progress at 100", () => {
    const r = financialIndependence(months, "2026-10", 2_000_000, 0);
    expect(r.yearsToGo).toBe(0);
    expect(r.progressPct).toBe(100);
  });
  it("gives null years when the target cannot be reached", () => {
    const r = financialIndependence(months, "2026-10", 0, 0);
    expect(r.yearsToGo).toBeNull();
  });
  it("counts whole years with saving and growth", () => {
    const r = financialIndependence([{ month: "2026-09", expenses: 1000 }], "2026-10", 0, 2000, 0);
    // target 300000 at 2000/month with no growth is 150 months = 13 years
    expect(r.yearsToGo).toBe(13);
  });
  it("treats negative net worth as zero progress", () => {
    const r = financialIndependence(months, "2026-10", -500, 0);
    expect(r.progressPct).toBe(0);
  });
});

describe("topCategories", () => {
  it("sorts, computes shares, and rolls extras into other", () => {
    const rows = [
      { category: "a", amount: 10 },
      { category: "b", amount: 50 },
      { category: "c", amount: 20 },
      { category: "d", amount: 15 },
      { category: "e", amount: 4 },
      { category: "f", amount: 1 },
    ];
    const out = topCategories(rows, 3);
    expect(out.map((r) => r.category)).toEqual(["b", "c", "d", "other"]);
    expect(out[3].amount).toBe(15);
    expect(out.reduce((s, r) => s + r.sharePct, 0)).toBeCloseTo(100);
  });
  it("ignores zero, negative and missing rows", () => {
    expect(
      topCategories([
        { category: "x", amount: 0 },
        { category: "y", amount: -3 },
      ]),
    ).toEqual([]);
    expect(topCategories(null)).toEqual([]);
    expect(topCategories(undefined)).toEqual([]);
  });
  it("does not add an other row when everything fits", () => {
    expect(topCategories([{ category: "a", amount: 5 }]).map((r) => r.category)).toEqual(["a"]);
  });
});

describe("historyToCsv", () => {
  it("writes a header and rows oldest first", () => {
    const csv = historyToCsv(
      [
        { date: "2026-02-01", netWorth: 200.126 },
        { date: "2026-01-01", netWorth: 100 },
      ],
      "USD",
    );
    expect(csv).toBe("date,net_worth,currency\n2026-01-01,100,USD\n2026-02-01,200.13,USD\n");
  });
  it("gives only a header for empty history", () => {
    expect(historyToCsv([], "USD")).toBe("date,net_worth,currency\n");
    expect(historyToCsv(null, "USD")).toBe("date,net_worth,currency\n");
  });
  it("quotes commas and defuses formulas in the currency cell", () => {
    expect(historyToCsv([{ date: "2026-01-01", netWorth: 1 }], "A,B")).toContain('"A,B"');
    expect(historyToCsv([{ date: "2026-01-01", netWorth: 1 }], "=CMD")).toContain("'=CMD");
  });
  it("keeps negative numbers as numbers", () => {
    expect(historyToCsv([{ date: "2026-01-01", netWorth: -50 }], "USD")).toContain(",-50,");
  });
});
