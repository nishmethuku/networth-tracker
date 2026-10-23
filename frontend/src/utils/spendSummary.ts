import { isNonSpendingCategory } from "./nonSpending";
import type { EntryLike } from "./entryGroups";

export interface SpendEntry extends EntryLike {
  description?: string | null;
}

export interface SpendSummary {
  today: number;
  week: number;
  lastWeek: number;
  month: number;
  topCategories: { category: string; amount: number }[];
  recent: SpendEntry[];
  /** True when there is at least one expense in the data, to decide whether to show the card. */
  hasAny: boolean;
}

/** The Monday on or before a date (weeks start on Monday). */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today, this week, last week and this month of spending (card payments left out), top categories, and the latest entries. */
export function spendSummary(entries: SpendEntry[] | null | undefined, today: string, currency: string): SpendSummary {
  const ws = weekStart(today);
  const lastWs = addDays(ws, -7);
  const month = today.slice(0, 7);
  let day = 0;
  let week = 0;
  let lastWeek = 0;
  let monthTotal = 0;
  const cats = new Map<string, number>();
  const expenses: SpendEntry[] = [];
  for (const e of entries ?? []) {
    if (e.entryType !== "expense") continue;
    if (e.currency !== currency || isNonSpendingCategory(e.category)) continue;
    expenses.push(e);
    if (e.entryDate === today) day += e.amount;
    if (e.entryDate >= ws && e.entryDate <= today) week += e.amount;
    if (e.entryDate >= lastWs && e.entryDate < ws) lastWeek += e.amount;
    if (e.entryDate.startsWith(`${month}-`)) {
      monthTotal += e.amount;
      cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount);
    }
  }
  const recent = [...expenses].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || Number(b.id) - Number(a.id)).slice(0, 5);
  const topCategories = [...cats.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  return { today: day, week, lastWeek, month: monthTotal, topCategories, recent, hasAny: expenses.length > 0 };
}
