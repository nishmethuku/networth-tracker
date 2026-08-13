/**
 * Live exchange rates, fetched once from the backend (which caches them from
 * frankfurter.app) and shared via context so every component can convert
 * currencies without hardcoding FX rates or re-fetching on every toggle.
 */
import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchExchangeRates } from "../api";
import { safeNumber } from "../utils/formatters";

const RatesContext = createContext();

export function RatesProvider({ children }) {
  const { data, isLoading } = useQuery({
    queryKey: ["exchange-rates", "USD"],
    queryFn: () => fetchExchangeRates("USD"),
    staleTime: 1000 * 60 * 60, // 1 hour — FX rates don't need to be second-fresh
  });

  // rates are all "1 USD = X <currency>"
  const rates = data?.rates || { USD: 1 };

  function convert(amount, fromCurrency, toCurrency) {
    const value = safeNumber(amount);
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return value;
    const fromRate = rates[fromCurrency];
    const toRate = rates[toCurrency];
    if (!fromRate || !toRate) return value; // rate not available yet — show unconverted rather than crash
    return (value / fromRate) * toRate;
  }

  return (
    <RatesContext.Provider value={{ rates, convert, loading: isLoading }}>
      {children}
    </RatesContext.Provider>
  );
}

export function useRates() {
  const context = useContext(RatesContext);
  if (!context) {
    throw new Error("useRates must be used within RatesProvider");
  }
  return context;
}
