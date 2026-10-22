import { describe, it, expect } from "vitest";
import { trimNegligibleStart } from "../chartRange";

const rows = (vals) => vals.map((v, i) => ({ date: `d${i}`, netWorth: v }));

describe("trimNegligibleStart", () => {
  it("drops the flat near-zero lead-in but keeps one point before the first real one", () => {
    const out = trimNegligibleStart(rows([24, 25, 26, 25, 1000, 20000, 34000]));
    expect(out.map((r) => r.netWorth)).toEqual([25, 1000, 20000, 34000]);
  });

  it("leaves data alone when it starts at a meaningful level", () => {
    const input = rows([30000, 31000, 34000]);
    expect(trimNegligibleStart(input)).toBe(input);
  });

  it("never trims when the latest value is zero or negative, or with fewer than 3 points", () => {
    const flat = rows([1, 2, 0]);
    expect(trimNegligibleStart(flat)).toBe(flat);
    const two = rows([1, 34000]);
    expect(trimNegligibleStart(two)).toBe(two);
  });

  it("keeps a single negligible point when only that one precedes the data", () => {
    const input = rows([10, 20000, 34000]);
    expect(trimNegligibleStart(input)).toBe(input);
  });
});
