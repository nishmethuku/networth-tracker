import { describe, it, expect } from "vitest";
import { combineHoldingSlices } from "../AllocationDonut";

describe("combineHoldingSlices", () => {
  it("adds several lots of the same symbol into one slice", () => {
    const rows = combineHoldingSlices([
      { symbol: "AMZN", displayValue: 100 },
      { symbol: "AMZN", displayValue: 50 },
      { symbol: "AAPL", displayValue: 70 },
      { symbol: "AMZN", displayValue: 10 },
    ]);
    expect(rows).toEqual([
      { label: "AMZN", value: 160 },
      { label: "AAPL", value: 70 },
    ]);
  });

  it("falls back to the name, and drops zero or empty values", () => {
    expect(combineHoldingSlices([{ name: "My House", displayValue: 5 }, { symbol: "X", displayValue: 0 }, { symbol: "Y" }])).toEqual([
      { label: "My House", value: 5 },
    ]);
  });
});
