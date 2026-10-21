/**
 * "What if" stress scenarios for the dashboard: how much net worth would a
 * sharp move in the largest holding, in the whole stock market, or in a
 * foreign currency cost you? Pure functions over the same mapped holdings
 * the rest of the dashboard already uses, so nothing here needs a new API.
 *
 * These are simple, linear, one-factor shocks -- a way to see how exposed
 * the portfolio is, not a forecast.
 */

export interface StressHolding {
  assetType: string;
  currency: string;
  displayValue: number;
  symbol?: string | null;
  name?: string;
}

export interface StressInputs {
  holdings: StressHolding[];
  displayCurrency: string;
  totalNetWorth: number;
  topHoldingDropPct: number;
  marketDropPct: number;
  fxDropPct: number;
}

export interface StressResult {
  topHolding: { label: string; value: number; sharePct: number } | null;
  topHoldingLoss: number;
  marketExposure: number;
  marketLoss: number;
  foreignExposure: number;
  foreignLoss: number;
  /** Each loss as a % of total net worth (0 when net worth is not positive). */
  topHoldingLossPct: number;
  marketLossPct: number;
  foreignLossPct: number;
}

const MARKET_ASSET_TYPES = ["stock", "mutual_fund", "crypto"];

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function pctOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function computeStress({
  holdings,
  displayCurrency,
  totalNetWorth,
  topHoldingDropPct,
  marketDropPct,
  fxDropPct,
}: StressInputs): StressResult {
  const assets = holdings.filter((h) => h.displayValue > 0);
  const assetTotal = assets.reduce((sum, h) => sum + h.displayValue, 0);

  let top: StressHolding | null = null;
  for (const h of assets) {
    if (top == null || h.displayValue > top.displayValue) top = h;
  }

  const topHoldingLoss = top ? top.displayValue * (clampPct(topHoldingDropPct) / 100) : 0;
  const marketExposure = assets.filter((h) => MARKET_ASSET_TYPES.includes(h.assetType)).reduce((sum, h) => sum + h.displayValue, 0);
  const marketLoss = marketExposure * (clampPct(marketDropPct) / 100);
  const foreignExposure = assets.filter((h) => h.currency !== displayCurrency).reduce((sum, h) => sum + h.displayValue, 0);
  const foreignLoss = foreignExposure * (clampPct(fxDropPct) / 100);

  return {
    topHolding: top
      ? { label: top.symbol || top.name || "Largest holding", value: top.displayValue, sharePct: pctOf(top.displayValue, assetTotal) }
      : null,
    topHoldingLoss,
    marketExposure,
    marketLoss,
    foreignExposure,
    foreignLoss,
    topHoldingLossPct: pctOf(topHoldingLoss, totalNetWorth),
    marketLossPct: pctOf(marketLoss, totalNetWorth),
    foreignLossPct: pctOf(foreignLoss, totalNetWorth),
  };
}
