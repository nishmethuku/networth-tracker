export interface BillItem {
  category: string;
  description: string | null;
  amount: number;
  frequency: string;
  next_due: string | null;
}

export interface UpcomingBill extends BillItem {
  daysAway: number;
}

/** Recurring items due in the next `withinDays` days (including today), soonest first. */
export function upcomingBills(items: BillItem[] | null | undefined, today: string, withinDays = 14): UpcomingBill[] {
  if (!items) return [];
  const base = Date.parse(`${today}T00:00:00Z`);
  const out: UpcomingBill[] = [];
  for (const item of items) {
    if (!item.next_due) continue;
    const due = Date.parse(`${item.next_due.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(due)) continue;
    const daysAway = Math.round((due - base) / 86400000);
    if (daysAway >= 0 && daysAway <= withinDays) out.push({ ...item, daysAway });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}
