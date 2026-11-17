/**
 * React Query client configuration
 */
import { MutationCache, QueryClient } from "@tanstack/react-query";
import { refreshMoneyViews } from "./utils/refreshMoneyViews";
import { ApiError } from "./api/client";

// client.js already gives a timed-out/network-level GET one full retry at
// a 100s cold-start timeout. Retrying again here would restart from a
// fresh 15s attempt — very unlikely to land mid cold-start — and roughly
// double the worst-case wait. So: skip this generic retry for that
// specific failure shape, but keep it for other errors (e.g. a real
// transient 500), where one quick retry is still worth it.
export function shouldRetryQuery(failureCount, error) {
  const alreadyRetriedForColdStart = error instanceof ApiError && (error.status === 408 || error.status === 0);
  if (alreadyRetriedForColdStart) return false;
  return failureCount < 1;
}

// Any successful change (add, edit, delete, payment, import) refreshes every number that depends on
// money, so net worth, accounts, cards and charts can never be left showing old values because one
// screen forgot to refresh them.
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => {
      refreshMoneyViews(queryClient);
    },
  }),
  defaultOptions: {
    queries: {
      // Prices update once a day and every change made in the app refreshes the money views itself,
      // so five minutes is safe. At one minute, each trip back to the tab re-ran every page query
      // against a server that has a small share of one CPU.
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: true, // coming back after the data is stale shows current numbers
      retry: shouldRetryQuery,
    },
  },
});
