import { describe, it, expect } from "vitest";
import { parseQuickEntry } from "../quickEntryParser";
import { buildCalendar } from "../spendCalendar";
import { categoryChanges } from "../categoryChanges";
import { safeToSpend, typicalIncome } from "../safeToSpend";
import { detectRecurring } from "../detectRecurring";
import { spendSummary, weekStart } from "../spendSummary";
import { groupByDay } from "../entryGroups";

// 2026-10-22 is a Thursday.
const ctx = {
  today: "2026-10-22",
  categories: ["food", "transport", "utilities"],
  frequent: [{ category: "food", description: "Coffee" }],
};

describe("parseQuickEntry", () => {
  it("finds the amount, a day word and the note", () => {
    expect(parseQuickEntry("coffee 4.50 yesterday", ctx)).toEqual({
      amount: 4.5,
      date: "2026-10-21",
      description: "Coffee",
      category: "food",
    });
  });
  it("accepts a currency sign and any word order", () => {
    expect(parseQuickEntry("$12 lunch", ctx)).toMatchObject({ amount: 12, description: "Lunch" });
    expect(parseQuickEntry("₹250 auto", ctx)).toMatchObject({ amount: 250, description: "Auto" });
    expect(parseQuickEntry("12$ lunch today", ctx)).toMatchObject({ amount: 12, date: "2026-10-22" });
  });
  it("understands weekday names as the most recent past one", () => {
    expect(parseQuickEntry("gas 40 mon", ctx).date).toBe("2026-10-19");
    expect(parseQuickEntry("gas 40 thursday", ctx).date).toBe("2026-10-15");
    expect(parseQuickEntry("gas 40 sun", ctx).date).toBe("2026-10-18");
  });
  it("understands N days ago", () => {
    expect(parseQuickEntry("movie 15 3 days ago", ctx)).toMatchObject({ amount: 15, date: "2026-10-19", description: "Movie" });
    expect(parseQuickEntry("movie 15 1 day ago", ctx).date).toBe("2026-10-21");
  });
  it("matches a category by name or from frequent notes", () => {
    expect(parseQuickEntry("transport 8", ctx).category).toBe("transport");
    expect(parseQuickEntry("uber transport 8", ctx).category).toBe("transport");
    expect(parseQuickEntry("coffee 3", ctx).category).toBe("food");
  });
  it("leaves out what it cannot find", () => {
    expect(parseQuickEntry("hello", ctx)).toEqual({ amount: undefined, date: undefined, description: "Hello", category: undefined });
    expect(parseQuickEntry("", ctx)).toEqual({ amount: undefined, date: undefined, description: "", category: undefined });
    expect(parseQuickEntry("0 free", ctx).amount).toBeUndefined();
  });
  it("only takes the first number as the amount", () => {
    expect(parseQuickEntry("table 4 for 2 total 80", ctx).amount).toBe(4);
  });
});

describe("buildCalendar", () => {
  const e = (d, amount, category = "food", entryType = "expense", currency = "USD") => ({
    id: d + amount,
    entryDate: d,
    amount,
    category,
    entryType,
    currency,
  });
  it("lays out Sunday-first weeks with blanks around the month", () => {
    const weeks = buildCalendar([], "2026-10", "USD");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // Oct 1 2026 is a Thursday.
    expect(weeks[0].slice(0, 4).every((c) => c.date === null)).toBe(true);
    expect(weeks[0][4].date).toBe("2026-10-01");
    expect(weeks.flat().filter((c) => c.date).length).toBe(31);
  });
  it("scales intensity to the busiest day and skips card payments, income and other currencies", () => {
    const cells = buildCalendar(
      [
        e("2026-10-05", 100),
        e("2026-10-06", 25),
        e("2026-10-07", 900, "CC-payment"),
        e("2026-10-08", 50, "food", "income"),
        e("2026-10-09", 80, "food", "expense", "INR"),
      ],
      "2026-10",
      "USD",
    ).flat();
    const by = Object.fromEntries(cells.filter((c) => c.date).map((c) => [c.date, c]));
    expect(by["2026-10-05"].level).toBe(4);
    expect(by["2026-10-06"].level).toBe(1);
    expect(by["2026-10-07"].level).toBe(0);
    expect(by["2026-10-08"].level).toBe(0);
    expect(by["2026-10-09"].total).toBe(0);
  });
  it("handles a leap February", () => {
    expect(
      buildCalendar([], "2028-02", "USD")
        .flat()
        .filter((c) => c.date).length,
    ).toBe(29);
  });
});

describe("categoryChanges", () => {
  const e = (d, amount, category) => ({ id: d + category + amount, entryDate: d, amount, category, entryType: "expense", currency: "USD" });
  const list = [
    e("2026-09-03", 100, "food"),
    e("2026-09-20", 500, "food"),
    e("2026-09-05", 60, "transport"),
    e("2026-10-02", 200, "food"),
    e("2026-10-10", 20, "transport"),
    e("2026-10-15", 450, "shopping"),
  ];
  it("compares the same days of last month while this month is in progress", () => {
    const out = categoryChanges(list, "2026-10", "2026-10-22", "USD");
    // Through day 22: last month's food is 100 + 500 = 600.
    const food = out.find((c) => c.category === "food");
    expect(food).toMatchObject({ current: 200, previous: 600, delta: -400 });
    expect(out[0].category).toBe("shopping");
    expect(out.find((c) => c.category === "shopping").pct).toBeNull();
  });
  it("cuts last month off at today's day number", () => {
    const out = categoryChanges(list, "2026-10", "2026-10-10", "USD");
    expect(out.find((c) => c.category === "food")).toMatchObject({ previous: 100 });
  });
  it("uses whole months for a finished month and drops tiny moves", () => {
    const out = categoryChanges(list, "2026-10", "2026-11-05", "USD", 5, 50);
    expect(out.find((c) => c.category === "transport")).toBeUndefined();
  });
});

describe("safeToSpend", () => {
  it("sets aside bills and spreads the rest over the days left", () => {
    const r = safeToSpend({ incomeThisMonth: 5000, typicalIncome: 0, spent: 1500, dueThisMonth: 500, today: "2026-10-22" });
    expect(r.daysLeft).toBe(10);
    expect(r.available).toBe(3000);
    expect(r.perDay).toBe(300);
    expect(r.basis).toBe("this month");
  });
  it("uses a typical month when the paycheck has not landed", () => {
    const r = safeToSpend({ incomeThisMonth: 0, typicalIncome: 4000, spent: 1000, dueThisMonth: 0, today: "2026-10-31" });
    expect(r.basis).toBe("typical month");
    expect(r.daysLeft).toBe(1);
    expect(r.perDay).toBe(3000);
  });
  it("goes negative when already over and is null with no income", () => {
    expect(safeToSpend({ incomeThisMonth: 1000, typicalIncome: 0, spent: 1500, dueThisMonth: 0, today: "2026-10-22" }).perDay).toBeLessThan(
      0,
    );
    expect(safeToSpend({ incomeThisMonth: 0, typicalIncome: 0, spent: 10, dueThisMonth: 0, today: "2026-10-22" })).toBeNull();
  });
  it("averages recent complete months for typical income", () => {
    const months = [
      { month: "2026-07", income: 3000 },
      { month: "2026-08", income: 4000 },
      { month: "2026-09", income: 5000 },
      { month: "2026-10", income: 100 },
    ];
    expect(typicalIncome(months, "2026-10")).toBe(4000);
    expect(typicalIncome([], "2026-10")).toBe(0);
    expect(typicalIncome(null, "2026-10")).toBe(0);
  });
});

describe("detectRecurring", () => {
  const e = (id, entryDate, amount, description, extra = {}) => ({
    id,
    entryDate,
    amount,
    description,
    category: "entertainment",
    entryType: "expense",
    currency: "USD",
    ...extra,
  });
  it("suggests an expense that repeats about monthly", () => {
    const out = detectRecurring(
      [e(1, "2026-07-03", 15.99, "Netflix"), e(2, "2026-08-03", 15.99, "netflix"), e(3, "2026-09-02", 16.49, "Netflix")],
      "USD",
    );
    expect(out).toEqual([
      { category: "entertainment", description: "Netflix", frequency: "monthly", amount: 16.49, count: 3, latestEntryId: 3 },
    ]);
  });
  it("detects weekly patterns", () => {
    const out = detectRecurring(
      [e(1, "2026-10-01", 20, "Laundry"), e(2, "2026-10-08", 20, "Laundry"), e(3, "2026-10-15", 20, "Laundry")],
      "USD",
    );
    expect(out[0].frequency).toBe("weekly");
  });
  it("skips irregular, too few, varying-price, already-recurring and note-less entries", () => {
    expect(detectRecurring([e(1, "2026-07-03", 10, "A"), e(2, "2026-08-20", 10, "A"), e(3, "2026-09-02", 10, "A")], "USD")).toEqual([]);
    expect(detectRecurring([e(1, "2026-08-03", 10, "B"), e(2, "2026-09-03", 10, "B")], "USD")).toEqual([]);
    expect(detectRecurring([e(1, "2026-07-03", 10, "C"), e(2, "2026-08-03", 30, "C"), e(3, "2026-09-02", 10, "C")], "USD")).toEqual([]);
    expect(
      detectRecurring(
        [e(1, "2026-07-03", 10, "D"), e(2, "2026-08-03", 10, "D", { isRecurring: true }), e(3, "2026-09-02", 10, "D")],
        "USD",
      ),
    ).toEqual([]);
    expect(detectRecurring([e(1, "2026-07-03", 10, ""), e(2, "2026-08-03", 10, ""), e(3, "2026-09-02", 10, "")], "USD")).toEqual([]);
  });
  it("handles empty input", () => {
    expect(detectRecurring(null, "USD")).toEqual([]);
  });
});

describe("spendSummary and weekStart", () => {
  const e = (id, entryDate, amount, category, extra = {}) => ({
    id,
    entryDate,
    amount,
    category,
    entryType: "expense",
    currency: "USD",
    description: null,
    ...extra,
  });
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-10-22")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
  });
  const list = [
    e(1, "2026-10-22", 10, "food"),
    e(2, "2026-10-20", 30, "transport"),
    e(3, "2026-10-14", 50, "food"),
    e(4, "2026-10-02", 100, "housing"),
    e(5, "2026-10-21", 900, "CC-payment"),
    e(6, "2026-10-22", 5, "food", { currency: "INR" }),
    e(7, "2026-09-30", 70, "food"),
  ];
  it("totals today, this week, last week and this month, leaving out card payments and other currencies", () => {
    const s = spendSummary(list, "2026-10-22", "USD");
    expect(s.today).toBe(10);
    expect(s.week).toBe(40);
    expect(s.lastWeek).toBe(50);
    expect(s.month).toBe(190);
    expect(s.topCategories[0]).toEqual({ category: "housing", amount: 100 });
    expect(s.recent[0].id).toBe(1);
    expect(s.hasAny).toBe(true);
  });
  it("reports nothing for no entries", () => {
    expect(spendSummary([], "2026-10-22", "USD")).toMatchObject({ today: 0, month: 0, hasAny: false, recent: [] });
    expect(spendSummary(null, "2026-10-22", "USD").hasAny).toBe(false);
  });
});

describe("groupByDay without a month", () => {
  it("keeps every month when month is null", () => {
    const rows = [
      { id: 1, entryDate: "2026-09-30", entryType: "expense", amount: 5, currency: "USD", category: "food" },
      { id: 2, entryDate: "2026-10-01", entryType: "expense", amount: 6, currency: "USD", category: "food" },
    ];
    expect(groupByDay(rows, null, "USD").map((d) => d.date)).toEqual(["2026-10-01", "2026-09-30"]);
  });
});
