import { describe, it, expect } from "vitest";
import { netWorthChange } from "../netWorthChange";

const history = [
  { date: "2026-08-01", netWorth: 1000 },
  { date: "2026-09-01", netWorth: 1200 },
  { date: "2026-10-01", netWorth: 1500 },
];

describe("netWorthChange", () => {
  it("measures against the latest snapshot on or before the cutoff", () => {
    // 30 days before 2026-10-21 is 2026-09-21, so the base is the Sep 1 snapshot
    expect(netWorthChange(history, 1800, 30, "2026-10-21")).toEqual({ delta: 600, pct: 50, fromDate: "2026-09-01" });
  });

  it("uses a snapshot exactly on the cutoff date", () => {
    expect(netWorthChange(history, 1650, 20, "2026-10-21")?.fromDate).toBe("2026-10-01");
  });

  it("returns null when no snapshot is old enough", () => {
    expect(netWorthChange(history, 1800, 90, "2026-10-21")).toBeNull();
    expect(netWorthChange([{ date: "2026-10-21", netWorth: 5 }], 6, 30, "2026-10-21")).toBeNull();
  });

  it("returns null for missing or empty history", () => {
    expect(netWorthChange(undefined, 1, 30, "2026-10-21")).toBeNull();
    expect(netWorthChange([], 1, 30, "2026-10-21")).toBeNull();
  });

  it("reports a loss as a negative change and handles a zero start", () => {
    expect(netWorthChange(history, 900, 30, "2026-10-21")).toEqual({ delta: -300, pct: -25, fromDate: "2026-09-01" });
    expect(netWorthChange([{ date: "2026-01-01", netWorth: 0 }], 50, 30, "2026-10-21")?.pct).toBeNull();
  });

  it("crosses month and year boundaries correctly", () => {
    expect(netWorthChange([{ date: "2025-12-31", netWorth: 100 }], 110, 7, "2026-01-07")?.fromDate).toBe("2025-12-31");
  });
});
