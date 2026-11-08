import { describe, it, expect } from "vitest";
import { xirr, pooledXirr } from "../xirr";
import { groupLots } from "../groupHoldings";

describe("xirr", () => {
  it("matches a known one-year 10% case", () => {
    const r = xirr([
      { date: "2024-01-01", amount: -1000 },
      { date: "2024-12-31", amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 2);
  });

  it("pools lots bought on different days rather than averaging", () => {
    const today = new Date("2026-01-01T00:00:00Z");
    // 1000 bought two years ago, 1000 bought one year ago; worth 1210 + 1100 = 2310 now.
    const flows = [
      { date: "2024-01-01", amount: -1000 },
      { date: "2025-01-01", amount: -1000 },
    ];
    const pooled = pooledXirr(flows, 2310, today)!;
    // Each lot alone earns exactly 10% a year, so the pooled rate must be 10% too.
    expect(pooled).toBeCloseTo(0.1, 2);
  });

  it("returns null for positions younger than 30 days", () => {
    expect(pooledXirr([{ date: "2026-01-01", amount: -100 }], 105, new Date("2026-01-10T00:00:00Z"))).toBeNull();
  });
});

describe("groupLots", () => {
  const lot = (id: number, quantity: number, cost: number, value: number, flows: any[]) => ({
    id,
    assetType: "stock",
    symbol: "AMZN",
    name: "Amazon",
    currency: "USD",
    account: "A",
    quantity,
    displayCostBasis: cost,
    displayValue: value,
    displayTotalGain: value - cost,
    cashFlows: flows,
  });

  it("combines same-stock lots into one position with summed figures", () => {
    const g = groupLots([
      lot(1, 10, 1000, 2000, [{ date: "2020-01-01", amount: -1000 }]),
      lot(2, 30, 3000, 6000, [{ date: "2022-01-01", amount: -3000 }]),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].quantity).toBe(40);
    expect(g[0].displayCostBasis).toBe(4000);
    expect(g[0].displayValue).toBe(8000);
    expect(g[0].displayTotalGain).toBe(4000);
    expect(g[0].lots).toHaveLength(2);
    expect(g[0].xirr).not.toBeNull();
  });

  it("keeps different stocks separate", () => {
    const a = lot(1, 1, 10, 20, []);
    const b = { ...lot(2, 1, 10, 20, []), symbol: "AAPL" };
    expect(groupLots([a, b])).toHaveLength(2);
  });
});
