import { describe, it, expect } from "vitest";
import { sinceLastVisit, parseVisitRecord } from "../sinceLastVisit";
import { gettingStarted } from "../gettingStarted";

describe("sinceLastVisit", () => {
  const prev = { date: "2026-10-19", netWorth: 10000 };
  it("reports the change and days ago", () => {
    const r = sinceLastVisit(prev, 10500, "2026-10-22");
    expect(r.delta).toBe(500);
    expect(r.pct).toBeCloseTo(5);
    expect(r.daysAgo).toBe(3);
  });
  it("is silent on first visit, same day, or no change", () => {
    expect(sinceLastVisit(null, 1, "2026-10-22")).toBeNull();
    expect(sinceLastVisit({ date: "2026-10-22", netWorth: 1 }, 5, "2026-10-22")).toBeNull();
    expect(sinceLastVisit(prev, 10000, "2026-10-22")).toBeNull();
  });
  it("handles a zero or negative starting value without a percent", () => {
    expect(sinceLastVisit({ date: "2026-10-01", netWorth: 0 }, 50, "2026-10-22").pct).toBeNull();
  });
  it("parses stored records defensively", () => {
    expect(parseVisitRecord('{"date":"2026-10-01","netWorth":5}')).toEqual({ date: "2026-10-01", netWorth: 5 });
    expect(parseVisitRecord("junk")).toBeNull();
    expect(parseVisitRecord('{"date":"x","netWorth":5}')).toBeNull();
    expect(parseVisitRecord(null)).toBeNull();
  });
});

describe("gettingStarted", () => {
  it("marks done steps and detects completion", () => {
    const part = gettingStarted({ holdingCount: 2, goalCount: 0, budgetMonths: 0, historyPoints: 10 });
    expect(part.steps.map((s) => s.done)).toEqual([true, false, false, true]);
    expect(part.allDone).toBe(false);
    expect(gettingStarted({ holdingCount: 1, goalCount: 1, budgetMonths: 1, historyPoints: 3 }).allDone).toBe(true);
  });
});
