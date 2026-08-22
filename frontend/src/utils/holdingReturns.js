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
 * Value-weighted average return per asset type — a holding-level XIRR
 * average weighted by current value for quantity-based types, and simple
 * gain/first-value % for valuation-based types. This is a returns
 * comparison across types, not a literal decomposition of one portfolio
 * XIRR (XIRR isn't additive across sub-portfolios, so no such decomposition
 * is mathematically well-defined).
 */
export function computeReturnsByType(holdings) {
  const byType = {};
  for (const h of holdings) {
    if (!byType[h.assetType]) byType[h.assetType] = { weightedSum: 0, weight: 0 };
    const bucket = byType[h.assetType];

    if (isQuantityBased(h.assetType) && h.xirr != null && h.displayValue > 0) {
      bucket.weightedSum += h.xirr * 100 * h.displayValue;
      bucket.weight += h.displayValue;
    } else if (!isQuantityBased(h.assetType) && h.firstValue) {
      const pct = (h.gain / Math.abs(h.firstValue)) * 100;
      bucket.weightedSum += pct * h.displayValue;
      bucket.weight += h.displayValue;
    }
  }
  return Object.entries(byType)
    .filter(([, b]) => b.weight > 0)
    .map(([type, b]) => ({ assetType: type, label: getAssetTypeLabel(type), returnPct: b.weightedSum / b.weight }))
    .sort((a, b) => b.returnPct - a.returnPct);
}
