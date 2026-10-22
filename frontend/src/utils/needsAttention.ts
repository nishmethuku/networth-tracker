export interface AttentionHolding {
  id?: number | string;
  label: string;
  quantityBased: boolean;
  currentPrice: number | null;
  /** ISO timestamp of the last edit or valuation. */
  updatedAt: string;
}

export interface AttentionItem {
  id: string;
  message: string;
  link: string;
}

const STALE_DAYS = 90;

function daysSince(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
}

/** Plain-language to-dos: values you may need to refresh. Empty when all is well. */
export function needsAttention(holdings: AttentionHolding[] | null | undefined, now: Date = new Date()): AttentionItem[] {
  if (!holdings) return [];
  const items: AttentionItem[] = [];

  const noPrice = holdings.filter((h) => h.quantityBased && (h.currentPrice == null || h.currentPrice <= 0));
  if (noPrice.length > 0) {
    const names = noPrice
      .slice(0, 3)
      .map((h) => h.label)
      .join(", ");
    items.push({
      id: "no-price",
      message: `No live price for ${names}${noPrice.length > 3 ? ` and ${noPrice.length - 3} more` : ""}. They may be counted at zero.`,
      link: noPrice.length === 1 && noPrice[0].id != null ? `/portfolio/${noPrice[0].id}` : "/portfolio",
    });
  }

  const stale = holdings.filter((h) => {
    if (h.quantityBased) return false;
    const d = daysSince(h.updatedAt, now);
    return d != null && d >= STALE_DAYS;
  });
  if (stale.length > 0) {
    const names = stale
      .slice(0, 3)
      .map((h) => h.label)
      .join(", ");
    items.push({
      id: "stale",
      message: `${names}${stale.length > 3 ? ` and ${stale.length - 3} more` : ""} ${stale.length === 1 ? "has" : "have"} not been updated in over ${STALE_DAYS} days.`,
      link: stale.length === 1 && stale[0].id != null ? `/portfolio/${stale[0].id}` : "/portfolio",
    });
  }

  return items;
}
