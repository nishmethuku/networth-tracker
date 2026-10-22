import { describe, it, expect } from "vitest";
import { nextMilestone } from "../nextMilestone";
import { dataChecks } from "../dataChecks";

describe("nextMilestone", () => {
  it("finds the next rung and progress from the previous one", () => {
    const r = nextMilestone(34000);
    expect(r.target).toBe(50000);
    expect(r.previous).toBe(25000);
    expect(r.pct).toBeCloseTo(36);
    expect(r.remaining).toBe(16000);
  });
  it("starts from zero below the first rung", () => {
    expect(nextMilestone(5000).pct).toBeCloseTo(50);
  });
  it("returns null for zero, negative, NaN or past the ladder", () => {
    expect(nextMilestone(0)).toBeNull();
    expect(nextMilestone(-5)).toBeNull();
    expect(nextMilestone(NaN)).toBeNull();
    expect(nextMilestone(200_000_000)).toBeNull();
  });
});

describe("dataChecks", () => {
  const h = (o) => ({ id: 1, label: "AAA", assetType: "stock", account: "Main", value: 100, country: "US", ...o });
  it("flags duplicates, zero value and missing country", () => {
    const issues = dataChecks([h({ id: 1 }), h({ id: 2 }), h({ id: 3, label: "ZZZ", value: 0, country: "" })]);
    expect(issues.map((i) => i.id)).toEqual(["duplicates", "zero-value", "no-country"]);
  });
  it("treats the same symbol in different accounts as fine", () => {
    expect(dataChecks([h({ id: 1 }), h({ id: 2, account: "Other" })])).toEqual([]);
  });
  it("is quiet for empty input", () => {
    expect(dataChecks([])).toEqual([]);
    expect(dataChecks(null)).toEqual([]);
  });
});
