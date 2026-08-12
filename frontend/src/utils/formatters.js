/**
 * Utility functions for formatting numbers, currencies, and percentages
 * Ensures no NaN values are displayed
 */

/**
 * Safely convert to number, defaulting to 0 for invalid values
 */
export function safeNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "number" ? value : parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Format currency with $ symbol (default/base currency)
 * Rounded to whole numbers (no decimals)
 */
export function formatCurrency(value, decimals = 0) {
  const num = Math.round(safeNumber(value)); // Round to whole number
  return `$${num.toLocaleString('en-US')}`;
}

/**
 * Map countries to their display currency (no conversion, just labeling)
 */
const COUNTRY_CURRENCY = {
  "United States": { symbol: "$", code: "USD" },
  Australia: { symbol: "$", code: "AUD" },
  India: { symbol: "₹", code: "INR" },
};

/**
 * Format currency using the country's display currency.
 * NOTE: This does NOT convert between currencies, it only changes the label.
 * Rounded to whole numbers (no decimals)
 */
export function formatCurrencyForCountry(value, country, decimals = 0, options = {}) {
  const { includeCode = false } = options;
  const num = Math.round(safeNumber(value)); // Round to whole number
  const config = COUNTRY_CURRENCY[country] || COUNTRY_CURRENCY["United States"];
  const base = `${config.symbol}${num.toLocaleString('en-US')}`;
  return includeCode ? `${base} ${config.code}` : base;
}

// Global display currency (for top-level dashboard cards)
const DISPLAY_CURRENCY = {
  USD: { symbol: "$", label: "USD" },
  AUD: { symbol: "$", label: "AUD" },
  INR: { symbol: "₹", label: "INR" },
};

// Currency conversion rates (approximate, can be updated with real-time rates)
// Rates are: 1 USD = X units of other currency
const CURRENCY_RATES_TO_USD = {
  USD: 1.0,
  AUD: 1.5, // 1 USD = 1.5 AUD
  INR: 83.0, // 1 USD = 83 INR
};

/**
 * Convert a value from one currency to another
 * @param {number} value - The value to convert
 * @param {string} fromCurrency - Source currency code (USD, AUD, INR)
 * @param {string} toCurrency - Target currency code (USD, AUD, INR)
 * @returns {number} - Converted value
 */
export function convertCurrency(value, fromCurrency, toCurrency) {
  try {
    const num = safeNumber(value);
    if (!fromCurrency || !toCurrency) return num;
    if (fromCurrency === toCurrency) return num;
    
    // Convert to USD first (base currency)
    const fromRate = CURRENCY_RATES_TO_USD[fromCurrency] || 1.0;
    if (fromRate <= 0) return num; // Prevent division by zero
    
    const valueInUSD = num / fromRate;
    
    // Convert from USD to target currency
    const toRate = CURRENCY_RATES_TO_USD[toCurrency] || 1.0;
    if (toRate <= 0) return num; // Prevent invalid conversion
    
    const result = valueInUSD * toRate;
    return isNaN(result) || !isFinite(result) ? num : result;
  } catch (e) {
    console.error("Currency conversion error:", e, { value, fromCurrency, toCurrency });
    return safeNumber(value);
  }
}

/**
 * Convert value from country currency to display currency
 * @param {number} value - The value in country's currency
 * @param {string} country - Country name
 * @param {string} displayCurrency - Target currency (USD, INR)
 * @returns {number} - Converted value
 */
export function convertCountryValueToDisplay(value, country, displayCurrency) {
  try {
    if (!country || !displayCurrency) return safeNumber(value);
    const countryCurrency = COUNTRY_CURRENCY[country]?.code || "USD";
    return convertCurrency(value, countryCurrency, displayCurrency);
  } catch (e) {
    console.error("Country value conversion error:", e, { value, country, displayCurrency });
    return safeNumber(value);
  }
}

export function formatCurrencyForDisplay(value, currency = "USD", decimals = 0) {
  const num = Math.round(safeNumber(value)); // Round to whole number
  const key = currency in DISPLAY_CURRENCY ? currency : "USD";
  const cfg = DISPLAY_CURRENCY[key];
  return `${cfg.symbol}${num.toLocaleString('en-US')} ${cfg.label}`;
}

/**
 * Format currency for dashboard cards: whole numbers with K/M notation and commas
 * Examples: $24,000 USD, $24K USD, $240K USD, $2.4M USD, ₹24,000 INR, ₹240K INR
 */
export function formatCurrencyCompact(value, currency = "USD") {
  const num = Math.round(safeNumber(value)); // Round to whole number
  const key = currency in DISPLAY_CURRENCY ? currency : "USD";
  const cfg = DISPLAY_CURRENCY[key];
  
  const absNum = Math.abs(num);
  let formatted;
  
  if (absNum >= 1000000) {
    // Millions: round to whole number (e.g., 2M, 24M)
    formatted = `${Math.round(absNum / 1000000)}M`;
  } else if (absNum >= 1000) {
    // Thousands: round to whole number (e.g., 24K, 240K)
    formatted = `${Math.round(absNum / 1000)}K`;
  } else {
    // Less than 1000: show as whole number with commas (e.g., 999, 24)
    formatted = absNum.toLocaleString('en-US');
  }
  
  // Add sign and currency symbol
  const sign = num < 0 ? '-' : '';
  return `${sign}${cfg.symbol}${formatted} ${cfg.label}`;
}

/**
 * Format percentage with % symbol
 */
export function formatPercent(value, decimals = 2) {
  const num = safeNumber(value);
  return `${num.toFixed(decimals)}%`;
}

/**
 * Format number with specified decimals
 */
export function formatNumber(value, decimals = 2) {
  const num = safeNumber(value);
  return num.toFixed(decimals);
}

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatCompactNumber(value) {
  const num = safeNumber(value);
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}
