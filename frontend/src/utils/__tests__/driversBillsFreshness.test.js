import { describe, it, expect } from "vitest";
import { driversOfChange } from "../driversOfChange";
import { upcomingBills } from "../upcomingBills";
import { freshness, backupDue } from "../freshness";

describe("driversOfChange", () => {
  const history = [
    { date: "2026-09-20", netWorth: 30000, liabilities: 0, byAssetType: { stock: 25000, cash: 5000 } },
    { date: "2026-10-22", netWorth: 33000, liabilities: 0, byAssetType: { stock: 27500, cash: 5500 } },
  ];
  it("ranks asset types by effect", () => {
    const r = driversOfChange(history, 30, "2026-10-22");
    expect(r.total).toBe(3000);
    expect(r.drivers.map((d) => d.key)).toEqual(["stock", "cash"]);
    expect(r.drivers[0].delta).toBe(2500);
  });
  it("counts paying down debt as a positive driver", () => {
    const h = [
      { date: "2026-09-20", netWorth: 1000, liabilities: 500, byAssetType: { cash: 1500 } },
      { date: "2026-10-22", netWorth: 1300, liabilities: 200, byAssetType: { cash: 1500 } },
    ];
    expect(driversOfChange(h, 30, "2026-10-22").drivers).toEqual([{ key: "liabilities", delta: 300 }]);
  });
  it("is null without an old enough snapshot or any change", () => {
    expect(driversOfChange(history, 90, "2026-10-22")).toBeNull();
    expect(driversOfChange([history[0], { ...history[0], date: "2026-10-22" }], 30, "2026-10-22")).toBeNull();
    expect(driversOfChange(null, 30, "2026-10-22")).toBeNull();
  });
});

describe("upcomingBills", () => {
  const items = [
    { category: "rent", description: "Rent", amount: 1000, frequency: "monthly", next_due: "2026-10-30" },
    { category: "fun", description: "Netflix", amount: 15, frequency: "monthly", next_due: "2026-10-23" },
    { category: "fun", description: "Later", amount: 5, frequency: "yearly", next_due: "2027-01-01" },
    { category: "x", description: "Past", amount: 5, frequency: "monthly", next_due: "2026-10-01" },
    { category: "x", description: "None", amount: 5, frequency: "monthly", next_due: null },
  ];
  it("keeps only items due soon, soonest first", () => {
    const r = upcomingBills(items, "2026-10-22", 14);
    expect(r.map((b) => b.description)).toEqual(["Netflix", "Rent"]);
    expect(r[0].daysAway).toBe(1);
  });
  it("handles missing input", () => {
    expect(upcomingBills(null, "2026-10-22")).toEqual([]);
  });
});

describe("freshness and backups", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("labels age and flags stale values", () => {
    expect(freshness("2026-10-22T01:00:00Z", now)).toEqual({ text: "Updated today", stale: false });
    expect(freshness("2026-10-21T01:00:00Z", now).text).toBe("Updated yesterday");
    expect(freshness("2026-10-12T00:00:00Z", now).text).toBe("Updated 10 days ago");
    expect(freshness("2026-04-22T00:00:00Z", now)).toEqual({ text: "Updated 6 months ago", stale: true });
    expect(freshness("2023-01-01T00:00:00Z", now).text).toBe("Updated 3 years ago");
    expect(freshness("garbage", now)).toBeNull();
    expect(freshness(null, now)).toBeNull();
  });
  it("says a backup is due when missing or older than 30 days", () => {
    expect(backupDue(null, "2026-10-22")).toBe(true);
    expect(backupDue("2026-10-01", "2026-10-22")).toBe(false);
    expect(backupDue("2026-08-01", "2026-10-22")).toBe(true);
    expect(backupDue("nonsense", "2026-10-22")).toBe(true);
  });
});
