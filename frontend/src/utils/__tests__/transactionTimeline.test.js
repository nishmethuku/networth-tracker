import { describe, it, expect } from "vitest";
import { computeTransactionTimeline } from "../transactionTimeline";

describe("computeTransactionTimeline", () => {
  it("tracks running quantity and cost basis across buys", () => {
    const transactions = [
      { id: 1, transactionType: "buy", transactionDate: "2024-01-01", quantity: 10, pricePerUnit: 100, fees: 5 },
      { id: 2, transactionType: "buy", transactionDate: "2024-02-01", quantity: 10, pricePerUnit: 120, fees: 5 },
    ];
    const timeline = computeTransactionTimeline(transactions);
    expect(timeline[1].quantityAfter).toBe(10);
    expect(timeline[1].costBasisAfter).toBeCloseTo(1005);
    expect(timeline[2].quantityAfter).toBe(20);
    expect(timeline[2].costBasisAfter).toBeCloseTo(1005 + 1205);
  });

  it("computes realized gain on sell using average cost", () => {
    const transactions = [
      { id: 1, transactionType: "buy", transactionDate: "2024-01-01", quantity: 10, pricePerUnit: 100, fees: 0 },
      { id: 2, transactionType: "sell", transactionDate: "2024-03-01", quantity: 5, pricePerUnit: 150, fees: 0 },
    ];
    const timeline = computeTransactionTimeline(transactions);
    // avg cost 100, sell 5 @ 150 => gain of 50 * 5 = 250
    expect(timeline[2].cumulativeRealizedGain).toBeCloseTo(250);
    expect(timeline[2].quantityAfter).toBe(5);
    expect(timeline[2].costBasisAfter).toBeCloseTo(500);
  });

  it("processes out-of-order input chronologically regardless of array order", () => {
    const transactions = [
      { id: 2, transactionType: "sell", transactionDate: "2024-03-01", quantity: 5, pricePerUnit: 150, fees: 0 },
      { id: 1, transactionType: "buy", transactionDate: "2024-01-01", quantity: 10, pricePerUnit: 100, fees: 0 },
    ];
    const timeline = computeTransactionTimeline(transactions);
    expect(timeline[2].cumulativeRealizedGain).toBeCloseTo(250);
  });
});
