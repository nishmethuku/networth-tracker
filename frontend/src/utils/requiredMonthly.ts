/**
 * How much to add each month to reach `target` by `targetDate`, if the money
 * grows at `annualRatePct` a year. Returns 0 when growth alone gets there, and
 * null when the date has passed or inputs are unusable.
 * `today` is YYYY-MM-DD in the person's timezone.
 */
export function requiredMonthly(current: number, target: number, targetDate: string, today: string, annualRatePct = 5): number | null {
  if (![current, target].every(Number.isFinite) || !targetDate) return null;
  const msLeft = Date.parse(`${targetDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(msLeft) || msLeft <= 0) return null;
  const months = Math.max(1, Math.round(msLeft / (86400000 * 30.4375)));
  const r = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
  const growthOfCurrent = Math.max(current, 0) * Math.pow(1 + r, months);
  const gap = target - growthOfCurrent;
  if (gap <= 0) return 0;
  const annuity = Math.abs(r) < 1e-9 ? months : ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
  return gap / annuity;
}
