export interface HistoryPoint {
  date: string;
  netWorth: number;
}

export interface HoldingLite {
  label: string;
  value: number;
  /** Total gain in display currency, or null when unknown. */
  gain: number | null;
}

export interface YearReview {
  year: number;
  startValue: number;
  endValue: number;
  delta: number;
  /** Percent change, or null when the starting value was zero or negative. */
  pct: number | null;
  bestMonth: { month: string; delta: number } | null;
  worstMonth: { month: string; delta: number } | null;
  topGainer: { label: string; gain: number } | null;
  biggestHolding: { label: string; sharePct: number } | null;
  milestonesReached: number[];
  incomeReceived: number;
}

/**
 * Plain-numbers recap of one calendar year. Uses the last snapshot before the
 * year began as the start (or the first snapshot in the year when the history
 * starts mid-year), and the last snapshot in the year as the end. Returns null
 * when there are fewer than two usable points.
 */
export function buildYearReview(args: {
  year: number;
  history: HistoryPoint[] | null | undefined;
  holdings?: HoldingLite[];
  milestones?: { threshold: number; achievedDate: string }[];
  incomeByYear?: { year: number; amount: number }[];
}): YearReview | null {
  const { year, history, holdings = [], milestones = [], incomeByYear = [] } = args;
  if (!history || history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const inYear = sorted.filter((p) => p.date >= yearStart && p.date <= yearEnd);
  if (inYear.length === 0) return null;
  const before = sorted.filter((p) => p.date < yearStart);
  const start = before.length > 0 ? before[before.length - 1] : inYear[0];
  const end = inYear[inYear.length - 1];
  if (start.date === end.date) return null;

  const delta = end.netWorth - start.netWorth;

  // Month-over-month deltas, using the last snapshot in each month.
  const lastOfMonth = new Map<string, number>();
  for (const p of [start, ...inYear]) lastOfMonth.set(p.date.slice(0, 7), p.netWorth);
  const months = [...lastOfMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const monthDeltas: { month: string; delta: number }[] = [];
  for (let i = 1; i < months.length; i++) {
    if (months[i][0].slice(0, 4) !== String(year)) continue;
    monthDeltas.push({ month: months[i][0], delta: months[i][1] - months[i - 1][1] });
  }
  const best = monthDeltas.length ? monthDeltas.reduce((a, b) => (b.delta > a.delta ? b : a)) : null;
  const worst = monthDeltas.length ? monthDeltas.reduce((a, b) => (b.delta < a.delta ? b : a)) : null;

  const withGain = holdings.filter((h) => h.gain != null && h.gain > 0);
  const top = withGain.length ? withGain.reduce((a, b) => ((b.gain as number) > (a.gain as number) ? b : a)) : null;
  const totalValue = holdings.reduce((s, h) => s + Math.max(h.value, 0), 0);
  const biggest = holdings.length ? holdings.reduce((a, b) => (b.value > a.value ? b : a)) : null;

  return {
    year,
    startValue: start.netWorth,
    endValue: end.netWorth,
    delta,
    pct: start.netWorth > 0 ? (delta / start.netWorth) * 100 : null,
    bestMonth: best && best.delta > 0 ? best : null,
    worstMonth: worst && worst.delta < 0 ? worst : null,
    topGainer: top ? { label: top.label, gain: top.gain as number } : null,
    biggestHolding: biggest && totalValue > 0 ? { label: biggest.label, sharePct: (biggest.value / totalValue) * 100 } : null,
    milestonesReached: milestones
      .filter((m) => m.achievedDate >= yearStart && m.achievedDate <= yearEnd)
      .map((m) => m.threshold)
      .sort((a, b) => a - b),
    incomeReceived: incomeByYear.find((r) => r.year === year)?.amount ?? 0,
  };
}
