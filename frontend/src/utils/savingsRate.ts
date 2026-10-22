export interface MonthRow {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
}

export interface SavingsRate {
  /** Share of income kept, 0 to 100 or beyond (negative means overspending). */
  ratePct: number;
  /** Average amount kept per month. */
  avgMonthlyNet: number;
  monthsUsed: number;
}

/**
 * Savings rate over the most recent months that have income. The month in
 * progress is skipped when an earlier month exists, because half a month of
 * spending against a full paycheck (or the reverse) gives a misleading rate.
 * Returns null when there is no income to measure against.
 */
export function savingsRate(months: MonthRow[] | null | undefined, currentMonth: string, maxMonths = 3): SavingsRate | null {
  if (!months || months.length === 0) return null;
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const complete = sorted.filter((m) => m.month < currentMonth);
  const pool = (complete.length > 0 ? complete : sorted).filter((m) => m.income > 0).slice(-maxMonths);
  if (pool.length === 0) return null;
  const income = pool.reduce((s, m) => s + m.income, 0);
  const expenses = pool.reduce((s, m) => s + m.expenses, 0);
  return {
    ratePct: ((income - expenses) / income) * 100,
    avgMonthlyNet: (income - expenses) / pool.length,
    monthsUsed: pool.length,
  };
}
