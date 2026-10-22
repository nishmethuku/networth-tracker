export interface RecurringItem {
  category: string;
  description?: string | null;
  amount: number;
  frequency: string;
  next_due?: string | null;
}

export interface DueRecurring extends RecurringItem {
  /** Whole days past the due date (0 means due today). */
  daysOverdue: number;
}

/**
 * Recurring expenses (rent, subscriptions) whose next due date is today or
 * already past, so they can be logged with one tap. Most overdue first.
 */
export function dueRecurring(items: RecurringItem[] | null | undefined, today: string): DueRecurring[] {
  const base = Date.parse(`${today}T00:00:00Z`);
  const out: DueRecurring[] = [];
  for (const item of items ?? []) {
    if (!item.next_due || !(item.amount > 0)) continue;
    const due = Date.parse(`${item.next_due.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(due)) continue;
    const daysOverdue = Math.round((base - due) / 86400000);
    if (daysOverdue >= 0) out.push({ ...item, daysOverdue });
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}
