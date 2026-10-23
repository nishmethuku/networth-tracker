import { describe, it, expect } from "vitest";
import { suggestLimits, topNotes, weekdayPattern, noSpendStats, monthReview } from "../spendingPatterns";

const e = (id, entryDate, amount, category = "food", description = "", extra = {}) => ({
  id,
  entryDate,
  amount,
  category,
  description,
  entryType: "expense",
  currency: "USD",
  ...extra,
});

describe("suggestLimits", () => {
  const list = [
    e(1, "2026-07-10", 300, "food"),
    e(2, "2026-08-10", 330, "food"),
    e(3, "2026-09-10", 300, "food"),
    e(4, "2026-09-12", 90, "fun"),
    e(5, "2026-09-12", 600, "CC-payment"),
    e(6, "2026-09-12", 9, "tiny"),
    e(7, "2026-10-05", 999, "shopping"),
  ];
  it("averages the last three full months, rounds up and skips noise", () => {
    const out = suggestLimits(list, "2026-10-22", "USD");
    expect(out.map((s) => s.category)).toEqual(["food", "fun"]);
    expect(out[0]).toMatchObject({ average: 310, suggested: 310 });
    expect(out[1]).toMatchObject({ average: 30, suggested: 30 });
  });
  it("skips categories that already have a limit", () => {
    expect(suggestLimits(list, "2026-10-22", "USD", ["food"]).map((s) => s.category)).toEqual(["fun"]);
  });
  it("rounds up to a friendly number", () => {
    const out = suggestLimits([e(1, "2026-09-01", 301, "food")], "2026-10-22", "USD");
    expect(out[0].suggested).toBe(Math.ceil(100.33 / 10) * 10);
  });
  it("handles nothing", () => {
    expect(suggestLimits(null, "2026-10-22", "USD")).toEqual([]);
  });
});

describe("topNotes", () => {
  it("groups by note ignoring case and drops note-less entries", () => {
    const out = topNotes(
      [
        e(1, "2026-10-01", 10, "food", "Chipotle"),
        e(2, "2026-10-03", 12, "food", "chipotle"),
        e(3, "2026-10-04", 30, "fun", "Movie"),
        e(4, "2026-10-05", 99),
        e(5, "2026-09-05", 500, "food", "Old"),
      ],
      "2026-10",
      "USD",
    );
    expect(out).toEqual([
      { label: "Movie", total: 30, count: 1 },
      { label: "Chipotle", total: 22, count: 2 },
    ]);
  });
});

describe("weekdayPattern", () => {
  it("averages by weekday over whole weeks", () => {
    // 2026-10-22 is a Thursday. Window of 2 weeks starts Friday 2026-10-09.
    const out = weekdayPattern([e(1, "2026-10-09", 20), e(2, "2026-10-16", 40), e(3, "2026-10-01", 999)], "2026-10-22", "USD", 2);
    expect(out[5].average).toBe(30);
    expect(out[1].average).toBe(0);
    expect(out).toHaveLength(7);
  });
});

describe("noSpendStats", () => {
  it("counts quiet days and the current streak", () => {
    const out = noSpendStats([e(1, "2026-10-02", 5), e(2, "2026-10-05", 5)], "2026-10-08", "USD");
    expect(out).toEqual({ days: 6, elapsed: 8, streak: 3 });
  });
  it("starts the streak from yesterday when today has spending", () => {
    expect(noSpendStats([e(1, "2026-10-08", 5)], "2026-10-08", "USD").streak).toBe(7);
  });
  it("does not run back into the previous month", () => {
    expect(noSpendStats([], "2026-10-03", "USD")).toEqual({ days: 3, elapsed: 3, streak: 3 });
  });
});

describe("monthReview", () => {
  it("summarizes a month against the usual", () => {
    const list = [
      e(1, "2026-07-10", 100),
      e(2, "2026-08-10", 100),
      e(3, "2026-09-10", 100),
      e(4, "2026-10-02", 120),
      e(5, "2026-10-02", 30),
      e(6, "2026-10-09", 50, "fun"),
    ];
    const r = monthReview(list, "2026-10", "USD");
    expect(r.total).toBe(200);
    expect(r.activeDays).toBe(2);
    expect(r.perActiveDay).toBe(100);
    expect(r.biggest.id).toBe(4);
    expect(r.vsUsualPct).toBe(100);
  });
  it("is null with no spending and has no comparison without history", () => {
    expect(monthReview([], "2026-10", "USD")).toBeNull();
    expect(monthReview([e(1, "2026-10-02", 10)], "2026-10", "USD").vsUsualPct).toBeNull();
  });
});

import { planSplit, remainder } from "../splitExpense";

describe("planSplit and remainder", () => {
  it("keeps the first part and adds the rest when the parts add up", () => {
    const r = planSplit(50, [
      { category: "food", amount: 30 },
      { category: "household", amount: 20 },
    ]);
    expect(r).toEqual({ ok: true, keep: { category: "food", amount: 30 }, add: [{ category: "household", amount: 20 }] });
  });
  it("adds up to the cent despite floating point", () => {
    expect(
      planSplit(0.3, [
        { category: "a", amount: 0.1 },
        { category: "b", amount: 0.2 },
      ]).ok,
    ).toBe(true);
  });
  it("says what is missing or extra", () => {
    expect(
      planSplit(50, [
        { category: "a", amount: 10 },
        { category: "b", amount: 20 },
      ]),
    ).toMatchObject({ ok: false, message: "20.00 is still unassigned." });
    expect(
      planSplit(50, [
        { category: "a", amount: 40 },
        { category: "b", amount: 20 },
      ]),
    ).toMatchObject({ ok: false, message: "The parts are 10.00 over the total." });
  });
  it("needs two parts with a category and an amount", () => {
    expect(planSplit(50, [{ category: "a", amount: 50 }]).ok).toBe(false);
    expect(
      planSplit(50, [
        { category: "", amount: 25 },
        { category: "b", amount: 25 },
      ]).ok,
    ).toBe(false);
  });
  it("works out the remainder", () => {
    expect(remainder(50, [{ category: "a", amount: 30.25 }])).toBe(19.75);
    expect(remainder(50, [{ category: "a", amount: 80 }])).toBe(0);
  });
});
