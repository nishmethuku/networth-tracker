import { describe, it, expect } from "vitest";
import { computeYoyChanges } from "../TaxSummary";

describe("computeYoyChanges", () => {
  it("computes percent change between consecutive years for the same country", () => {
    const rows = [
      { financialYear: "FY2023-24", country: "India", realizedGain: 1000 },
      { financialYear: "FY2024-25", country: "India", realizedGain: 1500 },
    ];
    const changes = computeYoyChanges(rows);
    expect(changes["FY2024-25-India"].pct).toBeCloseTo(50);
    expect(changes["FY2023-24-India"]).toBeUndefined();
  });

  it("keeps countries separate", () => {
    const rows = [
      { financialYear: "FY2023-24", country: "India", realizedGain: 1000 },
      { financialYear: "2023", country: "United States", realizedGain: 2000 },
      { financialYear: "FY2024-25", country: "India", realizedGain: 500 },
      { financialYear: "2024", country: "United States", realizedGain: 1000 },
    ];
    const changes = computeYoyChanges(rows);
    expect(changes["FY2024-25-India"].pct).toBeCloseTo(-50);
    expect(changes["2024-United States"].pct).toBeCloseTo(-50);
  });

  it("skips a prior-year comparison when the previous gain was exactly zero", () => {
    const rows = [
      { financialYear: "FY2023-24", country: "India", realizedGain: 0 },
      { financialYear: "FY2024-25", country: "India", realizedGain: 500 },
    ];
    const changes = computeYoyChanges(rows);
    expect(changes["FY2024-25-India"]).toBeUndefined();
  });

  it("returns no changes for a single year", () => {
    const rows = [{ financialYear: "FY2024-25", country: "India", realizedGain: 500 }];
    expect(computeYoyChanges(rows)).toEqual({});
  });
});
