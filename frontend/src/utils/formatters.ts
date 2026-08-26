/**
 * Utility functions for formatting numbers, currencies, and percentages.
 * Currency *conversion* lives in contexts/RatesContext.jsx (live FX rates) —
 * this file only formats already-known-currency values for display.
 */

export type Currency = "USD" | "INR" | "AUD";

export function safeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "number" ? value : parseFloat(value as string);
  return isNaN(num) ? 0 : num;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  AUD: "$",
  INR: "₹",
};

/** Map countries to their native currency (for labeling, not conversion) */
export function currencyForCountry(country: string): Currency {
  const map: Record<string, Currency> = { "United States": "USD", Australia: "AUD", India: "INR" };
  return map[country] || "USD";
}

export function formatCurrencyForDisplay(value: unknown, currency: string = "USD", options: { includeCode?: boolean } = {}): string {
  const { includeCode = true } = options;
  const num = Math.round(safeNumber(value));
  const symbol = CURRENCY_SYMBOLS[currency] || "$";
  const base = `${num < 0 ? "-" : ""}${symbol}${Math.abs(num).toLocaleString("en-US")}`;
  return includeCode ? `${base} ${currency}` : base;
}

/**
 * Compact currency for dashboard cards / tables: K/M notation.
 * Examples: $24,000 USD, $24K USD, $2.4M USD, ₹240K INR
 */
export function formatCurrencyCompact(value: unknown, currency: string = "USD"): string {
  const num = Math.round(safeNumber(value));
  const symbol = CURRENCY_SYMBOLS[currency] || "$";
  const absNum = Math.abs(num);
  let formatted: string;

  if (absNum >= 1000000) {
    // One decimal of precision, not whole millions -- rounding to whole
    // millions overstates/understates by up to $500K, e.g. $1,786,100
    // ("$1.8M") used to round to "$2M", a ~12% error. Trim a trailing
    // ".0" so an exact round number (e.g. $2,000,000) still reads "$2M"
    // rather than "$2.0M", matching this function's own documented
    // examples ("$2.4M USD") either way.
    const millions = (absNum / 1000000).toFixed(1);
    formatted = `${millions.endsWith(".0") ? millions.slice(0, -2) : millions}M`;
  } else if (absNum >= 1000) {
    formatted = `${Math.round(absNum / 1000)}K`;
  } else {
    formatted = absNum.toLocaleString("en-US");
  }

  const sign = num < 0 ? "-" : "";
  return `${sign}${symbol}${formatted} ${currency}`;
}

export function formatPercent(value: unknown, decimals: number = 2): string {
  const num = safeNumber(value);
  // toFixed silently switches to scientific notation for |num| >= 1e21 (a
  // documented JS quirk) — clamp first so a stray extreme value can never
  // render as something like "9.58e+52%" no matter what produced it.
  const clamped = Math.max(-1e15, Math.min(1e15, num));
  return `${clamped.toFixed(decimals)}%`;
}

export function formatNumber(value: unknown, decimals: number = 2): string {
  const num = safeNumber(value);
  return num.toFixed(decimals);
}

export function formatCompactNumber(value: unknown): string {
  const num = safeNumber(value);
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}
