import { describe, it, expect } from "vitest";
import { holdingGrowthPct, computeReturnsByType } from "../holdingReturns";

function stock({ costBasis, totalGain, displayValue, xirr }) {
  return { assetType: "stock", costBasis, totalGain, displayValue, xirr };
}

function realEstate({ firstValue, gain, displayValue }) {
  return { assetType: "real_estate", firstValue, gain, displayValue };
}

describe("holdingGrowthPct", () => {
  it("computes total return from cost basis for quantity-based holdings", () => {
    const h = stock({ costBasis: 1000, totalGain: 250, displayValue: 1250, xirr: 0.4 });
    expect(holdingGrowthPct(h)).toBeCloseTo(25);
  });

  it("computes total return from first value for valuation-based holdings", () => {
    const h = realEstate({ firstValue: 400000, gain: 40000, displayValue: 440000 });
    expect(holdingGrowthPct(h)).toBeCloseTo(10);
  });

  it("returns null when there's nothing to compute from", () => {
    expect(holdingGrowthPct({ assetType: "stock", costBasis: null })).toBeNull();
  });
});

describe("computeReturnsByType", () => {
  it("value-weights XIRR across multiple holdings in the same category", () => {
    const holdings = [
      stock({ costBasis: 1000, totalGain: 0, displayValue: 1000, xirr: 0.5 }), // 50% XIRR, weight 1000
      stock({ costBasis: 1000, totalGain: 0, displayValue: 3000, xirr: 0.1 }), // 10% XIRR, weight 3000
    ];
    const result = computeReturnsByType(holdings);
    expect(result).toHaveLength(1);
    // (50*1000 + 10*3000) / 4000 = 20
    expect(result[0].returnPct).toBeCloseTo(20);
  });

  it("uses growth % (not XIRR) for valuation-based categories", () => {
    const holdings = [realEstate({ firstValue: 400000, gain: 40000, displayValue: 440000 })];
    const result = computeReturnsByType(holdings);
    expect(result[0].assetType).toBe("real_estate");
    expect(result[0].returnPct).toBeCloseTo(10);
  });

  it("sorts categories by return descending", () => {
    const holdings = [
      stock({ costBasis: 100, totalGain: 0, displayValue: 100, xirr: 0.05 }),
      realEstate({ firstValue: 100, gain: 50, displayValue: 150 }),
    ];
    const result = computeReturnsByType(holdings);
    expect(result.map((r) => r.assetType)).toEqual(["real_estate", "stock"]);
  });

  it("excludes holdings with no computable return from skewing the average", () => {
    const holdings = [
      stock({ costBasis: 1000, totalGain: 0, displayValue: 1000, xirr: 0.2 }),
      stock({ costBasis: 1000, totalGain: 0, displayValue: 1000, xirr: null }), // no XIRR yet, shouldn't count
    ];
    const result = computeReturnsByType(holdings);
    expect(result[0].returnPct).toBeCloseTo(20);
  });

  it("returns an empty list for no holdings", () => {
    expect(computeReturnsByType([])).toEqual([]);
  });
});
