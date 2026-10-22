import { describe, it, expect } from "vitest";
import { isNonSpendingCategory } from "../nonSpending";
import { monthPace } from "../monthPace";
import { dueRecurring } from "../dueRecurring";
import { monthTotals, groupByDay } from "../entryGroups";

describe("isNonSpendingCategory", () => {
  it("matches card payment names loosely", () => {
    for (const n of ["CC-payment", "cc payments", "CC_Payment", "credit card payment", "Credit-Card-Payments", "card_payment"]) {
      expect(isNonSpendingCategory(n), n).toBe(true);
    }
  });
  it("leaves real categories alone", () => {
    for (const n of ["food", "payment", "credit", "", null, undefined]) expect(isNonSpendingCategory(n), String(n)).toBe(false);
  });
});

describe("monthTotals and groupByDay skip card payments", () => {
  const list = [
    { id: 1, entryDate: "2026-10-02", entryType: "expense", amount: 10, currency: "USD", category: "food" },
    { id: 2, entryDate: "2026-10-02", entryType: "expense", amount: 900, currency: "USD", category: "CC-payment" },
  ];
  it("excludes them from totals but still lists them", () => {
    expect(monthTotals(list, "2026-10", "USD").expenses).toBe(10);
    const days = groupByDay(list, "2026-10", "USD");
    expect(days[0].entries).toHaveLength(2);
    expect(days[0].expenseTotal).toBe(10);
  });
});

describe("monthPace", () => {
  it("projects the month from the daily average", () => {
    const p = monthPace(300, "2026-10", "2026-10-10", 1200);
    expect(p.daysElapsed).toBe(10);
    expect(p.daysInMonth).toBe(31);
    expect(p.dailyAverage).toBe(30);
    expect(p.projected).toBe(930);
    expect(p.vsLastMonthPct).toBeCloseTo(-22.5);
  });
  it("reports the plain total for a finished month", () => {
    const p = monthPace(1500, "2026-09", "2026-10-10", 1000);
    expect(p.daysElapsed).toBe(30);
    expect(p.projected).toBe(1500);
    expect(p.vsLastMonthPct).toBeCloseTo(50);
  });
  it("is null for a future month or no spending, and handles unknown last month", () => {
    expect(monthPace(100, "2026-11", "2026-10-10", 0)).toBeNull();
    expect(monthPace(0, "2026-10", "2026-10-10", 0)).toBeNull();
    expect(monthPace(100, "2026-10", "2026-10-10", 0).vsLastMonthPct).toBeNull();
    expect(monthPace(100, "2026-10", "2026-10-10", null).vsLastMonthPct).toBeNull();
  });
  it("handles February in a leap year", () => {
    expect(monthPace(100, "2028-02", "2028-02-10", null).daysInMonth).toBe(29);
  });
});

describe("dueRecurring", () => {
  const items = [
    { category: "housing", description: "Rent", amount: 1100, frequency: "monthly", next_due: "2026-10-01" },
    { category: "utilities", description: "Phone", amount: 45, frequency: "monthly", next_due: "2026-10-10" },
    { category: "entertainment", description: "Streaming", amount: 16, frequency: "monthly", next_due: "2026-10-12" },
    { category: "insurance", description: "Gone", amount: 0, frequency: "yearly", next_due: "2026-09-01" },
    { category: "other", description: "No date", amount: 5, frequency: "monthly", next_due: null },
  ];
  it("lists items due today or earlier, most overdue first", () => {
    const out = dueRecurring(items, "2026-10-10");
    expect(out.map((i) => i.description)).toEqual(["Rent", "Phone"]);
    expect(out[0].daysOverdue).toBe(9);
    expect(out[1].daysOverdue).toBe(0);
  });
  it("handles missing input", () => {
    expect(dueRecurring(null, "2026-10-10")).toEqual([]);
    expect(dueRecurring([], "2026-10-10")).toEqual([]);
  });
});
