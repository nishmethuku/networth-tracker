/**
 * Utility functions for formatting numbers, currencies, and percentages.
 * Currency *conversion* lives in contexts/RatesContext.jsx (live FX rates) —
 * this file only formats already-known-currency values for display.
 */

export function safeNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "number" ? value : parseFloat(value);
  return isNaN(num) ? 0 : num;
}

const CURRENCY_SYMBOLS = {
  USD: "$",
  AUD: "$",
  INR: "₹",
};

/** Map countries to their native currency (for labeling, not conversion) */
export function currencyForCountry(country) {
  const map = { "United States": "USD", Australia: "AUD", India: "INR" };
  return map[country] || "USD";
}

export function formatCurrencyForDisplay(value, currency = "USD", options = {}) {
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
export function formatCurrencyCompact(value, currency = "USD") {
  const num = Math.round(safeNumber(value));
  const symbol = CURRENCY_SYMBOLS[currency] || "$";
  const absNum = Math.abs(num);
  let formatted;

  if (absNum >= 1000000) {
    formatted = `${Math.round(absNum / 1000000)}M`;
  } else if (absNum >= 1000) {
    formatted = `${Math.round(absNum / 1000)}K`;
  } else {
    formatted = absNum.toLocaleString("en-US");
  }

  const sign = num < 0 ? "-" : "";
  return `${sign}${symbol}${formatted} ${currency}`;
}

export function formatPercent(value, decimals = 2) {
  const num = safeNumber(value);
  // toFixed silently switches to scientific notation for |num| >= 1e21 (a
  // documented JS quirk) — clamp first so a stray extreme value can never
  // render as something like "9.58e+52%" no matter what produced it.
  const clamped = Math.max(-1e15, Math.min(1e15, num));
  return `${clamped.toFixed(decimals)}%`;
}

export function formatNumber(value, decimals = 2) {
  const num = safeNumber(value);
  return num.toFixed(decimals);
}

export function formatCompactNumber(value) {
  const num = safeNumber(value);
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}
