import { isPrivacyOn, MASK } from "./privacy";

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

/** Formats a date as YYYY-MM-DD (ISO 8601) -- the one unambiguous
 * international standard, used everywhere a full date is shown so
 * nothing here depends on a browser's locale defaulting to day-first or
 * month-first. Accepts either the API's own "YYYY-MM-DD" (optionally
 * with a time component) date strings, in which case this just takes the
 * date portion directly rather than round-tripping through a Date object
 * (avoiding the UTC-vs-local parsing pitfall that a real Date object
 * would introduce for a plain date string), or an actual Date object for
 * the rare case one's already in hand client-side. */
export function formatDateISO(value: string | Date | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Today's date as YYYY-MM-DD in the user's own timezone. Do not use
 * new Date().toISOString().split("T")[0] for this: that is the UTC date, so
 * in the US evening it is already "tomorrow", and a form defaulting to it was
 * rejected by its own "date can't be in the future" check.
 */
export function todayISO(): string {
  return formatDateISO(new Date());
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

/** Amounts under this (in absolute value) keep their cents. Whole-dollar
 * rounding is right for a $26,237 position but turns a $0.12 cost basis
 * into "$0" and a $4.22 average cost into "$4", which reads as missing or
 * wrong data. */
const SMALL_AMOUNT_THRESHOLD = 10;

export function formatCurrencyForDisplay(
  value: unknown,
  currency: string = "USD",
  options: { includeCode?: boolean; alwaysCents?: boolean } = {},
): string {
  // alwaysCents is for everyday amounts (budget entries, subscriptions)
  // where the cents matter: $42.50 must not read as "$43".
  const { includeCode = true, alwaysCents = false } = options;
  if (isPrivacyOn()) return `${CURRENCY_SYMBOLS[currency] || "$"}${MASK}`;
  const raw = safeNumber(value);
  const abs = Math.abs(raw);
  const keepCents = alwaysCents || (abs > 0 && abs < SMALL_AMOUNT_THRESHOLD);
  const rounded = keepCents ? Math.round(abs * 100) / 100 : Math.round(abs);
  const symbol = CURRENCY_SYMBOLS[currency] || "$";
  const digits = keepCents ? 2 : 0;
  const body = rounded.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  // Sign from the rounded value, so a tiny negative that rounds to zero
  // never renders as "-$0".
  const base = `${raw < 0 && rounded > 0 ? "-" : ""}${symbol}${body}`;
  return includeCode ? `${base} ${currency}` : base;
}

/**
 * Compact currency for dashboard cards / tables: K/M notation.
 * Examples: $24,000 USD, $24K USD, $2.4M USD, ₹240K INR
 */
export function formatCurrencyCompact(value: unknown, currency: string = "USD"): string {
  if (isPrivacyOn()) return `${CURRENCY_SYMBOLS[currency] || "$"}${MASK}`;
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
  } else if (Math.abs(safeNumber(value)) > 0 && Math.abs(safeNumber(value)) < SMALL_AMOUNT_THRESHOLD) {
    // Rounded to a whole number this would read "$0" (or a misleading
    // "$1") for a real, tiny balance, so keep the cents.
    formatted = Math.abs(safeNumber(value)).toFixed(2);
  } else {
    formatted = absNum.toLocaleString("en-US");
  }

  const sign = safeNumber(value) < 0 && formatted !== "0" ? "-" : "";
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
