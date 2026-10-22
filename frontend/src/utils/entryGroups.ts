import { isNonSpendingCategory } from "./nonSpending";

export interface EntryLike {
  id: number | string;
  entryDate: string; // YYYY-MM-DD
  entryType: "income" | "expense" | string;
  amount: number;
  currency: string;
  category: string;
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Moves a YYYY-MM month by whole months (negative goes back). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export interface DayGroup<T extends EntryLike> {
  date: string;
  entries: T[];
  /** Expenses that day in the given currency. */
  expenseTotal: number;
}

/**
 * Entries in one month, newest day first, with each day's expense total in
 * `currency`. Entries in other currencies are still listed but not summed.
 */
export function groupByDay<T extends EntryLike>(entries: T[] | null | undefined, month: string, currency: string): DayGroup<T>[] {
  const byDay = new Map<string, T[]>();
  for (const e of entries ?? []) {
    if (monthOf(e.entryDate) !== month) continue;
    byDay.set(e.entryDate, [...(byDay.get(e.entryDate) ?? []), e]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      entries: [...list].sort((a, b) => Number(b.id) - Number(a.id)),
      expenseTotal: list
        .filter((e) => e.entryType === "expense" && e.currency === currency && !isNonSpendingCategory(e.category))
        .reduce((s, e) => s + e.amount, 0),
    }));
}

/** Income and expense totals for a month in `currency`. */
export function monthTotals(entries: EntryLike[] | null | undefined, month: string, currency: string) {
  let income = 0;
  let expenses = 0;
  for (const e of entries ?? []) {
    if (monthOf(e.entryDate) !== month || e.currency !== currency) continue;
    if (e.entryType === "income") income += e.amount;
    else if (e.entryType === "expense" && !isNonSpendingCategory(e.category)) expenses += e.amount;
  }
  return { income, expenses };
}
