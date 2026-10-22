import { describe, it, expect } from "vitest";
import { priceFreshness } from "../priceFreshness";

describe("priceFreshness", () => {
  it("is fresh when the newest price is today or yesterday on a weekday", () => {
    // 2026-10-22 is a Thursday
    expect(priceFreshness("2026-10-22", "2026-10-22")).toEqual({ asOf: "2026-10-22", daysOld: 0, stale: false });
    expect(priceFreshness("2026-10-21", "2026-10-22").stale).toBe(false);
  });
  it("is stale when weekdays have passed without an update", () => {
    expect(priceFreshness("2026-10-19", "2026-10-22")).toMatchObject({ daysOld: 3, stale: true });
  });
  it("allows the weekend gap", () => {
    // Monday 2026-10-26 with Friday's prices
    expect(priceFreshness("2026-10-23", "2026-10-26").stale).toBe(false);
    // Sunday 2026-10-25 with Friday's prices
    expect(priceFreshness("2026-10-23", "2026-10-25").stale).toBe(false);
    // Tuesday with Friday's prices is stale
    expect(priceFreshness("2026-10-23", "2026-10-27").stale).toBe(true);
  });
  it("returns null for missing or future dates", () => {
    expect(priceFreshness(null, "2026-10-22")).toBeNull();
    expect(priceFreshness("2026-10-30", "2026-10-22")).toBeNull();
    expect(priceFreshness("garbage", "2026-10-22")).toBeNull();
  });
});
