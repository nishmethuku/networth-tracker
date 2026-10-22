import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createBudgetEntry } from "../api";
import { useToast } from "../contexts/ToastContext";
import { loadPending, removePending } from "../utils/pendingExpenses";

/**
 * Sends expenses that were saved on this device while offline. Runs when the
 * app opens and whenever the connection comes back. It stops at the first
 * request that cannot reach the server, and drops one the server refuses
 * (for example a category that no longer exists) so it does not block the rest.
 */
export default function useSyncPendingExpenses(enabled: boolean) {
  const queryClient = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!enabled) return;
    let running = false;

    async function flush() {
      if (running || loadPending().length === 0) return;
      running = true;
      let sent = 0;
      let dropped = 0;
      try {
        for (const item of loadPending()) {
          try {
            await createBudgetEntry(item.payload);
            removePending(item.id);
            sent += 1;
          } catch (err: any) {
            if (err?.status === 0 || err?.status === 408 || err?.status >= 500) break; // try again later
            removePending(item.id);
            dropped += 1;
          }
        }
      } finally {
        running = false;
      }
      if (sent > 0) {
        for (const key of ["budget-entries", "budget-summary", "liabilities", "holdings", "dashboard"]) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        toast.success(`Synced ${sent} expense${sent === 1 ? "" : "s"} saved while you were offline`);
      }
      if (dropped > 0)
        toast.error(`${dropped} saved expense${dropped === 1 ? "" : "s"} could not be added and ${dropped === 1 ? "was" : "were"} removed`);
      window.dispatchEvent(new Event("nw:pending-changed"));
    }

    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
