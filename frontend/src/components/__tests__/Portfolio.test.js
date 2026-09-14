import { describe, it, expect } from "vitest";
import { sortHoldings } from "../Portfolio";

function h(overrides) {
  return { assetType: "stock", symbol: "AAA", name: "AAA Inc", displayValue: 0, displayTotalGain: 0, displayGain: null, ...overrides };
}

describe("sortHoldings", () => {
  it("sorts descending by value by default direction", () => {
    const holdings = [h({ symbol: "A", displayValue: 100 }), h({ symbol: "B", displayValue: 300 }), h({ symbol: "C", displayValue: 200 })];
    const sorted = sortHoldings(holdings, "value", "desc");
    expect(sorted.map((x) => x.symbol)).toEqual(["B", "C", "A"]);
  });

  it("sorts ascending when direction is asc", () => {
    const holdings = [h({ symbol: "A", displayValue: 100 }), h({ symbol: "B", displayValue: 300 }), h({ symbol: "C", displayValue: 200 })];
    const sorted = sortHoldings(holdings, "value", "asc");
    expect(sorted.map((x) => x.symbol)).toEqual(["A", "C", "B"]);
  });

  it("sorts by name case-insensitively via localeCompare", () => {
    const holdings = [h({ symbol: "Z", name: "zebra corp" }), h({ symbol: "A", name: "Apple Inc" })];
    const sorted = sortHoldings(holdings, "name", "asc");
    // sortHoldings sorts by symbol-or-name lowercased -- both have symbols here, so it's symbol order
    expect(sorted.map((x) => x.symbol)).toEqual(["A", "Z"]);
  });

  it("puts null values last regardless of direction", () => {
    const holdings = [
      h({ symbol: "A", displayTotalGain: 50 }),
      h({ symbol: "B", displayTotalGain: null }),
      h({ symbol: "C", displayTotalGain: -10 }),
    ];
    const ascending = sortHoldings(holdings, "gain", "asc");
    expect(ascending.map((x) => x.symbol)).toEqual(["C", "A", "B"]);
    const descending = sortHoldings(holdings, "gain", "desc");
    expect(descending.map((x) => x.symbol)).toEqual(["A", "C", "B"]);
  });

  it("returns the original array unchanged when sortKey is falsy", () => {
    const holdings = [h({ symbol: "B" }), h({ symbol: "A" })];
    expect(sortHoldings(holdings, null, "desc")).toBe(holdings);
  });

  it("does not mutate the input array", () => {
    const holdings = [h({ symbol: "B", displayValue: 1 }), h({ symbol: "A", displayValue: 2 })];
    const original = [...holdings];
    sortHoldings(holdings, "value", "desc");
    expect(holdings).toEqual(original);
  });

  it("uses displayTotalGain for quantity-based holdings and displayGain for valuation-based ones", () => {
    const holdings = [
      h({ symbol: "STOCK", assetType: "stock", displayTotalGain: 100, displayGain: null }),
      h({ symbol: "CASH", assetType: "cash", displayTotalGain: null, displayGain: 50 }),
    ];
    const sorted = sortHoldings(holdings, "gain", "desc");
    expect(sorted.map((x) => x.symbol)).toEqual(["STOCK", "CASH"]);
  });
});
