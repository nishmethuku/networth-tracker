export interface FiResult {
  /** The portfolio size that would cover a year of spending at a 4 percent withdrawal, i.e. 25x yearly spending. */
  target: number;
  /** Progress toward the target, 0 to 100 (capped). */
  progressPct: number;
  /** Average monthly spending the target is based on. */
  monthlySpending: number;
  /** Whole years until the target at the given saving and growth, or null when it cannot be reached in `maxYears`. 0 means already there. */
  yearsToGo: number | null;
}

/**
 * A rough "financial independence number": 25 times yearly spending (the 4 percent rule of thumb).
 * Spending is the average of the most recent complete months, falling back to the month in progress.
 * Returns null when there is no spending to base it on.
 */
export function financialIndependence(
  months: { month: string; expenses: number }[] | null | undefined,
  currentMonth: string,
  netWorth: number,
  monthlySaving: number,
  annualRatePct = 6,
  maxYears = 60,
): FiResult | null {
  if (!months || months.length === 0) return null;
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const complete = sorted.filter((m) => m.month < currentMonth && m.expenses > 0);
  const pool = (complete.length > 0 ? complete : sorted.filter((m) => m.expenses > 0)).slice(-6);
  if (pool.length === 0) return null;
  const monthlySpending = pool.reduce((s, m) => s + m.expenses, 0) / pool.length;
  const target = monthlySpending * 12 * 25;
  const start = Math.max(netWorth, 0);
  const progressPct = Math.min(100, (start / target) * 100);

  let yearsToGo: number | null = null;
  if (start >= target) {
    yearsToGo = 0;
  } else {
    const r = annualRatePct / 100 / 12;
    let balance = start;
    for (let m = 1; m <= maxYears * 12; m++) {
      balance = balance * (1 + r) + Math.max(monthlySaving, 0);
      if (balance >= target) {
        yearsToGo = Math.ceil(m / 12);
        break;
      }
    }
  }
  return { target, progressPct, monthlySpending, yearsToGo };
}
