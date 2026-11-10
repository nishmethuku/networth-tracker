const EPSILON = 1e-9;

export function positionKey(h: { assetType: string; symbol?: string | null; name?: string | null; currency: string }): string {
  return `${h.assetType}|${(h.symbol || h.name || "").toUpperCase()}|${h.currency}`;
}

/**
 * Splits quantity-based holdings into the positions still held and the ones fully sold. Purchases of
 * the same stock count as one position, so an open stock keeps all of its purchases (including any
 * that were sold) and only a stock with nothing left disappears from the "current" view.
 */
export function splitCurrentAndSold<
  T extends { assetType: string; symbol?: string | null; name?: string | null; currency: string; quantity?: number | null },
>(holdings: T[]): { current: T[]; soldPositions: number } {
  const quantityByKey = new Map<string, number>();
  for (const h of holdings) quantityByKey.set(positionKey(h), (quantityByKey.get(positionKey(h)) || 0) + (h.quantity || 0));
  const current = holdings.filter((h) => (quantityByKey.get(positionKey(h)) || 0) > EPSILON);
  const soldPositions = [...quantityByKey.values()].filter((q) => q <= EPSILON).length;
  return { current, soldPositions };
}
