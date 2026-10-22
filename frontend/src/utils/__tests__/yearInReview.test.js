import { describe, it, expect } from "vitest";
import { buildYearReview } from "../yearInReview";

const history = [
  { date: "2025-12-31", netWorth: 10000 },
  { date: "2026-01-31", netWorth: 11000 },
  { date: "2026-02-28", netWorth: 10500 },
  { date: "2026-03-31", netWorth: 14000 },
];

describe("buildYearReview", () => {
  it("measures from the last snapshot before the year", () => {
    const r = buildYearReview({ year: 2026, history });
    expect(r.startValue).toBe(10000);
    expect(r.endValue).toBe(14000);
    expect(r.delta).toBe(4000);
    expect(r.pct).toBeCloseTo(40);
  });

  it("finds the best and worst month", () => {
    const r = buildYearReview({ year: 2026, history });
    expect(r.bestMonth).toEqual({ month: "2026-03", delta: 3500 });
    expect(r.worstMonth).toEqual({ month: "2026-02", delta: -500 });
  });

  it("starts from the first point in the year when history begins mid-year", () => {
    const r = buildYearReview({ year: 2026, history: history.slice(1) });
    expect(r.startValue).toBe(11000);
  });

  it("returns null with too little data or none in the year", () => {
    expect(buildYearReview({ year: 2026, history: [] })).toBeNull();
    expect(buildYearReview({ year: 2026, history: [history[0]] })).toBeNull();
    expect(buildYearReview({ year: 2030, history })).toBeNull();
  });

  it("reports pct as null when starting from zero", () => {
    const r = buildYearReview({
      year: 2026,
      history: [
        { date: "2026-01-31", netWorth: 0 },
        { date: "2026-02-28", netWorth: 500 },
      ],
    });
    expect(r.pct).toBeNull();
  });

  it("picks the top gainer, biggest holding, milestones and income", () => {
    const r = buildYearReview({
      year: 2026,
      history,
      holdings: [
        { label: "AAA", value: 300, gain: 50 },
        { label: "BBB", value: 100, gain: 90 },
        { label: "CCC", value: 100, gain: null },
      ],
      milestones: [
        { threshold: 10000, achievedDate: "2025-11-01" },
        { threshold: 15000, achievedDate: "2026-03-05" },
      ],
      incomeByYear: [{ year: 2026, amount: 120 }],
    });
    expect(r.topGainer).toEqual({ label: "BBB", gain: 90 });
    expect(r.biggestHolding.label).toBe("AAA");
    expect(r.biggestHolding.sharePct).toBeCloseTo(60);
    expect(r.milestonesReached).toEqual([15000]);
    expect(r.incomeReceived).toBe(120);
  });
});
