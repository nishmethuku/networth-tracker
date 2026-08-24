/**
 * Client-side mirror of backend/holdings_service.py's compute_position:
 * average-cost method, walked in chronological order. Used to annotate the
 * transaction table with running cost basis / realized P&L after each
 * event, without a new backend endpoint (the transactions list is already
 * fully loaded on this page).
 */

export interface TransactionLike {
  id: number;
  transactionType: string;
  transactionDate: string;
  quantity: number;
  pricePerUnit: number;
  fees: number;
}

export interface TimelineEntry {
  quantityAfter: number;
  costBasisAfter: number;
  avgCostAfter: number;
  cumulativeRealizedGain: number;
}

export function computeTransactionTimeline(transactions: TransactionLike[]): Record<number, TimelineEntry> {
  const sorted = [...(transactions || [])].sort(
    (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime() || (a.id ?? 0) - (b.id ?? 0),
  );

  let quantity = 0;
  let totalCost = 0;
  let cumulativeRealizedGain = 0;
  const byId: Record<number, TimelineEntry> = {};

  for (const t of sorted) {
    if (t.transactionType === "buy") {
      quantity += t.quantity;
      totalCost += t.quantity * t.pricePerUnit + t.fees;
    } else if (t.transactionType === "sell") {
      const avgCost = quantity > 0 ? totalCost / quantity : 0;
      const sellQty = Math.min(t.quantity, quantity);
      const eventGain = (t.pricePerUnit - avgCost) * sellQty - t.fees;
      cumulativeRealizedGain += eventGain;
      totalCost -= avgCost * sellQty;
      quantity -= sellQty;
    }
    byId[t.id] = {
      quantityAfter: quantity,
      costBasisAfter: totalCost,
      avgCostAfter: quantity > 0 ? totalCost / quantity : 0,
      cumulativeRealizedGain,
    };
  }

  return byId;
}
