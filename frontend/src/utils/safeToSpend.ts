export interface SafeToSpend {
  /** Income you can count on this month, minus what is spent and what is still due. */
  available: number;
  /** Spread over the days left, today included. Negative means already over. */
  perDay: number;
  daysLeft: number;
  basis: "this month" | "typical month";
}

/**
 * What you can still spend each day for the rest of the month. Income is this
 * month's so far, or your typical month if that is higher (paychecks may not have
 * landed yet). Bills still due this month are set aside first.
 * Returns null when there is no income to base it on.
 */
export function safeToSpend(opts: {
  incomeThisMonth: number;
  typicalIncome: number;
  spent: number;
  dueThisMonth: number;
  today: string;
}): SafeToSpend | null {
  const { incomeThisMonth, typicalIncome, spent, dueThisMonth, today } = opts;
  const income = Math.max(incomeThisMonth, typicalIncome);
  if (!(income > 0)) return null;
  const [y, m] = today.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysLeft = dim - Number(today.slice(8, 10)) + 1;
  const available = income - spent - Math.max(0, dueThisMonth);
  return { available, perDay: available / daysLeft, daysLeft, basis: incomeThisMonth >= typicalIncome ? "this month" : "typical month" };
}

/** Average income of the most recent complete months that had any (up to `n`), or 0. */
export function typicalIncome(months: { month: string; income: number }[] | null | undefined, currentMonth: string, n = 3): number {
  const pool = (months ?? [])
    .filter((m) => m.month < currentMonth && m.income > 0)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-n);
  return pool.length ? pool.reduce((s, m) => s + m.income, 0) / pool.length : 0;
}
