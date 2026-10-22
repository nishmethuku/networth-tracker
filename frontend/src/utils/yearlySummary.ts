export interface YearRow {
  year: number;
  endValue: number;
  /** Change over the year; null for the first year, which has no start to compare to. */
  delta: number | null;
  pct: number | null;
  partial: boolean;
}

/** Year-end net worth and yearly change, newest first. The current year is marked partial. */
export function yearlySummary(history: { date: string; netWorth: number }[] | null | undefined, currentYear: number): YearRow[] {
  if (!history || history.length === 0) return [];
  const lastOfYear = new Map<number, number>();
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  for (const p of sorted) lastOfYear.set(Number(p.date.slice(0, 4)), p.netWorth);
  const years = [...lastOfYear.keys()].sort((a, b) => a - b);
  const rows: YearRow[] = years.map((year, i) => {
    const end = lastOfYear.get(year) as number;
    const prev = i > 0 && years[i - 1] === year - 1 ? (lastOfYear.get(year - 1) as number) : null;
    const delta = prev != null ? end - prev : null;
    return {
      year,
      endValue: end,
      delta,
      pct: prev != null && prev > 0 ? ((end - prev) / prev) * 100 : null,
      partial: year === currentYear,
    };
  });
  return rows.reverse();
}
