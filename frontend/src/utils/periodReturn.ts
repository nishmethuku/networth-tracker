export interface ReturnRange {
  label: string;
  days: number | null;
  ytd?: boolean;
}

export const RETURN_RANGES: ReturnRange[] = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 182 },
  { label: "1Y", days: 365 },
  { label: "YTD", days: null, ytd: true },
  { label: "All", days: null },
];

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface PeriodReturnResult {
  rows: SeriesPoint[];
  pct: number | null;
  start: number;
  end: number;
}

/**
 * % change over a selectable window, from a {date, value} series sorted
 * ascending. Falls back to the last two points rather than showing nothing
 * when the series doesn't reach as far back as the selected window.
 */
export function computePeriodReturn(series: SeriesPoint[], rangeIndex: number, now: Date = new Date()): PeriodReturnResult | null {
  if (!series || series.length < 2) return null;
  const range = RETURN_RANGES[rangeIndex];
  let rows = series;
  if (range.ytd) {
    const jan1 = new Date(now.getFullYear(), 0, 1);
    rows = series.filter((r) => new Date(r.date) >= jan1);
  } else if (range.days != null) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - range.days);
    rows = series.filter((r) => new Date(r.date) >= cutoff);
  }
  if (rows.length < 2) rows = series.slice(-2);
  const start = rows[0].value;
  const end = rows[rows.length - 1].value;
  const pct = start !== 0 ? ((end - start) / Math.abs(start)) * 100 : null;
  return { rows, pct, start, end };
}
