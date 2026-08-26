/**
 * Live exchange rates, fetched once from the backend (which caches them from
 * frankfurter.app) and shared via context so every component can convert
 * currencies without hardcoding FX rates or re-fetching on every toggle.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchExchangeRates } from "../api";
import { safeNumber } from "../utils/formatters";
import { useAuth } from "./AuthContext";

interface ExchangeRatesResponse {
  base: string;
  rates: Record<string, number>;
}

interface RatesContextValue {
  rates: Record<string, number>;
  convert: (amount: unknown, fromCurrency: string | null | undefined, toCurrency: string | null | undefined) => number;
  loading: boolean;
}

const RatesContext = createContext<RatesContextValue | undefined>(undefined);

export function RatesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<ExchangeRatesResponse>({
    queryKey: ["exchange-rates", "USD"],
    queryFn: () => fetchExchangeRates("USD"),
    staleTime: 1000 * 60 * 60, // 1 hour — FX rates don't need to be second-fresh
    // Every route under /login and /reset-password renders with
    // RatesProvider still in the tree (it wraps the whole app in main.jsx),
    // so without this gate every unauthenticated page load fired a
    // doomed-to-401 request the moment the provider mounted, before auth
    // had even resolved.
    enabled: !!user,
  });

  // rates are all "1 USD = X <currency>"
  const rates = data?.rates || { USD: 1 };

  function convert(amount: unknown, fromCurrency: string | null | undefined, toCurrency: string | null | undefined): number {
    const value = safeNumber(amount);
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return value;
    const fromRate = rates[fromCurrency];
    const toRate = rates[toCurrency];
    if (!fromRate || !toRate) return value; // rate not available yet — show unconverted rather than crash
    return (value / fromRate) * toRate;
  }

  return <RatesContext.Provider value={{ rates, convert, loading: isLoading }}>{children}</RatesContext.Provider>;
}

export function useRates(): RatesContextValue {
  const context = useContext(RatesContext);
  if (!context) {
    throw new Error("useRates must be used within RatesProvider");
  }
  return context;
}
