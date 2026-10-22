export interface ChangeResult {
  delta: number;
  /** Percent change, or null when the starting value was zero or negative. */
  pct: number | null;
  /** The snapshot date the change is measured from. */
  fromDate: string;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * How much net worth changed since about `days` days ago: the live total
 * against the latest saved snapshot dated on or before (today - days).
 * Returns null when no snapshot is that old yet, so the app never shows a
 * change measured over a much shorter window than the label says.
 * `today` is a YYYY-MM-DD date in the user's own timezone.
 */
export function netWorthChange(
  history: { date: string; netWorth: number }[] | undefined | null,
  current: number,
  days: number,
  today: string,
): ChangeResult | null {
  if (!history || history.length === 0) return null;
  const cutoff = addDays(today, -days);
  let base: { date: string; netWorth: number } | null = null;
  for (const p of history) {
    if (p.date <= cutoff && (base === null || p.date > base.date)) base = p;
  }
  if (!base) return null;
  const delta = current - base.netWorth;
  return { delta, pct: base.netWorth > 0 ? (delta / base.netWorth) * 100 : null, fromDate: base.date };
}
