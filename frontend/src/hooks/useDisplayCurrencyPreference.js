import { useEffect, useState } from "react";

const STORAGE_KEY = "default_display_currency";

export function getDefaultDisplayCurrency() {
  return localStorage.getItem(STORAGE_KEY) || "USD";
}

export default function useDisplayCurrencyPreference() {
  const [currency, setCurrencyState] = useState(getDefaultDisplayCurrency);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, currency);
  }, [currency]);

  return [currency, setCurrencyState];
}
