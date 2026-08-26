import { describe, it, expect } from "vitest";
import {
  safeNumber,
  currencyForCountry,
  formatCurrencyForDisplay,
  formatCurrencyCompact,
  formatPercent,
  formatNumber,
  formatCompactNumber,
} from "../formatters";

describe("safeNumber", () => {
  it("passes through a real number", () => {
    expect(safeNumber(42.5)).toBe(42.5);
  });
  it("parses a numeric string", () => {
    expect(safeNumber("42.5")).toBe(42.5);
  });
  it("defaults null/undefined/NaN to 0", () => {
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber("not a number")).toBe(0);
  });
});

describe("currencyForCountry", () => {
  it("maps known countries", () => {
    expect(currencyForCountry("United States")).toBe("USD");
    expect(currencyForCountry("India")).toBe("INR");
    expect(currencyForCountry("Australia")).toBe("AUD");
  });
  it("defaults unknown countries to USD", () => {
    expect(currencyForCountry("Atlantis")).toBe("USD");
  });
});

describe("formatCurrencyForDisplay", () => {
  it("formats a positive value with thousands separators and currency code", () => {
    expect(formatCurrencyForDisplay(12345, "USD")).toBe("$12,345 USD");
  });
  it("formats a negative value with the sign before the symbol", () => {
    expect(formatCurrencyForDisplay(-500, "USD")).toBe("-$500 USD");
  });
  it("omits the currency code when includeCode is false", () => {
    expect(formatCurrencyForDisplay(500, "USD", { includeCode: false })).toBe("$500");
  });
  it("uses the rupee symbol for INR", () => {
    expect(formatCurrencyForDisplay(1000, "INR")).toBe("₹1,000 INR");
  });
});

describe("formatCurrencyCompact", () => {
  it("shows full value under 1000", () => {
    expect(formatCurrencyCompact(500, "USD")).toBe("$500 USD");
  });
  it("shows whole K for thousands", () => {
    expect(formatCurrencyCompact(24000, "USD")).toBe("$24K USD");
  });
  // Regression: rounded to whole millions with Math.round(), so
  // $1,786,100.84 (a real production net-worth figure) showed as "$2M" --
  // a ~12% overstatement -- and directly contradicted this function's own
  // documented example ("$2.4M USD" for a $2.4M value).
  it("keeps one decimal of precision for millions", () => {
    expect(formatCurrencyCompact(2400000, "USD")).toBe("$2.4M USD");
    expect(formatCurrencyCompact(1786100.84, "USD")).toBe("$1.8M USD");
  });
  it("trims a trailing .0 for an exact round number of millions", () => {
    expect(formatCurrencyCompact(2000000, "USD")).toBe("$2M USD");
  });
  it("preserves the negative sign for a compact million-scale value", () => {
    expect(formatCurrencyCompact(-2400000, "USD")).toBe("-$2.4M USD");
  });
});

describe("formatPercent", () => {
  it("formats to the given decimal places with a % sign", () => {
    expect(formatPercent(12.3456, 2)).toBe("12.35%");
  });
  it("defaults to 2 decimals", () => {
    expect(formatPercent(5)).toBe("5.00%");
  });
  it("never renders scientific notation for an extreme value", () => {
    expect(formatPercent(1e30)).not.toMatch(/e\+/);
  });
});

describe("formatNumber", () => {
  it("formats to the given decimal places", () => {
    expect(formatNumber(3.14159, 2)).toBe("3.14");
  });
});

describe("formatCompactNumber", () => {
  it("formats billions/millions/thousands with 2 decimals", () => {
    expect(formatCompactNumber(2_400_000_000)).toBe("2.40B");
    expect(formatCompactNumber(2_400_000)).toBe("2.40M");
    expect(formatCompactNumber(2_400)).toBe("2.40K");
  });
  it("formats sub-thousand values with 2 decimals, no suffix", () => {
    expect(formatCompactNumber(42)).toBe("42.00");
  });
});
