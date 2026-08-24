import { describe, it, expect } from "vitest";
import { projectNetWorth } from "../whatIfProjection";

describe("projectNetWorth", () => {
  it("returns one point per year from 0 to the requested horizon", () => {
    const points = projectNetWorth({ startingAmount: 1000, monthlyContribution: 0, annualRatePct: 5, years: 3 });
    expect(points.map((p) => p.year)).toEqual([0, 1, 2, 3]);
  });

  it("year 0 equals the starting amount with no growth or contributions yet", () => {
    const points = projectNetWorth({ startingAmount: 1000, monthlyContribution: 100, annualRatePct: 7, years: 2 });
    expect(points[0].value).toBeCloseTo(1000);
    expect(points[0].contributed).toBeCloseTo(1000);
    expect(points[0].growth).toBeCloseTo(0);
  });

  it("compounds a lump sum with no contributions correctly", () => {
    const points = projectNetWorth({ startingAmount: 1000, monthlyContribution: 0, annualRatePct: 10, years: 1 });
    // 1000 * 1.10 = 1100
    expect(points[1].value).toBeCloseTo(1100, 1);
    expect(points[1].contributed).toBeCloseTo(1000);
  });

  it("handles a zero rate as pure linear contribution (no division by zero)", () => {
    const points = projectNetWorth({ startingAmount: 0, monthlyContribution: 100, annualRatePct: 0, years: 1 });
    expect(points[1].value).toBeCloseTo(1200);
    expect(points[1].contributed).toBeCloseTo(1200);
    expect(points[1].growth).toBeCloseTo(0);
  });

  it("growth equals value minus total contributed at every point", () => {
    const points = projectNetWorth({ startingAmount: 5000, monthlyContribution: 200, annualRatePct: 6, years: 10 });
    for (const p of points) {
      expect(p.growth).toBeCloseTo(p.value - p.contributed, 6);
    }
  });

  it("a higher rate produces a larger final value, all else equal", () => {
    const low = projectNetWorth({ startingAmount: 1000, monthlyContribution: 100, annualRatePct: 4, years: 20 });
    const high = projectNetWorth({ startingAmount: 1000, monthlyContribution: 100, annualRatePct: 10, years: 20 });
    expect(high[high.length - 1].value).toBeGreaterThan(low[low.length - 1].value);
  });
});
