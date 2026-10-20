import { describe, it, expect } from "vitest";
import { capOutliersForChart } from "../chartScale";

describe("capOutliersForChart", () => {
  it("clips the one extreme outlier without touching normal-range rows", () => {
    const rows = [
      { label: "TSLA", returnPct: 1764 },
      { label: "AMZN", returnPct: 25 },
      { label: "NVDA", returnPct: -10 },
    ];
    const { rows: capped, domainCap } = capOutliersForChart(rows);

    const tsla = capped.find((r) => r.row.label === "TSLA");
    const amzn = capped.find((r) => r.row.label === "AMZN");
    const nvda = capped.find((r) => r.row.label === "NVDA");

    expect(tsla.clipped).toBe(true);
    expect(tsla.chartPct).toBeCloseTo(domainCap);
    expect(amzn.clipped).toBe(false);
    expect(amzn.chartPct).toBeCloseTo(25);
    expect(nvda.clipped).toBe(false);
    expect(nvda.chartPct).toBeCloseTo(-10);
    // Domain sized off the second-largest magnitude (25), not the 1764 outlier.
    expect(domainCap).toBeCloseTo(25 * 1.4);
  });

  it("floors the domain so an all-small dataset still gets a readable axis", () => {
    const rows = [{ returnPct: 2 }, { returnPct: -1 }];
    const { domainCap, rows: capped } = capOutliersForChart(rows);
    expect(domainCap).toBe(20);
    expect(capped.every((r) => !r.clipped)).toBe(true);
  });

  it("passes null returnPct through as an uncapped, unclipped zero", () => {
    const rows = [{ returnPct: null }, { returnPct: 50 }];
    const { rows: capped } = capOutliersForChart(rows);
    const nullRow = capped.find((r) => r.row.returnPct == null);
    expect(nullRow.chartPct).toBe(0);
    expect(nullRow.clipped).toBe(false);
  });

  it("handles an empty array", () => {
    const { rows, domainCap } = capOutliersForChart([]);
    expect(rows).toEqual([]);
    expect(domainCap).toBe(20);
  });

  it("handles a single row (no 'second largest' to size off of)", () => {
    const rows = [{ returnPct: 500 }];
    const { rows: capped, domainCap } = capOutliersForChart(rows);
    expect(domainCap).toBeCloseTo(500 * 1.4);
    expect(capped[0].clipped).toBe(false); // the domain was sized to fit it, so it's not actually clipped
  });
});
