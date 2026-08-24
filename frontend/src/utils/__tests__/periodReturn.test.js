import { describe, it, expect } from "vitest";
import { computePeriodReturn, RETURN_RANGES } from "../periodReturn";

const NOW = new Date("2026-06-15");
const rangeIndexOf = (label) => RETURN_RANGES.findIndex((r) => r.label === label);

describe("computePeriodReturn", () => {
  it("returns null with fewer than two points", () => {
    expect(computePeriodReturn([{ date: "2026-01-01", value: 100 }], 0, NOW)).toBeNull();
    expect(computePeriodReturn([], 0, NOW)).toBeNull();
    expect(computePeriodReturn(null, 0, NOW)).toBeNull();
  });

  it("computes % change from the start to the end of the selected window", () => {
    const series = [
      { date: "2026-05-01", value: 100 },
      { date: "2026-05-20", value: 110 },
      { date: "2026-06-15", value: 121 },
    ];
    // 1M window from 2026-05-16 to now -> starts at the 05-20 point (110), ends at 121
    const result = computePeriodReturn(series, rangeIndexOf("1M"), NOW);
    expect(result.start).toBe(110);
    expect(result.end).toBe(121);
    expect(result.pct).toBeCloseTo(10);
  });

  it("falls back to the last two points when the window has fewer than two", () => {
    const series = [
      { date: "2020-01-01", value: 50 },
      { date: "2026-06-14", value: 100 },
      { date: "2026-06-15", value: 105 },
    ];
    // 1W window only actually contains the last point, so it falls back to the last two
    const result = computePeriodReturn(series, rangeIndexOf("1W"), NOW);
    expect(result.start).toBe(100);
    expect(result.end).toBe(105);
    expect(result.pct).toBeCloseTo(5);
  });

  it("handles YTD by filtering to on/after Jan 1 of the current year", () => {
    const series = [
      { date: "2025-12-01", value: 90 },
      { date: "2026-01-01", value: 100 },
      { date: "2026-06-15", value: 120 },
    ];
    const result = computePeriodReturn(series, rangeIndexOf("YTD"), NOW);
    expect(result.start).toBe(100);
    expect(result.pct).toBeCloseTo(20);
  });

  it("computes a negative % correctly for a loss", () => {
    const series = [
      { date: "2026-05-15", value: 200 },
      { date: "2026-06-15", value: 150 },
    ];
    const result = computePeriodReturn(series, rangeIndexOf("1M"), NOW);
    expect(result.pct).toBeCloseTo(-25);
  });

  it("uses the full series for the All range", () => {
    const series = [
      { date: "2020-01-01", value: 10 },
      { date: "2026-06-15", value: 40 },
    ];
    const result = computePeriodReturn(series, rangeIndexOf("All"), NOW);
    expect(result.start).toBe(10);
    expect(result.pct).toBeCloseTo(300);
  });

  it("returns null pct rather than dividing by zero when the start value is zero", () => {
    const series = [
      { date: "2026-06-01", value: 0 },
      { date: "2026-06-15", value: 50 },
    ];
    const result = computePeriodReturn(series, rangeIndexOf("1M"), NOW);
    expect(result.pct).toBeNull();
  });
});
