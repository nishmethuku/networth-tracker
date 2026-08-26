import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const STORAGE_KEY = "default_display_currency";

/**
 * Reads the last-chosen display currency straight from localStorage,
 * without subscribing to changes — for callers that just need the
 * current value once (e.g. an initial API request) rather than a live
 * hook binding.
 * @returns the stored currency code, or "USD" if none has been set yet.
 */
export function getDefaultDisplayCurrency(): string {
  return localStorage.getItem(STORAGE_KEY) || "USD";
}

/**
 * The user's preferred display currency (USD/INR/AUD/...), persisted to
 * localStorage so it survives a reload. Same [value, setValue] shape as
 * useState.
 * @returns a tuple of the current currency code and its setter.
 */
export default function useDisplayCurrencyPreference(): [string, Dispatch<SetStateAction<string>>] {
  const [currency, setCurrencyState] = useState(getDefaultDisplayCurrency);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, currency);
  }, [currency]);

  return [currency, setCurrencyState];
}
