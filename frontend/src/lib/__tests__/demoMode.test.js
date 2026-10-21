import { describe, it, expect, beforeEach } from "vitest";
import { isDemoMode, enterDemoMode, exitDemoMode, demoGet } from "../demoMode";

describe("demo mode flag", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("is off until entered, and off again after exiting", () => {
    expect(isDemoMode()).toBe(false);
    enterDemoMode();
    expect(isDemoMode()).toBe(true);
    exitDemoMode();
    expect(isDemoMode()).toBe(false);
  });
});

describe("demo sample data", () => {
  it("has a dashboard whose net worth is assets minus liabilities", () => {
    const d = demoGet("/dashboard");
    expect(d.total_net_worth).toBe(d.total_assets - d.total_liabilities);
  });

  it("allocation adds up to total assets", () => {
    const d = demoGet("/dashboard");
    const sum = d.allocation_by_type.reduce((s, a) => s + a.value, 0);
    expect(sum).toBe(d.total_assets);
  });

  it("holdings add up to the dashboard's total assets", () => {
    const total = demoGet("/holdings").reduce((s, h) => s + h.display_value, 0);
    expect(total).toBe(demoGet("/dashboard").total_assets);
  });

  it("income summary total matches its months and holdings", () => {
    const inc = demoGet("/income-summary");
    expect(inc.by_month).toHaveLength(12);
    expect(inc.by_holding.reduce((s, h) => s + h.total, 0)).toBe(inc.total);
  });

  it("paginates transactions like the real endpoint", () => {
    const page = demoGet("/transactions?page=1&per_page=3");
    expect(page.items).toHaveLength(3);
    expect(page.total_pages).toBeGreaterThan(0);
  });

  it("answers unknown endpoints with an empty list", () => {
    expect(demoGet("/something-new")).toEqual([]);
  });
});
