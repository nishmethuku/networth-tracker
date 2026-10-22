export interface ChartGoal {
  id: number | string;
  name: string;
  targetAmount: number;
  currency: string;
}

/**
 * Goals worth drawing as dashed lines on the net worth chart: same currency as
 * the chart, still ahead of the latest value, and close enough (within
 * `maxMultiple` times the highest point) that the chart is not squashed flat.
 * At most `limit`, nearest first.
 */
export function goalLinesForChart(
  goals: ChartGoal[] | null | undefined,
  currency: string,
  maxValue: number,
  maxMultiple = 2,
  limit = 2,
): ChartGoal[] {
  if (!goals || !(maxValue > 0)) return [];
  return goals
    .filter((g) => g.currency === currency && g.targetAmount > maxValue && g.targetAmount <= maxValue * maxMultiple)
    .sort((a, b) => a.targetAmount - b.targetAmount)
    .slice(0, limit);
}
