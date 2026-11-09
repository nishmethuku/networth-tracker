import { describe, it, expect } from "vitest";
import { buildGuidedPayloads } from "../GuidedSetup";

const base = { country: "India", date: "2026-01-02", symbol: " reliance.ns ", metal: "silver", quantity: "10", price: "2500", name: " HDFC ", value: "50000", savingsType: "ppf" };

describe("buildGuidedPayloads", () => {
  it("builds a stock purchase", () => {
    const p = buildGuidedPayloads("shares", base);
    expect(p.holding.symbol).toBe("RELIANCE.NS");
    expect(p.holding.currency).toBe("INR");
    expect(p.transaction).toMatchObject({ transaction_type: "buy", quantity: 10, price_per_unit: 2500 });
  });
  it("builds a metal purchase", () => {
    const p = buildGuidedPayloads("metal", base);
    expect(p.holding).toMatchObject({ asset_type: "commodity", symbol: "silver", name: "Silver" });
  });
  it("builds a cash balance as a value", () => {
    const p = buildGuidedPayloads("cash", base);
    expect(p.holding).toMatchObject({ asset_type: "cash", name: "HDFC", account: "HDFC" });
    expect(p.valuation.value).toBe(50000);
  });
  it("builds an account-less savings holding", () => {
    const p = buildGuidedPayloads("savings", base);
    expect(p.holding).toMatchObject({ asset_type: "ppf", account: "" });
  });
});
