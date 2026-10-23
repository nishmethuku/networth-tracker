import { isNonSpendingCategory } from "./nonSpending";

export interface DetectEntry {
  id: number | string;
  entryDate: string;
  entryType: string;
  amount: number;
  currency: string;
  category: string;
  description?: string | null;
  isRecurring?: boolean;
}

export interface RecurringSuggestion {
  category: string;
  description: string;
  frequency: "monthly" | "weekly";
  amount: number;
  count: number;
  /** The newest matching entry, which is the one to mark as recurring. */
  latestEntryId: number | string;
}

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
}

/**
 * Expenses that keep coming around on a regular schedule but are not marked
 * recurring yet. A note is required (so unrelated purchases are not grouped),
 * with at least 3 entries about a month apart (26 to 35 days) or a week apart
 * (6 to 8 days) and amounts within 15 percent of each other.
 */
export function detectRecurring(entries: DetectEntry[] | null | undefined, currency: string, limit = 3): RecurringSuggestion[] {
  const groups = new Map<string, DetectEntry[]>();
  const alreadyRecurring = new Set<string>();
  for (const e of entries ?? []) {
    if (e.entryType !== "expense" || e.currency !== currency || !(e.amount > 0) || isNonSpendingCategory(e.category)) continue;
    const desc = (e.description ?? "").trim().toLowerCase();
    if (!desc) continue;
    const key = `${e.category}\u0000${desc}`;
    if (e.isRecurring) alreadyRecurring.add(key);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const out: RecurringSuggestion[] = [];
  for (const [key, list] of groups) {
    if (alreadyRecurring.has(key) || list.length < 3) continue;
    const sorted = [...list].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
    const gaps = sorted.slice(1).map((e, i) => dayNumber(e.entryDate) - dayNumber(sorted[i].entryDate));
    const monthly = gaps.every((g) => g >= 26 && g <= 35);
    const weekly = gaps.every((g) => g >= 6 && g <= 8);
    if (!monthly && !weekly) continue;
    const amounts = sorted.map((e) => e.amount);
    if (Math.max(...amounts) > Math.min(...amounts) * 1.15) continue;
    const latest = sorted[sorted.length - 1];
    out.push({
      category: latest.category,
      description: (latest.description ?? "").trim(),
      frequency: monthly ? "monthly" : "weekly",
      amount: latest.amount,
      count: sorted.length,
      latestEntryId: latest.id,
    });
  }
  return out.sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, limit);
}
