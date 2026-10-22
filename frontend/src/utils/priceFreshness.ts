export interface PriceFreshness {
  /** YYYY-MM-DD of the newest stored price. */
  asOf: string;
  daysOld: number;
  /** True when weekdays have likely passed without an update. */
  stale: boolean;
}

/**
 * How current the stored market prices are. Weekends and the day after are not
 * counted as stale, since markets are closed. Null when there is no date.
 */
export function priceFreshness(newestPriceDate: string | null | undefined, today: string): PriceFreshness | null {
  if (!newestPriceDate) return null;
  const asOf = newestPriceDate.slice(0, 10);
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000);
  if (Number.isNaN(days) || days < 0) return null;
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
  // Mon: Friday's close is 3 days old and fine; Sun: Friday is 2 days; Sat: 1 day.
  const allowed = dow === 1 ? 3 : dow === 0 ? 2 : 1;
  return { asOf, daysOld: days, stale: days > allowed };
}
