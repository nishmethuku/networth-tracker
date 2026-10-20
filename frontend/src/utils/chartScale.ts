/**
 * Caps a bar chart's value axis against a single extreme outlier
 * flattening every other bar to invisibility -- one holding up 1,700%
 * next to a handful up 10-30% otherwise forces an axis scaled to 1,700%,
 * at which point everything else reads as a flat line at zero. Each row's
 * rendered bar length is clamped to a shared domain sized off the rest of
 * the data (excluding the single largest magnitude), while the row keeps
 * its true value for the tooltip/label -- so nothing is misrepresented,
 * just not given 90% of the chart's width for one number.
 */
export interface Cappable {
  returnPct: number | null;
}

export interface CappedForChart<T> {
  row: T;
  chartPct: number;
  clipped: boolean;
}

export interface CapOutliersResult<T> {
  rows: CappedForChart<T>[];
  domainCap: number;
}

const MIN_DOMAIN_CAP = 20; // keeps an all-small dataset (e.g. every holding under 10%) from getting an absurdly zoomed-in axis
const PADDING_FACTOR = 1.4;

export function capOutliersForChart<T extends Cappable>(rows: T[]): CapOutliersResult<T> {
  const magnitudes = rows
    .map((r) => r.returnPct)
    .filter((v): v is number => v != null)
    .map(Math.abs)
    .sort((a, b) => a - b);

  const withoutLargest = magnitudes.slice(0, -1);
  const base = withoutLargest.length > 0 ? withoutLargest[withoutLargest.length - 1] : (magnitudes[magnitudes.length - 1] ?? 0);
  const domainCap = Math.max(MIN_DOMAIN_CAP, base * PADDING_FACTOR);

  return {
    domainCap,
    rows: rows.map((row) => {
      if (row.returnPct == null) return { row, chartPct: 0, clipped: false };
      const clipped = Math.abs(row.returnPct) > domainCap;
      const chartPct = Math.max(-domainCap, Math.min(domainCap, row.returnPct));
      return { row, chartPct, clipped };
    }),
  };
}
