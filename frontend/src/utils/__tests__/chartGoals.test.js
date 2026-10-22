import { describe, it, expect } from "vitest";
import { goalLinesForChart } from "../chartGoals";

const g = (id, targetAmount, currency = "USD") => ({ id, name: `G${id}`, targetAmount, currency });

describe("goalLinesForChart", () => {
  it("keeps near, same-currency goals ahead of the data, nearest first", () => {
    const r = goalLinesForChart([g(1, 100000), g(2, 50000), g(3, 40000, "INR"), g(4, 20000)], "USD", 34000);
    expect(r.map((x) => x.id)).toEqual([2]);
  });
  it("drops goals already reached or far beyond the chart", () => {
    expect(goalLinesForChart([g(1, 30000), g(2, 1000000)], "USD", 34000)).toEqual([]);
  });
  it("limits how many are drawn", () => {
    const r = goalLinesForChart([g(1, 40000), g(2, 50000), g(3, 60000)], "USD", 34000, 2, 2);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
  });
  it("handles missing input", () => {
    expect(goalLinesForChart(null, "USD", 100)).toEqual([]);
    expect(goalLinesForChart([g(1, 5)], "USD", 0)).toEqual([]);
  });
});
