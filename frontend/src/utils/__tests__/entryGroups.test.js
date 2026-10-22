import { describe, it, expect } from "vitest";
import { shiftMonth, groupByDay, monthTotals, monthOf } from "../entryGroups";

const e = (id, entryDate, entryType, amount, currency = "USD", category = "food") => ({
  id,
  entryDate,
  entryType,
  amount,
  currency,
  category,
});

describe("shiftMonth", () => {
  it("moves across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
    expect(shiftMonth("2026-03", -15)).toBe("2024-12");
  });
});

describe("groupByDay", () => {
  const list = [
    e(1, "2026-10-02", "expense", 10),
    e(2, "2026-10-05", "expense", 20),
    e(3, "2026-10-05", "income", 500),
    e(4, "2026-09-30", "expense", 99),
  ];
  it("keeps one month, newest day first, newest entry first within a day", () => {
    const g = groupByDay(list, "2026-10", "USD");
    expect(g.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-02"]);
    expect(g[0].entries.map((x) => x.id)).toEqual([3, 2]);
  });
  it("totals only expenses in the chosen currency", () => {
    const g = groupByDay([...list, e(5, "2026-10-05", "expense", 1000, "INR")], "2026-10", "USD");
    expect(g[0].expenseTotal).toBe(20);
  });
  it("handles empty and missing input", () => {
    expect(groupByDay(null, "2026-10", "USD")).toEqual([]);
    expect(groupByDay([], "2026-10", "USD")).toEqual([]);
  });
});

describe("monthTotals", () => {
  it("sums income and expenses for the month and currency", () => {
    const t = monthTotals(
      [e(1, "2026-10-02", "expense", 10), e(2, "2026-10-03", "income", 100), e(3, "2026-10-04", "expense", 5, "INR")],
      "2026-10",
      "USD",
    );
    expect(t).toEqual({ income: 100, expenses: 10 });
  });
  it("monthOf takes the YYYY-MM part", () => {
    expect(monthOf("2026-10-22")).toBe("2026-10");
  });
});
