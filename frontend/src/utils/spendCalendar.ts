import { isNonSpendingCategory } from "./nonSpending";
import type { EntryLike } from "./entryGroups";

export interface CalendarCell {
  /** YYYY-MM-DD, or null for the blank cells before the 1st. */
  date: string | null;
  total: number;
  /** 0 for nothing spent, then 1 (light) to 4 (heaviest day of the month). */
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * A month as rows of seven days starting on Sunday, with each day's spending and a
 * 0 to 4 intensity relative to the busiest day. Card payments are not spending.
 */
export function buildCalendar(entries: EntryLike[] | null | undefined, month: string, currency: string): CalendarCell[][] {
  const [y, m] = month.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const totals = new Array<number>(dim + 1).fill(0);
  for (const e of entries ?? []) {
    if (e.entryType !== "expense" || e.currency !== currency || isNonSpendingCategory(e.category)) continue;
    if (!e.entryDate.startsWith(`${month}-`)) continue;
    totals[Number(e.entryDate.slice(8, 10))] += e.amount;
  }
  const max = Math.max(0, ...totals);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < offset; i++) cells.push({ date: null, total: 0, level: 0 });
  for (let d = 1; d <= dim; d++) {
    const total = totals[d];
    const level = total <= 0 || max <= 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((total / max) * 4))) as 1 | 2 | 3 | 4);
    cells.push({ date: `${month}-${String(d).padStart(2, "0")}`, total, level });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, total: 0, level: 0 });
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
