import type { QueryClient } from "@tanstack/react-query";

// Everything an expense or income entry can change: the lists and totals on the Expenses and Budget
// pages, plus the account, card and net worth numbers it moves when it is paid from an account.
const KEYS = [
  "budget-entries",
  "budget-summary",
  "budget-subscriptions",
  "budget-limits",
  "liabilities",
  "holdings",
  "holding",
  "holding-valuations",
  "dashboard",
  "net-worth-history",
  "monthly-flow",
  "emergency-fund",
];

/** Call after adding, editing, deleting, undoing or splitting an entry so nothing on screen goes stale. */
export function refreshMoneyViews(queryClient: QueryClient) {
  for (const key of KEYS) queryClient.invalidateQueries({ queryKey: [key] });
}
