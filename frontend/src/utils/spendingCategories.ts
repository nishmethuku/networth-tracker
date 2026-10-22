export interface CategoryRow {
  category: string;
  amount: number;
}

export interface CategoryShare extends CategoryRow {
  /** Share of all spending in the list, 0 to 100. */
  sharePct: number;
}

/**
 * The biggest spending categories with their share of the total. Anything past
 * `limit` is rolled into one "other" row so the shares still add up to 100.
 * Zero and negative amounts are ignored.
 */
export function topCategories(rows: CategoryRow[] | null | undefined, limit = 5): CategoryShare[] {
  const clean = (rows ?? []).filter((r) => r && r.amount > 0);
  if (clean.length === 0) return [];
  const total = clean.reduce((s, r) => s + r.amount, 0);
  const sorted = [...clean].sort((a, b) => b.amount - a.amount);
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);
  const out: CategoryShare[] = head.map((r) => ({ ...r, sharePct: (r.amount / total) * 100 }));
  if (tail.length > 0) {
    const amount = tail.reduce((s, r) => s + r.amount, 0);
    out.push({ category: "other", amount, sharePct: (amount / total) * 100 });
  }
  return out;
}
