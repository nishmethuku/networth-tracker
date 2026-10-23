import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { logDueRecurring } from "../api";
import { useToast } from "../contexts/ToastContext";
import { useHousehold } from "../contexts/HouseholdContext";
import { todayISO } from "../utils/formatters";

export const AUTO_LOG_KEY = "nw_auto_log";
const LAST_RUN_KEY = "nw_auto_log_last";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * When the person has turned on "log my bills automatically", logs the recurring bills that came
 * due since the last entry, at most once a day per device. The server only adds what is actually
 * due, so several devices cannot log the same bill twice.
 */
export function useAutoLogRecurring(enabled: boolean) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { currentHouseholdId } = useHousehold();

  useEffect(() => {
    if (!enabled || read(AUTO_LOG_KEY) !== "1") return;
    const today = todayISO();
    if (read(LAST_RUN_KEY) === today) return;
    // Marked up front, so the effect re-running (a new toast object, a new render) cannot start a second call.
    try {
      localStorage.setItem(LAST_RUN_KEY, today);
    } catch {
      /* ignore */
    }
    logDueRecurring({ householdId: currentHouseholdId || undefined })
      .then((res: { count?: number }) => {
        if (res?.count) {
          for (const key of ["budget-entries", "budget-summary", "budget-subscriptions", "budget-year"]) {
            queryClient.invalidateQueries({ queryKey: [key] });
          }
          toast.success(`Logged ${res.count} recurring ${res.count === 1 ? "bill" : "bills"} that came due`);
        }
      })
      .catch(() => {
        // Try again next time the app opens.
        try {
          localStorage.removeItem(LAST_RUN_KEY);
        } catch {
          /* ignore */
        }
      });
  }, [enabled, currentHouseholdId, queryClient, toast]);
}
