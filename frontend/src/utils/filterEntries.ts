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
