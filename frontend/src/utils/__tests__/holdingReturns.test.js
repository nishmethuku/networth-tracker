import { describe, it, expect } from "vitest";
import { holdingGrowthPct, holdingBuyValue, groupBuyValueAndGain, computeReturnsByType, computeGroupedReturn } from "../holdingReturns";

function stock({ costBasis, displayCostBasis, totalGain, displayValue, xirr }) {
  return { assetType: "stock", costBasis, displayCostBasis, totalGain, displayValue, xirr };
}

function realEstate({ firstValue, displayFirstValue, gain, displayValue }) {
  return { assetType: "real_estate", firstValue, displayFirstValue, gain, displayValue };
}

describe("holdingBuyValue", () => {
  it("uses displayCostBasis for quantity-based holdings", () => {
    const h = stock({ costBasis: 1000, displayCostBasis: 83000, totalGain: 250, displayValue: 103750 });
    expect(holdingBuyValue(h)).toBe(83000);
  });

  it("uses the absolute value of displayFirstValue for valuation-based holdings", () => {
    const h = realEstate({ firstValue: 400000, displayFirstValue: 400000, gain: 40000, displayValue: 440000 });
    expect(holdingBuyValue(h)).toBe(400000);
  });

  it("returns null (not 0) when unknown, so it's distinguishable from a real zero", () => {
    expect(holdingBuyValue(stock({ costBasis: null, displayCostBasis: null, totalGain: null, displayValue: 0 }))).toBeNull();
  });
});

describe("groupBuyValueAndGain", () => {
  it("sums buy value and computes $ gain across a mixed group", () => {
    const holdings = [
      stock({ costBasis: 1000, displayCostBasis: 1000, totalGain: 250, displayValue: 1250 }),
      realEstate({ firstValue: 400000, displayFirstValue: 400000, gain: 40000, displayValue: 440000 }),
    ];
    const result = groupBuyValueAndGain(holdings);
    expect(result.buyValue).toBe(401000);
    expect(result.gainAmount).toBe(40250); // (1250+440000) - 401000
  });

  it("excludes holdings with unknown buy value from the sum rather than treating them as 0", () => {
    const holdings = [
      stock({ costBasis: 1000, displayCostBasis: 1000, totalGain: 250, displayValue: 1250 }),
      stock({ costBasis: null, displayCostBasis: null, totalGain: null, displayValue: 500 }), // unknown buy value
    ];
    const result = groupBuyValueAndGain(holdings);
    expect(result.buyValue).toBe(1000); // only the first holding's buy value, not padded with a 0 for the second
  });

  it("returns null buyValue/gainAmount when nothing in the group has a known buy value", () => {
    const holdings = [stock({ costBasis: null, displayCostBasis: null, totalGain: null, displayValue: 500 })];
    const result = groupBuyValueAndGain(holdings);
    expect(result.buyValue).toBeNull();
    expect(result.gainAmount).toBeNull();
  });
});

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

describe("computeGroupedReturn", () => {
  it("marks the group as XIRR only when every holding used XIRR", () => {
    const holdings = [
      stock({ costBasis: 1000, totalGain: 0, displayValue: 1000, xirr: 0.3 }),
      stock({ costBasis: 1000, totalGain: 0, displayValue: 1000, xirr: 0.1 }),
    ];
    expect(computeGroupedReturn(holdings)).toEqual({ returnPct: 20, isXirr: true });
  });

  it("marks the group as plain return (not XIRR) when it mixes asset kinds", () => {
    const holdings = [
      stock({ costBasis: 1000, totalGain: 0, displayValue: 1000, xirr: 0.2 }),
      realEstate({ firstValue: 1000, gain: 0, displayValue: 1000 }),
    ];
    const result = computeGroupedReturn(holdings);
    expect(result.isXirr).toBe(false);
  });

  it("returns null for an empty or all-uncomputable group", () => {
    expect(computeGroupedReturn([])).toEqual({ returnPct: null, isXirr: false });
  });
});
