import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBudgetEntries } from "../api";
import { formatDateISO } from "../utils/formatters";

/** Roughly the last six months of entries, shared by the dashboard card, quick add and the Expenses insights. */
export function useRecentEntries(householdId: string | undefined, enabled = true) {
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 190);
    return formatDateISO(d);
  }, []);
  return useQuery({
    queryKey: ["budget-entries", householdId, "recent-190"],
    queryFn: () => fetchBudgetEntries({ householdId, dateFrom: since }),
    enabled,
    staleTime: 30_000,
  });
}
