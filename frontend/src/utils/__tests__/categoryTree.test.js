import { describe, it, expect } from "vitest";
import { groupBreakdown, orderCategoryOptions } from "../categoryTree";

describe("groupBreakdown", () => {
  it("adds subcategories to their parent and sorts by total", () => {
    const out = groupBreakdown([
      { category: "food", amount: 300 },
      { category: "utilities", amount: 100 },
      { category: "cellphone", amount: 80, parent: "utilities" },
      { category: "water", amount: 150, parent: "utilities" },
    ]);
    expect(out.map((g) => g.category)).toEqual(["utilities", "food"]);
    expect(out[0]).toMatchObject({ own: 100, total: 330 });
    expect(out[0].children.map((c) => c.category)).toEqual(["water", "cellphone"]);
  });
  it("creates a parent row when the parent has no spending of its own", () => {
    const out = groupBreakdown([{ category: "water", amount: 40, parent: "utilities" }]);
    expect(out).toEqual([{ category: "utilities", own: 0, total: 40, children: [{ category: "water", amount: 40 }] }]);
  });
  it("ignores empty, zero and negative rows", () => {
    expect(groupBreakdown(null)).toEqual([]);
    expect(
      groupBreakdown([
        { category: "a", amount: 0 },
        { category: "b", amount: -5 },
      ]),
    ).toEqual([]);
  });
});

describe("orderCategoryOptions", () => {
  it("places each subcategory right after its parent", () => {
    const out = orderCategoryOptions(["housing", "utilities", "food", "cellphone"], { cellphone: "utilities" });
    expect(out.map((o) => o.value)).toEqual(["housing", "utilities", "cellphone", "food"]);
    expect(out[2].label).toBe("utilities › cellphone");
    expect(out[2].parent).toBe("utilities");
  });
  it("keeps a subcategory at the top level when its parent is missing", () => {
    const out = orderCategoryOptions(["cellphone"], { cellphone: "gone" });
    expect(out).toEqual([{ value: "cellphone", label: "cellphone", parent: null }]);
  });
  it("works with no parents and uses the label function", () => {
    const out = orderCategoryOptions(["food"], undefined, (n) => n.toUpperCase());
    expect(out[0].label).toBe("FOOD");
  });
});
