import type { EntryLike } from "./entryGroups";

export interface FilterableEntry extends EntryLike {
  description?: string | null;
}

/**
 * Narrows a list of entries by a search word (matches the note or the
 * category, ignoring case) and by one exact category. Blank values mean no filter.
 * `labelFor` turns a stored category name into the text people see.
 */
export function filterEntries<T extends FilterableEntry>(
  entries: T[] | null | undefined,
  query: string,
  category: string,
  labelFor: (c: string) => string = (c) => c,
): T[] {
  const q = query.trim().toLowerCase();
  return (entries ?? []).filter((e) => {
    if (category && e.category !== category) return false;
    if (!q) return true;
    return (
      (e.description ?? "").toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      labelFor(e.category).toLowerCase().includes(q)
    );
  });
}

/** Keeps entries whose amount is between `min` and `max` (inclusive). Blank or invalid bounds mean no limit. */
export function filterByAmount<T extends { amount: number }>(
  entries: T[] | null | undefined,
  min: string | number,
  max: string | number,
): T[] {
  const lo = min === "" || min === null || min === undefined ? NaN : Number(min);
  const hi = max === "" || max === null || max === undefined ? NaN : Number(max);
  return (entries ?? []).filter((e) => (Number.isNaN(lo) || e.amount >= lo) && (Number.isNaN(hi) || e.amount <= hi));
}

/** A copy sorted by amount, biggest first (ties keep the newest first). */
export function biggestFirst<T extends { amount: number; entryDate: string }>(entries: T[] | null | undefined): T[] {
  return [...(entries ?? [])].sort((a, b) => b.amount - a.amount || b.entryDate.localeCompare(a.entryDate));
}
