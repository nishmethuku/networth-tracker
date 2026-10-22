export interface BreakdownRow {
  category: string;
  amount: number;
  parent?: string | null;
}

export interface CategoryGroup {
  category: string;
  /** Spending recorded directly on this category. */
  own: number;
  /** Own spending plus all of its subcategories. */
  total: number;
  children: { category: string; amount: number }[];
}

/**
 * Groups a flat spending breakdown into parent categories with their
 * subcategories, biggest total first. A subcategory whose parent has no
 * spending of its own still gets a parent row (own = 0).
 */
export function groupBreakdown(rows: BreakdownRow[] | null | undefined): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  const ensure = (name: string): CategoryGroup => {
    let g = groups.get(name);
    if (!g) {
      g = { category: name, own: 0, total: 0, children: [] };
      groups.set(name, g);
    }
    return g;
  };
  for (const r of rows ?? []) {
    if (!r || !(r.amount > 0)) continue;
    if (r.parent) {
      const g = ensure(r.parent);
      g.children.push({ category: r.category, amount: r.amount });
      g.total += r.amount;
    } else {
      const g = ensure(r.category);
      g.own += r.amount;
      g.total += r.amount;
    }
  }
  const out = [...groups.values()];
  for (const g of out) g.children.sort((a, b) => b.amount - a.amount);
  return out.sort((a, b) => b.total - a.total);
}

export interface CategoryOption {
  value: string;
  label: string;
  parent: string | null;
}

/**
 * Orders category names for a dropdown so each subcategory sits right after
 * its parent, labelled "Parent › Child". `labelFor` turns a stored name into
 * display text (presets have friendly labels).
 */
export function orderCategoryOptions(
  names: string[],
  parents: Record<string, string> | null | undefined,
  labelFor: (name: string) => string = (n) => n,
): CategoryOption[] {
  const map = parents ?? {};
  const known = new Set(names);
  const childrenOf = new Map<string, string[]>();
  for (const n of names) {
    const p = map[n];
    if (p && known.has(p)) childrenOf.set(p, [...(childrenOf.get(p) ?? []), n]);
  }
  const out: CategoryOption[] = [];
  for (const n of names) {
    const p = map[n];
    if (p && known.has(p)) continue; // listed under its parent
    out.push({ value: n, label: labelFor(n), parent: null });
    for (const c of childrenOf.get(n) ?? []) out.push({ value: c, label: `${labelFor(n)} › ${labelFor(c)}`, parent: n });
  }
  return out;
}
