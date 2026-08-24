import { getAssetTypeLabel, isQuantityBased } from "../constants/enums";

/**
 * Plain total-return % since purchase/first entry — distinct from XIRR
 * (annualized), which only exists for quantity-based holdings with a
 * dated transaction ledger. This works for any holding, quantity-based
 * or valuation-based, so it's the number to fall back to when XIRR isn't
 * available (e.g. real estate, cash) or when "how much did this actually
 * grow" matters more than the annualized rate.
 */
export function holdingGrowthPct(h) {
  if (isQuantityBased(h.assetType) && h.costBasis) return (h.totalGain / h.costBasis) * 100;
  if (h.firstValue) return (h.gain / Math.abs(h.firstValue)) * 100;
  return null;
}

/**
 * What this holding was originally worth ("buy value"), in the display
 * currency — the cost-basis twin of h.displayValue, so the two can be
 * summed across holdings in different native currencies (an account or
 * category aggregate) without mixing currencies. Returns null rather than
 * 0 when unknown, so callers can distinguish "no data" from "worth zero."
 */
export function holdingBuyValue(h) {
  if (isQuantityBased(h.assetType)) return h.displayCostBasis;
  return h.displayFirstValue != null ? Math.abs(h.displayFirstValue) : null;
}

/**
 * Total buy value across a group of holdings (sum of whatever holdings
 * actually have it — one with unknown buy value is excluded from the sum
 * rather than treated as 0, so it doesn't understate the rest), plus the
 * resulting $ gain if there's anything to compare against.
 */
export function groupBuyValueAndGain(holdings) {
  let buyValue = null;
  let value = 0;
  for (const h of holdings) {
    value += h.displayValue || 0;
    const bv = holdingBuyValue(h);
    if (bv != null) buyValue = (buyValue ?? 0) + bv;
  }
  return { buyValue, gainAmount: buyValue != null ? value - buyValue : null };
}

/**
 * A single holding's own return, choosing the right figure and correctly
 * labeling which one it is: true annualized XIRR where that's meaningful
 * (quantity-based types with a dated transaction ledger), plain growth %
 * otherwise. The two are never presented as the same number, since calling
 * a non-annualized figure "XIRR" would be misleading.
 */
export function holdingReturn(h) {
  if (isQuantityBased(h.assetType) && h.xirr != null) {
    return { pct: h.xirr * 100, isXirr: true };
  }
  return { pct: holdingGrowthPct(h), isXirr: false };
}

/**
 * Value-weighted average return for an arbitrary group of holdings — a
 * holding-level XIRR average weighted by current value for quantity-based
 * types, and simple gain/first-value % for valuation-based types. Not a
 * literal decomposition of one portfolio XIRR (XIRR isn't additive across
 * sub-portfolios, so no such decomposition is mathematically well-defined) —
 * just a returns comparison across groups (asset types, accounts, etc).
 * isXirr is true only when every contributing holding in the group used the
 * annualized XIRR figure, matching the same "never mislabel a growth % as
 * XIRR" rule ReturnCell enforces per holding.
 */
export function computeGroupedReturn(holdings) {
  let weightedSum = 0;
  let weight = 0;
  let sawXirr = false;
  let sawGrowth = false;

  for (const h of holdings) {
    if (isQuantityBased(h.assetType) && h.xirr != null && h.displayValue > 0) {
      weightedSum += h.xirr * 100 * h.displayValue;
      weight += h.displayValue;
      sawXirr = true;
    } else if (!isQuantityBased(h.assetType) && h.firstValue) {
      const pct = (h.gain / Math.abs(h.firstValue)) * 100;
      weightedSum += pct * h.displayValue;
      weight += h.displayValue;
      sawGrowth = true;
    }
  }

  if (weight === 0) return { returnPct: null, isXirr: false };
  return { returnPct: weightedSum / weight, isXirr: sawXirr && !sawGrowth };
}

/**
 * Value-weighted average return per asset type — see computeGroupedReturn.
 */
export function computeReturnsByType(holdings) {
  const byType = {};
  for (const h of holdings) {
    (byType[h.assetType] = byType[h.assetType] || []).push(h);
  }
  return Object.entries(byType)
    .map(([type, hs]) => ({ assetType: type, label: getAssetTypeLabel(type), ...computeGroupedReturn(hs) }))
    .filter((r) => r.returnPct != null)
    .sort((a, b) => b.returnPct - a.returnPct);
}
