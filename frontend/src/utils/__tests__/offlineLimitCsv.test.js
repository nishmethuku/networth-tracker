import { describe, it, expect, beforeEach } from "vitest";
import { enqueuePending, loadPending, removePending, shouldQueue, PENDING_KEY } from "../pendingExpenses";
import { limitWarning } from "../limitWarning";
import { entriesToCsv } from "../entriesCsv";

describe("pending expenses", () => {
  beforeEach(() => localStorage.clear());
  it("stores, lists and removes queued expenses in order", () => {
    expect(loadPending()).toEqual([]);
    expect(enqueuePending({ amount: 5 })).toBe(true);
    expect(enqueuePending({ amount: 6 })).toBe(true);
    const list = loadPending();
    expect(list.map((p) => p.payload.amount)).toEqual([5, 6]);
    expect(new Set(list.map((p) => p.id)).size).toBe(2);
    removePending(list[0].id);
    expect(loadPending().map((p) => p.payload.amount)).toEqual([6]);
  });
  it("ignores junk in storage", () => {
    localStorage.setItem(PENDING_KEY, "nope");
    expect(loadPending()).toEqual([]);
    localStorage.setItem(PENDING_KEY, JSON.stringify([{ id: 1 }, { id: "a", payload: { x: 1 } }, null]));
    expect(loadPending().map((p) => p.id)).toEqual(["a"]);
  });
  it("stops accepting new ones at the cap", () => {
    for (let i = 0; i < 200; i++) enqueuePending({ i });
    expect(enqueuePending({ extra: true })).toBe(false);
    expect(loadPending()).toHaveLength(200);
  });
  it("queues only when the request never reached the server", () => {
    expect(shouldQueue({ status: 0 })).toBe(true);
    expect(shouldQueue({ status: 408 })).toBe(false);
    expect(shouldQueue({ status: 500 })).toBe(false);
    expect(shouldQueue({ status: 400 })).toBe(false);
    expect(shouldQueue(null)).toBe(false);
  });
});

describe("limitWarning", () => {
  const money = (v) => `$${v}`;
  const label = (c) => c.toUpperCase();
  const limits = [
    { category: "food", limit: 600, spent: 500, percent: 83.3 },
    { category: "housing", limit: 1000, spent: 1100, percent: 110 },
    { category: "fun", limit: 100, spent: 10, percent: 10 },
  ];
  it("warns when a category is close to its limit", () => {
    expect(limitWarning(limits, "food", null, label, money)).toBe("FOOD is at 83% of its $600 limit.");
  });
  it("says so when a limit is passed", () => {
    expect(limitWarning(limits, "housing", null, label, money)).toMatch(/over its \$1000 limit/);
  });
  it("stays quiet below 80 percent or with no limit", () => {
    expect(limitWarning(limits, "fun", null, label, money)).toBeNull();
    expect(limitWarning(limits, "transport", null, label, money)).toBeNull();
    expect(limitWarning(null, "food", null, label, money)).toBeNull();
  });
  it("also checks the parent category's limit", () => {
    expect(limitWarning(limits, "groceries", "food", label, money)).toMatch(/FOOD is at 83%/);
  });
});

describe("entriesToCsv", () => {
  it("writes a header and rows oldest first with quoting", () => {
    const csv = entriesToCsv([
      {
        id: 2,
        entryDate: "2026-10-05",
        entryType: "expense",
        category: "food",
        description: 'Lunch, "big"',
        amount: 12.5,
        currency: "USD",
      },
      { id: 1, entryDate: "2026-10-02", entryType: "income", category: "paycheck", description: null, amount: 100, currency: "USD" },
    ]);
    expect(csv).toBe(
      'date,type,category,note,amount,currency\n2026-10-02,income,paycheck,,100,USD\n2026-10-05,expense,food,"Lunch, ""big""",12.5,USD\n',
    );
  });
  it("gives only a header for no entries", () => {
    expect(entriesToCsv([])).toBe("date,type,category,note,amount,currency\n");
    expect(entriesToCsv(null)).toBe("date,type,category,note,amount,currency\n");
  });
  it("defuses a note that starts like a formula", () => {
    expect(
      entriesToCsv([
        { id: 1, entryDate: "2026-10-02", entryType: "expense", category: "food", description: "=SUM(A1)", amount: 1, currency: "USD" },
      ]),
    ).toContain("'=SUM(A1)");
  });
});
