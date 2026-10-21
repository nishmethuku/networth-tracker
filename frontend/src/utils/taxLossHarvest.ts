/**
 * Finds holdings currently sitting on an unrealized loss -- the starting
 * point for "tax-loss harvesting" (selling a loser to realize a loss that can
 * offset realized gains). This only lists candidates and sizes the loss; the
 * rules for whether and how a loss can be used differ by country and
 * situation, so it never says what to do.
 */

export interface LossHolding {
  id: number;
  assetType: string;
  country: string;
  displayName: string;
  displayCostBasis?: number | null;
  displayTotalGain?: number | null;
  displayValue: number;
}

export interface LossCandidate {
  id: number;
  name: string;
  country: string;
  /** Positive number: how far under water the position is, in display currency. */
  unrealizedLoss: number;
  lossPct: number | null;
  value: number;
}

const QUANTITY_BASED = ["stock", "mutual_fund", "crypto", "commodity"];

/** Ignores losses smaller than this (in display currency) -- dust is not worth surfacing. */
const MIN_LOSS = 5;

export function findLossCandidates(holdings: LossHolding[]): LossCandidate[] {
  return holdings
    .filter((h) => QUANTITY_BASED.includes(h.assetType))
    .filter((h) => h.displayTotalGain != null && h.displayTotalGain <= -MIN_LOSS)
    .map((h) => {
      const loss = -(h.displayTotalGain as number);
      const basis = h.displayCostBasis ?? null;
      return {
        id: h.id,
        name: h.displayName,
        country: h.country,
        unrealizedLoss: loss,
        lossPct: basis != null && basis > 0 ? (loss / basis) * 100 : null,
        value: h.displayValue,
      };
    })
    .sort((a, b) => b.unrealizedLoss - a.unrealizedLoss);
}
