import { describe, it, expect } from "vitest";
import { holdingSchema } from "../holdingSchema";

const base = {
  assetType: "stock",
  country: "United States",
  currency: "USD",
  account: "",
  notes: "",
  tags: "",
  date: "2024-01-01",
  symbol: "",
  name: "",
  institution: "",
  interest_rate: "",
  maturity_date: "",
  quantity: "",
  price_per_unit: "",
  value: "",
};

describe("holdingSchema", () => {
  it("requires symbol and positive quantity/price for a stock", () => {
    const result = holdingSchema.safeParse({ ...base });
    expect(result.success).toBe(false);
    const paths = result.error.issues.map((i) => i.path[0]);
    expect(paths).toContain("symbol");
    expect(paths).toContain("quantity");
    expect(paths).toContain("price_per_unit");
  });

  it("passes for a fully filled-in stock purchase", () => {
    const result = holdingSchema.safeParse({ ...base, symbol: "AAPL", quantity: "10", price_per_unit: "150" });
    expect(result.success).toBe(true);
  });

  it("rejects zero or negative quantity", () => {
    const result = holdingSchema.safeParse({ ...base, symbol: "AAPL", quantity: "0", price_per_unit: "150" });
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path[0] === "quantity")).toBe(true);
  });

  it("allows price_per_unit of exactly 0 (e.g. a gifted share)", () => {
    const result = holdingSchema.safeParse({ ...base, symbol: "AAPL", quantity: "5", price_per_unit: "0" });
    expect(result.success).toBe(true);
  });

  it("requires name for a real_estate holding, not symbol", () => {
    const result = holdingSchema.safeParse({ ...base, assetType: "real_estate", value: "500000" });
    expect(result.success).toBe(false);
    const paths = result.error.issues.map((i) => i.path[0]);
    expect(paths).toContain("name");
    expect(paths).not.toContain("symbol");
  });

  it("passes for a fully filled-in cash holding", () => {
    const result = holdingSchema.safeParse({ ...base, assetType: "cash", name: "Checking", value: "1000" });
    expect(result.success).toBe(true);
  });

  it("rejects a negative value for valuation-based types", () => {
    const result = holdingSchema.safeParse({ ...base, assetType: "cash", name: "Checking", value: "-50" });
    expect(result.success).toBe(false);
  });

  it("rejects a future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const result = holdingSchema.safeParse({
      ...base,
      symbol: "AAPL",
      quantity: "1",
      price_per_unit: "1",
      date: future.toISOString().split("T")[0],
    });
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path[0] === "date")).toBe(true);
  });

  it("requires country", () => {
    const result = holdingSchema.safeParse({ ...base, country: "" });
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path[0] === "country")).toBe(true);
  });
});
