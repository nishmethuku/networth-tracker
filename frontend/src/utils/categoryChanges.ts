import { isNonSpendingCategory } from "./nonSpending";
import { shiftMonth, type EntryLike } from "./entryGroups";

export interface CategoryChange {
  category: string;
  current: number;
  previous: number;
  delta: number;
  /** Percent change, or null when there was nothing last month. */
  pct: number | null;
}

/**
 * The categories whose spending moved most compared with the month before.
 * While a month is in progress, last month is cut off at the same day so the
 * two are comparable. Small moves (under `minDelta`) are left out.
 */
export function categoryChanges(
  entries: EntryLike[] | null | undefined,
  month: string,
  today: string,
  currency: string,
  limit = 3,
  minDelta = 10,
): CategoryChange[] {
  const prev = shiftMonth(month, -1);
  const throughDay = today.startsWith(`${month}-`) ? Number(today.slice(8, 10)) : 31;
  const cur = new Map<string, number>();
  const old = new Map<string, number>();
  for (const e of entries ?? []) {
    if (e.entryType !== "expense" || e.currency !== currency || isNonSpendingCategory(e.category)) continue;
    if (e.entryDate.startsWith(`${month}-`)) cur.set(e.category, (cur.get(e.category) ?? 0) + e.amount);
    else if (e.entryDate.startsWith(`${prev}-`) && Number(e.entryDate.slice(8, 10)) <= throughDay)
      old.set(e.category, (old.get(e.category) ?? 0) + e.amount);
  }
  const names = new Set([...cur.keys(), ...old.keys()]);
  return [...names]
    .map((category) => {
      const current = cur.get(category) ?? 0;
      const previous = old.get(category) ?? 0;
      return { category, current, previous, delta: current - previous, pct: previous > 0 ? ((current - previous) / previous) * 100 : null };
    })
    .filter((c) => Math.abs(c.delta) >= minDelta)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}
