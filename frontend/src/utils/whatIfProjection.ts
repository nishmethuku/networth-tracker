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

export interface ProjectionPoint {
  year: number;
  value: number;
  contributed: number;
  growth: number;
}

export interface ProjectNetWorthArgs {
  startingAmount: number;
  monthlyContribution: number;
  annualRatePct: number;
  years: number;
}

export function projectNetWorth({ startingAmount, monthlyContribution, annualRatePct, years }: ProjectNetWorthArgs): ProjectionPoint[] {
  const rate = annualRatePct / 100;
  const periodicRate = Math.pow(1 + rate, 1 / 12) - 1;
  const points: ProjectionPoint[] = [];

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
export function fireNumber(annualExpenses: number, safeWithdrawalRatePct: number): number | null {
  if (!safeWithdrawalRatePct || safeWithdrawalRatePct <= 0) return null;
  return annualExpenses / (safeWithdrawalRatePct / 100);
}

/**
 * First point in a projectNetWorth() series whose value reaches `target`,
 * or null if the series never gets there (target too high / too many years
 * needed) — the caller decides how to render "not reached".
 */
export function yearsToTarget(points: ProjectionPoint[], target: number | null | undefined): number | null {
  if (target == null || target <= 0) return null;
  const hit = points.find((p) => p.value >= target);
  return hit ? hit.year : null;
}

/**
 * Re-expresses a projection in today's money by dividing each year's
 * figures by (1 + inflation)^year. Contributions are deflated the same way
 * as a good-enough approximation (each year's contributions are treated as
 * made at that year's price level), so "growth" stays value minus
 * contributed in the same units.
 */
export function toTodaysDollars(points: ProjectionPoint[], inflationPct: number): ProjectionPoint[] {
  const inflation = Math.max(-50, Math.min(50, inflationPct || 0)) / 100;
  return points.map((p) => {
    const factor = Math.pow(1 + inflation, p.year);
    const value = p.value / factor;
    const contributed = p.contributed / factor;
    return { year: p.year, value, contributed, growth: value - contributed };
  });
}

/**
 * Cautious / expected / optimistic growth rates around a base rate: a
 * single constant rate over decades is the least realistic part of any
 * projection, so showing a band communicates that better than one line.
 * Clamped to the same range the calculator accepts.
 */
export function scenarioRates(baseRatePct: number, spreadPts: number = 3): { low: number; base: number; high: number } {
  const clamp = (v: number) => Math.max(-50, Math.min(50, v));
  return { low: clamp(baseRatePct - spreadPts), base: clamp(baseRatePct), high: clamp(baseRatePct + spreadPts) };
}
