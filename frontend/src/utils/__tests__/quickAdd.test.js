import { describe, it, expect, beforeEach } from "vitest";
import { validateQuickAdd, buildExpensePayload, yesterdayOf, loadLast, saveLast, QUICK_ADD_KEY } from "../quickAdd";

const base = { amount: "12.50", category: "food", description: "", date: "2026-10-22", currency: "USD", paidFrom: "" };

describe("validateQuickAdd", () => {
  it("accepts a normal expense", () => {
    expect(validateQuickAdd(base, "2026-10-22")).toBeNull();
  });
  it("rejects a missing or non-positive amount", () => {
    expect(validateQuickAdd({ ...base, amount: "" }, "2026-10-22")).toMatch(/amount/i);
    expect(validateQuickAdd({ ...base, amount: "0" }, "2026-10-22")).toMatch(/amount/i);
    expect(validateQuickAdd({ ...base, amount: "-4" }, "2026-10-22")).toMatch(/amount/i);
  });
  it("rejects a missing category, missing date and future date", () => {
    expect(validateQuickAdd({ ...base, category: "" }, "2026-10-22")).toMatch(/category/i);
    expect(validateQuickAdd({ ...base, date: "" }, "2026-10-22")).toMatch(/date/i);
    expect(validateQuickAdd({ ...base, date: "2026-10-23" }, "2026-10-22")).toMatch(/future/i);
  });
});

describe("buildExpensePayload", () => {
  it("builds a plain expense with a trimmed note", () => {
    const p = buildExpensePayload({ ...base, description: "  lunch  " });
    expect(p).toMatchObject({ entry_type: "expense", amount: 12.5, category: "food", description: "lunch", entry_date: "2026-10-22" });
    expect(p.funding_source_holding_id).toBeUndefined();
    expect(p.charge_liability_id).toBeUndefined();
  });
  it("sends a blank note as null", () => {
    expect(buildExpensePayload(base).description).toBeNull();
  });
  it("deducts from a cash account", () => {
    expect(buildExpensePayload({ ...base, paidFrom: "12" }).funding_source_holding_id).toBe(12);
  });
  it("charges a credit card", () => {
    const p = buildExpensePayload({ ...base, paidFrom: "card:5" });
    expect(p.charge_liability_id).toBe(5);
    expect(p.funding_source_holding_id).toBeUndefined();
  });
});

describe("yesterdayOf", () => {
  it("steps back one day across a month and year boundary", () => {
    expect(yesterdayOf("2026-10-22")).toBe("2026-10-21");
    expect(yesterdayOf("2026-03-01")).toBe("2026-02-28");
    expect(yesterdayOf("2026-01-01")).toBe("2025-12-31");
  });
});

describe("last used choices", () => {
  beforeEach(() => localStorage.clear());
  it("round trips and ignores junk", () => {
    expect(loadLast()).toEqual({});
    saveLast({ category: "food", paidFrom: "card:5" });
    expect(loadLast()).toEqual({ category: "food", paidFrom: "card:5" });
    localStorage.setItem(QUICK_ADD_KEY, "not json");
    expect(loadLast()).toEqual({});
    localStorage.setItem(QUICK_ADD_KEY, JSON.stringify({ category: 5 }));
    expect(loadLast()).toEqual({ category: undefined, paidFrom: undefined });
  });
});
