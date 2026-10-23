import { isNonSpendingCategory } from "./nonSpending";

export interface PatternEntry {
  id: number | string;
  entryType: string;
  entryDate: string;
  amount: number;
  currency: string;
  category: string;
  description?: string | null;
}

function counted(entries: PatternEntry[] | null | undefined, currency: string): PatternEntry[] {
  return (entries ?? []).filter((e) => e.entryType === "expense" && e.currency === currency && !isNonSpendingCategory(e.category));
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prevMonth(month: string, back: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return d.toISOString().slice(0, 7);
}

export interface SuggestedLimit {
  category: string;
  average: number;
  suggested: number;
}

/**
 * Limits worth setting: the average of the last three full months per category, rounded up to a
 * friendly number. Skips categories that already have a limit, and ones that average under `min`.
 */
export function suggestLimits(
  entries: PatternEntry[] | null | undefined,
  today: string,
  currency: string,
  existing: string[] = [],
  limit = 4,
  min = 20,
): SuggestedLimit[] {
  const thisMonth = today.slice(0, 7);
  const months = [1, 2, 3].map((n) => prevMonth(thisMonth, n));
  const totals = new Map<string, number>();
  for (const e of counted(entries, currency)) {
    if (!months.includes(e.entryDate.slice(0, 7))) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  }
  const have = new Set(existing);
  return [...totals.entries()]
    .filter(([c]) => !have.has(c))
    .map(([category, total]) => {
      const average = total / 3;
      const step = average >= 500 ? 50 : average >= 100 ? 10 : 5;
      return { category, average: Math.round(average * 100) / 100, suggested: Math.ceil(average / step) * step };
    })
    .filter((s) => s.average >= min)
    .sort((a, b) => b.average - a.average)
    .slice(0, limit);
}

export interface TopNote {
  label: string;
  total: number;
  count: number;
}

/** Where the month's money went by note ("Chipotle", "Uber"), biggest first. Entries without a note are left out. */
export function topNotes(entries: PatternEntry[] | null | undefined, month: string, currency: string, limit = 5): TopNote[] {
  const groups = new Map<string, TopNote>();
  for (const e of counted(entries, currency)) {
    if (e.entryDate.slice(0, 7) !== month) continue;
    const label = (e.description ?? "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const g = groups.get(key) ?? { label, total: 0, count: 0 };
    g.total += e.amount;
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export interface WeekdayAverage {
  /** 0 = Sunday. */
  day: number;
  average: number;
}

/** Average spend on each weekday over the last `weeks` weeks (ending today), so "Fridays cost you the most" is visible. */
export function weekdayPattern(entries: PatternEntry[] | null | undefined, today: string, currency: string, weeks = 12): WeekdayAverage[] {
  const start = shift(today, -(weeks * 7 - 1));
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  for (let i = 0; i < weeks * 7; i++) {
    counts[new Date(`${shift(start, i)}T00:00:00Z`).getUTCDay()] += 1;
  }
  for (const e of counted(entries, currency)) {
    if (e.entryDate < start || e.entryDate > today) continue;
    sums[new Date(`${e.entryDate}T00:00:00Z`).getUTCDay()] += e.amount;
  }
  return sums.map((s, day) => ({ day, average: counts[day] ? s / counts[day] : 0 }));
}

export interface NoSpendStats {
  /** Days so far this month (today included) with nothing spent. */
  days: number;
  /** Days so far this month. */
  elapsed: number;
  /** Consecutive no-spend days ending today, or yesterday if today already has spending. */
  streak: number;
}

export function noSpendStats(entries: PatternEntry[] | null | undefined, today: string, currency: string): NoSpendStats {
  const month = today.slice(0, 7);
  const spentOn = new Set(counted(entries, currency).map((e) => e.entryDate));
  const elapsed = Number(today.slice(8, 10));
  let days = 0;
  for (let d = 1; d <= elapsed; d++) {
    if (!spentOn.has(`${month}-${String(d).padStart(2, "0")}`)) days += 1;
  }
  let streak = 0;
  let cursor = spentOn.has(today) ? shift(today, -1) : today;
  while (!spentOn.has(cursor) && cursor.slice(0, 7) === month) {
    streak += 1;
    cursor = shift(cursor, -1);
  }
  return { days, elapsed, streak };
}

export interface MonthReview {
  total: number;
  activeDays: number;
  perActiveDay: number;
  biggest: PatternEntry | null;
  /** Compared with the average of the three months before it; null when there is nothing to compare. */
  vsUsualPct: number | null;
}

/** A finished month in one glance: total, busiest single purchase, and how it compares with the usual. */
export function monthReview(entries: PatternEntry[] | null | undefined, month: string, currency: string): MonthReview | null {
  const all = counted(entries, currency);
  const inMonth = all.filter((e) => e.entryDate.slice(0, 7) === month);
  if (inMonth.length === 0) return null;
  const total = inMonth.reduce((s, e) => s + e.amount, 0);
  const activeDays = new Set(inMonth.map((e) => e.entryDate)).size;
  const biggest = inMonth.reduce((b, e) => (e.amount > b.amount ? e : b), inMonth[0]);
  const before = [1, 2, 3].map((n) => prevMonth(month, n));
  const prior = before.map((m) => all.filter((e) => e.entryDate.slice(0, 7) === m).reduce((s, e) => s + e.amount, 0)).filter((t) => t > 0);
  const usual = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 0;
  return { total, activeDays, perActiveDay: total / activeDays, biggest, vsUsualPct: usual > 0 ? ((total - usual) / usual) * 100 : null };
}
