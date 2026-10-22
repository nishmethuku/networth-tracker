import { describe, it, expect } from "vitest";
import { savingsRate } from "../savingsRate";
import { needsAttention } from "../needsAttention";

describe("savingsRate", () => {
  const months = [
    { month: "2026-07", income: 4000, expenses: 3000 },
    { month: "2026-08", income: 4000, expenses: 3200 },
    { month: "2026-09", income: 4000, expenses: 3400 },
    { month: "2026-10", income: 4000, expenses: 500 },
  ];

  it("skips the month in progress", () => {
    const r = savingsRate(months, "2026-10");
    expect(r.monthsUsed).toBe(3);
    expect(r.ratePct).toBeCloseTo(20);
    expect(r.avgMonthlyNet).toBeCloseTo(800);
  });

  it("uses the current month when it is all there is", () => {
    const r = savingsRate([months[3]], "2026-10");
    expect(r.ratePct).toBeCloseTo(87.5);
  });

  it("goes negative when overspending", () => {
    const r = savingsRate([{ month: "2026-09", income: 1000, expenses: 1500 }], "2026-10");
    expect(r.ratePct).toBeCloseTo(-50);
  });

  it("returns null without income", () => {
    expect(savingsRate([], "2026-10")).toBeNull();
    expect(savingsRate([{ month: "2026-09", income: 0, expenses: 50 }], "2026-10")).toBeNull();
    expect(savingsRate(null, "2026-10")).toBeNull();
  });
});

describe("needsAttention", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("flags missing prices and old valuations only", () => {
    const items = needsAttention(
      [
        { label: "AAA", quantityBased: true, currentPrice: null, updatedAt: "2026-10-01T00:00:00Z" },
        { label: "BBB", quantityBased: true, currentPrice: 10, updatedAt: "2020-01-01T00:00:00Z" },
        { label: "House", quantityBased: false, currentPrice: null, updatedAt: "2026-01-01T00:00:00Z" },
        { label: "Cash", quantityBased: false, currentPrice: null, updatedAt: "2026-10-10T00:00:00Z" },
      ],
      now,
    );
    expect(items.map((i) => i.id)).toEqual(["no-price", "stale"]);
    expect(items[0].message).toContain("AAA");
    expect(items[1].message).toContain("House");
    expect(items[1].message).not.toContain("Cash");
  });

  it("links straight to the holding when only one needs attention", () => {
    const items = needsAttention(
      [{ id: 7, label: "House", quantityBased: false, currentPrice: null, updatedAt: "2026-01-01T00:00:00Z" }],
      now,
    );
    expect(items[0].link).toBe("/portfolio/7");
  });

  it("returns nothing when all is fine", () => {
    expect(needsAttention([], now)).toEqual([]);
    expect(needsAttention(null, now)).toEqual([]);
  });
});
