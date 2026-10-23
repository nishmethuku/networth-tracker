import { describe, it, expect } from "vitest";
import { frequentExpenses } from "../frequentExpenses";
import { filterEntries } from "../filterEntries";

const e = (id, entryDate, amount, category, description, entryType = "expense", currency = "USD") => ({
  id,
  entryDate,
  amount,
  category,
  description,
  entryType,
  currency,
});

describe("frequentExpenses", () => {
  const list = [
    e(1, "2026-10-01", 5, "food", "Coffee"),
    e(2, "2026-10-03", 6, "food", "coffee "),
    e(3, "2026-10-09", 6.5, "food", "Coffee"),
    e(4, "2026-10-02", 40, "transport", "Gas"),
    e(5, "2026-10-08", 42, "transport", "Gas"),
    e(6, "2026-10-04", 900, "housing", "Rent"),
  ];
  it("ranks repeated expenses by count and uses the latest amount", () => {
    const out = frequentExpenses(list, "USD");
    expect(out.map((x) => x.description)).toEqual(["Coffee", "Gas"]);
    expect(out[0]).toMatchObject({ category: "food", amount: 6.5, count: 3 });
    expect(out[1].amount).toBe(42);
  });
  it("leaves out one-offs, income and other currencies", () => {
    expect(frequentExpenses(list, "USD").some((x) => x.description === "Rent")).toBe(false);
    expect(
      frequentExpenses([e(1, "2026-10-01", 5, "food", "Tea", "income"), e(2, "2026-10-02", 5, "food", "Tea", "income")], "USD"),
    ).toEqual([]);
    expect(frequentExpenses(list, "INR")).toEqual([]);
  });
  it("respects the limit and minimum count and handles empty input", () => {
    expect(frequentExpenses(list, "USD", 1)).toHaveLength(1);
    expect(frequentExpenses(list, "USD", 4, 3)).toHaveLength(1);
    expect(frequentExpenses(null, "USD")).toEqual([]);
  });
  it("groups notes that are blank together by category", () => {
    const out = frequentExpenses([e(1, "2026-10-01", 3, "food", null), e(2, "2026-10-02", 4, "food", "")], "USD");
    expect(out).toEqual([{ category: "food", description: "", amount: 4, count: 2 }]);
  });
});

describe("filterEntries", () => {
  const list = [
    e(1, "2026-10-01", 5, "food", "Coffee shop"),
    e(2, "2026-10-02", 40, "transport", "Gas"),
    e(3, "2026-10-03", 9, "food", null),
  ];
  it("matches the note or the category, ignoring case", () => {
    expect(filterEntries(list, "COFFEE", "").map((x) => x.id)).toEqual([1]);
    expect(filterEntries(list, "food", "").map((x) => x.id)).toEqual([1, 3]);
  });
  it("filters by exact category and combines with the search", () => {
    expect(filterEntries(list, "", "transport").map((x) => x.id)).toEqual([2]);
    expect(filterEntries(list, "shop", "food").map((x) => x.id)).toEqual([1]);
  });
  it("uses the display label too", () => {
    expect(filterEntries(list, "getting around", "", (c) => (c === "transport" ? "Getting around" : c)).map((x) => x.id)).toEqual([2]);
  });
  it("returns everything for blank filters and tolerates missing input", () => {
    expect(filterEntries(list, "  ", "")).toHaveLength(3);
    expect(filterEntries(undefined, "x", "")).toEqual([]);
  });
});

import { filterByAmount, biggestFirst } from "../filterEntries";

describe("filterByAmount and biggestFirst", () => {
  const rows = [
    { id: 1, amount: 5, entryDate: "2026-10-01" },
    { id: 2, amount: 50, entryDate: "2026-10-02" },
    { id: 3, amount: 500, entryDate: "2026-10-03" },
    { id: 4, amount: 50, entryDate: "2026-10-09" },
  ];
  it("keeps amounts inside the bounds, inclusive", () => {
    expect(filterByAmount(rows, "10", "100").map((r) => r.id)).toEqual([2, 4]);
    expect(filterByAmount(rows, "50", "50").map((r) => r.id)).toEqual([2, 4]);
  });
  it("treats blank or invalid bounds as no limit", () => {
    expect(filterByAmount(rows, "", "").length).toBe(4);
    expect(filterByAmount(rows, "abc", "").length).toBe(4);
    expect(filterByAmount(rows, "100", "").map((r) => r.id)).toEqual([3]);
    expect(filterByAmount(null, "", "")).toEqual([]);
  });
  it("sorts biggest first, newest first on ties, without changing the input", () => {
    expect(biggestFirst(rows).map((r) => r.id)).toEqual([3, 4, 2, 1]);
    expect(rows[0].id).toBe(1);
  });
});
