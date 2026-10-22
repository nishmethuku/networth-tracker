import { describe, it, expect } from "vitest";
import { computeMoneyHealth, healthLabel } from "../moneyHealth";

const base = {
  holdings: [
    { label: "A", value: 25 },
    { label: "B", value: 25 },
    { label: "C", value: 25 },
    { label: "D", value: 25 },
  ],
  allocationByType: [
    { label: "Stocks", value: 50 },
    { label: "Cash", value: 30 },
    { label: "Real Estate", value: 20 },
    { label: "Crypto", value: 10 },
  ],
  totalAssets: 1000,
  totalLiabilities: 0,
};

const byKey = (r, key) => r.factors.find((f) => f.key === key);

describe("computeMoneyHealth", () => {
  it("returns no score when there is nothing to measure", () => {
    const r = computeMoneyHealth({ holdings: [], allocationByType: [], totalAssets: 0, totalLiabilities: 0 });
    expect(r).toEqual({ score: null, label: null, factors: [], nextStep: null });
  });

  it("scores the emergency fund as months covered over the target, capped at 100", () => {
    expect(byKey(computeMoneyHealth({ ...base, emergencyMonths: 3, emergencyTarget: 6 }), "emergency").score).toBe(50);
    expect(byKey(computeMoneyHealth({ ...base, emergencyMonths: 45, emergencyTarget: 6 }), "emergency").score).toBe(100);
  });

  it("leaves the emergency factor out when Budget is unused", () => {
    expect(byKey(computeMoneyHealth(base), "emergency")).toBeUndefined();
  });

  it("scores concentration: 25% in one holding is 62.5, one holding only is 0", () => {
    expect(byKey(computeMoneyHealth(base), "concentration").score).toBeCloseTo(62.5);
    const single = computeMoneyHealth({ ...base, holdings: [{ label: "ONLY", value: 100 }] });
    expect(byKey(single, "concentration").score).toBe(0);
    expect(byKey(single, "concentration").detail).toBe("ONLY is 100% of your holdings.");
  });

  it("scores diversification by number of asset types", () => {
    const one = computeMoneyHealth({ ...base, allocationByType: [{ label: "Stocks", value: 5 }] });
    expect(byKey(one, "diversification").score).toBe(25);
    expect(byKey(computeMoneyHealth(base), "diversification").score).toBe(100);
  });

  it("scores debt: none is 100, 25% of assets is 50, half or more is 0", () => {
    expect(byKey(computeMoneyHealth(base), "debt").score).toBe(100);
    expect(byKey(computeMoneyHealth({ ...base, totalLiabilities: 250 }), "debt").score).toBe(50);
    expect(byKey(computeMoneyHealth({ ...base, totalLiabilities: 900 }), "debt").score).toBe(0);
  });

  it("averages by weight and names the weakest area as the next step", () => {
    const r = computeMoneyHealth({ ...base, emergencyMonths: 0, emergencyTarget: 6 });
    // emergency 0*30, concentration 62.5*25, diversification 100*20, debt 100*25 over 100
    expect(r.score).toBe(Math.round((0 * 30 + 62.5 * 25 + 100 * 20 + 100 * 25) / 100));
    expect(r.nextStep).toMatch(/cash toward 6 months/);
  });

  it("congratulates when every factor is strong", () => {
    const strong = {
      holdings: Array.from({ length: 10 }, (_, i) => ({ label: `H${i}`, value: 10 })),
      allocationByType: base.allocationByType,
      totalAssets: 1000,
      totalLiabilities: 0,
      emergencyMonths: 8,
      emergencyTarget: 6,
    };
    const r = computeMoneyHealth(strong);
    expect(r.score).toBe(100);
    expect(r.label).toBe("Excellent");
    expect(r.nextStep).toMatch(/Nice work/);
  });
});

describe("healthLabel", () => {
  it("maps score bands", () => {
    expect(healthLabel(80)).toBe("Excellent");
    expect(healthLabel(60)).toBe("Good");
    expect(healthLabel(40)).toBe("Fair");
    expect(healthLabel(39)).toBe("Needs attention");
  });
});
