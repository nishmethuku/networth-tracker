import { describe, it, expect } from "vitest";
import { findLossCandidates } from "../taxLossHarvest";

const h = (over) => ({
  id: 1,
  assetType: "stock",
  country: "United States",
  displayName: "NVDA",
  displayCostBasis: 1665,
  displayTotalGain: -555,
  displayValue: 1110,
  ...over,
});

describe("findLossCandidates", () => {
  it("lists a stock sitting on an unrealized loss with its size and percent", () => {
    const [c] = findLossCandidates([h()]);
    expect(c.name).toBe("NVDA");
    expect(c.unrealizedLoss).toBe(555);
    expect(c.lossPct).toBeCloseTo(33.33, 1);
  });
  it("skips winners, dust losses and non-market assets", () => {
    const out = findLossCandidates([
      h({ id: 2, displayTotalGain: 200 }),
      h({ id: 3, displayTotalGain: -1 }),
      h({ id: 4, assetType: "real_estate", displayTotalGain: -900 }),
    ]);
    expect(out).toEqual([]);
  });
  it("sorts the biggest loss first", () => {
    const out = findLossCandidates([
      h({ id: 5, displayName: "A", displayTotalGain: -50 }),
      h({ id: 6, displayName: "B", displayTotalGain: -500 }),
    ]);
    expect(out.map((c) => c.name)).toEqual(["B", "A"]);
  });
  it("leaves the percent null when the cost basis is unknown", () => {
    const [c] = findLossCandidates([h({ displayCostBasis: null })]);
    expect(c.lossPct).toBeNull();
  });
});
