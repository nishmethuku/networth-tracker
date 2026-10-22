/** Same ladder as backend/milestone_service.py, in USD. */
export const MILESTONES_USD = [
  10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000,
];

export interface NextMilestone {
  previous: number;
  target: number;
  /** Progress from the previous milestone (or zero) to the target, 0 to 100. */
  pct: number;
  remaining: number;
}

/** The next milestone above `netWorth`, or null when there is none to show. */
export function nextMilestone(netWorth: number): NextMilestone | null {
  if (!Number.isFinite(netWorth) || netWorth <= 0) return null;
  const target = MILESTONES_USD.find((m) => m > netWorth);
  if (target == null) return null;
  const idx = MILESTONES_USD.indexOf(target);
  const previous = idx > 0 ? MILESTONES_USD[idx - 1] : 0;
  return { previous, target, pct: ((netWorth - previous) / (target - previous)) * 100, remaining: target - netWorth };
}
