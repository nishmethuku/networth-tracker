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
