import type { EntryLike } from "./entryGroups";

export interface ExpenseLike extends EntryLike {
  description?: string | null;
}

export interface FrequentExpense {
  category: string;
  description: string;
  /** The most recent amount logged for this category and note. */
  amount: number;
  count: number;
}

/**
 * The expenses you log again and again (same category and note), most
 * frequent first, so they can be added with one tap. Only expenses in
 * `currency` count, and something must have been logged at least `minCount`
 * times. The amount used is the latest one, since prices drift.
 */
export function frequentExpenses<T extends ExpenseLike>(
  entries: T[] | null | undefined,
  currency: string,
  limit = 4,
  minCount = 2,
): FrequentExpense[] {
  const groups = new Map<string, { category: string; description: string; amount: number; latest: string; count: number }>();
  for (const e of entries ?? []) {
    if (e.entryType !== "expense" || e.currency !== currency || !(e.amount > 0)) continue;
    const description = (e.description ?? "").trim();
    const key = `${e.category}\u0000${description.toLowerCase()}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { category: e.category, description, amount: e.amount, latest: e.entryDate, count: 1 });
    } else {
      g.count += 1;
      if (e.entryDate >= g.latest) {
        g.latest = e.entryDate;
        g.amount = e.amount;
        g.description = description || g.description;
      }
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= minCount)
    .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest))
    .slice(0, limit)
    .map(({ category, description, amount, count }) => ({ category, description, amount, count }));
}
