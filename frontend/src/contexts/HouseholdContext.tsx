/**
 * Which household's data the app is currently viewing -- null means "my
 * own data" (the default). Every page that supports a shared view reads
 * currentHouseholdId from here rather than each maintaining its own
 * switcher, so picking a household in one place (the nav) changes what
 * every page shows.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHouseholds } from "../api";
import { useAuth } from "./AuthContext";
import type { Household } from "../api/mappers";

const STORAGE_KEY = "current_household_id";

interface HouseholdContextValue {
  households: Household[];
  loading: boolean;
  currentHouseholdId: string | null;
  currentHousehold: Household | null;
  setCurrentHouseholdId: (id: string | null) => void;
}

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentHouseholdId, setCurrentHouseholdIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY) || null);

  const { data: households, isLoading } = useQuery<(Household | null)[]>({
    queryKey: ["households"],
    queryFn: fetchHouseholds,
    enabled: !!user,
    staleTime: 1000 * 60,
  });

  const list = (households || []).filter((h): h is Household => h != null);

  // If the previously-selected household was left/deleted/no longer
  // exists, fall back to "my data" rather than silently querying every
  // page against a household_id that now 403s.
  useEffect(() => {
    if (!isLoading && currentHouseholdId && !list.some((h) => h.id === currentHouseholdId)) {
      setCurrentHouseholdIdState(null);
      localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, currentHouseholdId, households]);

  function setCurrentHouseholdId(id: string | null) {
    setCurrentHouseholdIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }

  const currentHousehold = list.find((h) => h.id === currentHouseholdId) || null;

  return (
    <HouseholdContext.Provider
      value={{ households: list, loading: isLoading, currentHouseholdId, currentHousehold, setCurrentHouseholdId }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold(): HouseholdContextValue {
  const context = useContext(HouseholdContext);
  if (!context) {
    throw new Error("useHousehold must be used within HouseholdProvider");
  }
  return context;
}
