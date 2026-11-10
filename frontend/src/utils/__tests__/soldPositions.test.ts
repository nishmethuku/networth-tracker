import { describe, it, expect } from "vitest";
import { splitCurrentAndSold } from "../soldPositions";

const h = (symbol: string, quantity: number) => ({ assetType: "stock", symbol, currency: "USD", quantity });

describe("splitCurrentAndSold", () => {
  it("hides a stock that was fully sold", () => {
    const { current, soldPositions } = splitCurrentAndSold([h("AAA", 0), h("BBB", 5)]);
    expect(current.map((x) => x.symbol)).toEqual(["BBB"]);
    expect(soldPositions).toBe(1);
  });
  it("keeps every purchase of a stock that is still held, even a sold one", () => {
    const { current, soldPositions } = splitCurrentAndSold([h("AAA", 0), h("AAA", 3)]);
    expect(current).toHaveLength(2);
    expect(soldPositions).toBe(0);
  });
});
