import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const STORAGE_KEY = "default_display_currency";

export function getDefaultDisplayCurrency(): string {
  return localStorage.getItem(STORAGE_KEY) || "USD";
}

export default function useDisplayCurrencyPreference(): [string, Dispatch<SetStateAction<string>>] {
  const [currency, setCurrencyState] = useState(getDefaultDisplayCurrency);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, currency);
  }, [currency]);

  return [currency, setCurrencyState];
}
