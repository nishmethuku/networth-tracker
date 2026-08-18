/**
 * React Query client configuration
 */
import { QueryClient } from "@tanstack/react-query";
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

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    },
  },
});
