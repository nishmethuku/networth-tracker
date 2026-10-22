/**
 * "Money Health" score: one 0 to 100 number built from four simple, widely
 * used rules of thumb, each shown with a plain reason. It is a nudge, not
 * financial advice, and it only uses numbers the app already has.
 */

export interface HealthInput {
  /** Months of spending covered by liquid cash, and the target (usually 6). Omit if Budget is unused. */
  emergencyMonths?: number | null;
  emergencyTarget?: number | null;
  /** Value of each holding in the display currency, with a label. */
  holdings: { label: string; value: number }[];
  /** Total value per asset type (stocks, cash, real estate...). */
  allocationByType: { label: string; value: number }[];
  totalAssets: number;
  totalLiabilities: number;
}

export interface HealthFactor {
  key: "emergency" | "concentration" | "diversification" | "debt";
  title: string;
  score: number; // 0 to 100
  weight: number;
  detail: string; // what we measured, in plain words
  tip: string; // what would improve it
}

export interface HealthResult {
  score: number | null;
  label: "Excellent" | "Good" | "Fair" | "Needs attention" | null;
  factors: HealthFactor[];
  nextStep: string | null;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

export function healthLabel(score: number): NonNullable<HealthResult["label"]> {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs attention";
}

export function computeMoneyHealth(input: HealthInput): HealthResult {
  const factors: HealthFactor[] = [];

  const { emergencyMonths, emergencyTarget } = input;
  if (emergencyMonths != null && emergencyTarget) {
    factors.push({
      key: "emergency",
      title: "Emergency cushion",
      score: clamp((emergencyMonths / emergencyTarget) * 100),
      weight: 30,
      detail: `Cash covers ${emergencyMonths.toFixed(1)} of ${emergencyTarget} months of spending.`,
      tip: `Build your cash toward ${emergencyTarget} months of spending.`,
    });
  }

  const totalHoldings = input.holdings.reduce((sum, h) => sum + Math.max(0, h.value), 0);
  if (totalHoldings > 0) {
    const biggest = input.holdings.reduce((a, b) => (b.value > a.value ? b : a));
    const pct = (biggest.value / totalHoldings) * 100;
    // 10% or less of your holdings in one place is fully healthy; 50% or more is the worst case.
    factors.push({
      key: "concentration",
      title: "Not too much in one holding",
      score: clamp(100 - ((pct - 10) / 40) * 100),
      weight: 25,
      detail: `${biggest.label} is ${pct.toFixed(0)}% of your holdings.`,
      tip: `${biggest.label} is a large share. Adding to other holdings lowers the risk.`,
    });
  }

  const classes = input.allocationByType.filter((a) => a.value > 0).length;
  if (classes > 0) {
    const byCount = [0, 25, 60, 85, 100];
    factors.push({
      key: "diversification",
      title: "Spread across asset types",
      score: byCount[Math.min(classes, 4)],
      weight: 20,
      detail: `You hold ${classes} type${classes === 1 ? "" : "s"} of asset.`,
      tip: "Mixing in another type, such as cash, funds or property, spreads the risk.",
    });
  }

  if (input.totalAssets > 0) {
    const ratio = input.totalLiabilities / input.totalAssets;
    // No debt is best; debt at half of assets or more is the worst case.
    factors.push({
      key: "debt",
      title: "Debt compared with assets",
      score: clamp(100 - (ratio / 0.5) * 100),
      weight: 25,
      detail: ratio === 0 ? "You have no debt recorded." : `Debt is ${(ratio * 100).toFixed(0)}% of your assets.`,
      tip: "Paying down debt, starting with the highest interest rate, raises this the fastest.",
    });
  }

  if (factors.length === 0) return { score: null, label: null, factors, nextStep: null };

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight);
  const weakest = factors.reduce((a, b) => (b.score < a.score ? b : a));
  return {
    score,
    label: healthLabel(score),
    factors,
    nextStep: weakest.score < 80 ? weakest.tip : "Nice work. Keep adding steadily and the score stays strong.",
  };
}
