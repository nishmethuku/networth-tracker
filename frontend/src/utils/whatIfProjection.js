/**
 * Pure compound-growth projection for the What-If calculator — a starting
 * lump sum plus a constant monthly contribution, compounding at a fixed
 * annual rate. Same annuity-due math as backend/sip_service.py's
 * project_future_value, generalized to return a full year-by-year series
 * (for charting) instead of a single end value, and to always compound
 * monthly rather than following a holding's own contribution frequency —
 * this is a portfolio-wide scratch calculator, not tied to one holding's
 * real SIP schedule.
 */
export function projectNetWorth({ startingAmount, monthlyContribution, annualRatePct, years }) {
  const rate = annualRatePct / 100;
  const periodicRate = Math.pow(1 + rate, 1 / 12) - 1;
  const points = [];

  for (let year = 0; year <= years; year++) {
    const n = year * 12;
    const fvStart = startingAmount * Math.pow(1 + rate, year);
    const fvContributions =
      Math.abs(periodicRate) < 1e-9
        ? monthlyContribution * n
        : monthlyContribution * ((Math.pow(1 + periodicRate, n) - 1) / periodicRate) * (1 + periodicRate);
    const contributed = startingAmount + monthlyContribution * n;
    const value = fvStart + fvContributions;
    points.push({ year, value, contributed, growth: value - contributed });
  }

  return points;
}

/**
 * FIRE ("financial independence") number: the portfolio size whose
 * withdrawals at `safeWithdrawalRatePct` cover `annualExpenses` forever —
 * the standard "25x expenses" rule is just this at a 4% withdrawal rate.
 */
export function fireNumber(annualExpenses, safeWithdrawalRatePct) {
  if (!safeWithdrawalRatePct || safeWithdrawalRatePct <= 0) return null;
  return annualExpenses / (safeWithdrawalRatePct / 100);
}

/**
 * First point in a projectNetWorth() series whose value reaches `target`,
 * or null if the series never gets there (target too high / too many years
 * needed) — the caller decides how to render "not reached".
 */
export function yearsToTarget(points, target) {
  if (target == null || target <= 0) return null;
  const hit = points.find((p) => p.value >= target);
  return hit ? hit.year : null;
}
