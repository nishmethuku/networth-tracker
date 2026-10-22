export interface Pace {
  spent: number;
  /** Days of the month that have started (today counts). */
  daysElapsed: number;
  daysInMonth: number;
  dailyAverage: number;
  /** Where the month ends up if the pace holds. Equals `spent` once the month is over. */
  projected: number;
  /** Projected total against last month's total, as a percent change, or null when last month is unknown or zero. */
  vsLastMonthPct: number | null;
}

function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Spending pace for a month. For the month in progress it projects the total
 * from the daily average; for a finished month it just reports the total.
 * Returns null for a future month or when nothing has been spent.
 */
export function monthPace(spent: number, month: string, today: string, lastMonthTotal: number | null | undefined): Pace | null {
  const dim = daysIn(month);
  const current = today.slice(0, 7);
  if (month > current) return null;
  if (!(spent > 0)) return null;
  const elapsed = month < current ? dim : Number(today.slice(8, 10));
  const dailyAverage = spent / elapsed;
  const projected = month < current ? spent : dailyAverage * dim;
  const vs = lastMonthTotal && lastMonthTotal > 0 ? ((projected - lastMonthTotal) / lastMonthTotal) * 100 : null;
  return { spent, daysElapsed: elapsed, daysInMonth: dim, dailyAverage, projected, vsLastMonthPct: vs };
}
