import { describe, it, expect } from "vitest";
import { computeStress } from "../stressTest";

const holdings = [
  { assetType: "stock", currency: "USD", displayValue: 8000, symbol: "AMZN" },
  { assetType: "stock", currency: "INR", displayValue: 1000, symbol: "RELIANCE.NS" },
  { assetType: "cash", currency: "INR", displayValue: 500, name: "Bank" },
  { assetType: "real_estate", currency: "USD", displayValue: 500, name: "House" },
  { assetType: "loan", currency: "USD", displayValue: -300, name: "Owed to me" },
];

const base = { holdings, displayCurrency: "USD", totalNetWorth: 10000, topHoldingDropPct: 30, marketDropPct: 20, fxDropPct: 10 };

describe("computeStress", () => {
  it("sizes the loss from the largest holding dropping", () => {
    const r = computeStress(base);
    expect(r.topHolding.label).toBe("AMZN");
    expect(r.topHoldingLoss).toBeCloseTo(2400);
    expect(r.topHoldingLossPct).toBeCloseTo(24);
  });
  it("applies a market drop only to stocks, funds and crypto", () => {
    const r = computeStress(base);
    expect(r.marketExposure).toBe(9000);
    expect(r.marketLoss).toBeCloseTo(1800);
  });
  it("applies a currency drop only to holdings outside the display currency", () => {
    const r = computeStress(base);
    expect(r.foreignExposure).toBe(1500);
    expect(r.foreignLoss).toBeCloseTo(150);
  });
  it("ignores negative-value rows when picking the largest holding", () => {
    const r = computeStress({ ...base, holdings: [{ assetType: "loan", currency: "USD", displayValue: -900 }] });
    expect(r.topHolding).toBeNull();
    expect(r.topHoldingLoss).toBe(0);
  });
  it("returns 0% of net worth when net worth is not positive, never NaN or Infinity", () => {
    const r = computeStress({ ...base, totalNetWorth: 0 });
    expect(r.topHoldingLossPct).toBe(0);
    expect(r.marketLossPct).toBe(0);
  });
  it("clamps nonsensical drop percentages to 0-100", () => {
    const r = computeStress({ ...base, topHoldingDropPct: 500, marketDropPct: -20 });
    expect(r.topHoldingLoss).toBe(8000);
    expect(r.marketLoss).toBe(0);
  });
});
