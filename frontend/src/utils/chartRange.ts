/**
 * For the "All" view: drop the stretch at the start where the balance was
 * only a sliver of today's, so the chart is not mostly a flat line at zero.
 * Keeps the last negligible point before the first real one, so the line
 * rises into the data instead of starting in mid-air. Never trims when the
 * latest value is zero or negative, or would leave fewer than 2 points.
 */
export function trimNegligibleStart<T extends { netWorth: number }>(rows: T[], fraction = 0.01): T[] {
  if (rows.length < 3) return rows;
  const latest = rows[rows.length - 1].netWorth;
  if (!(latest > 0)) return rows;
  const threshold = latest * fraction;
  const firstReal = rows.findIndex((r) => r.netWorth >= threshold);
  if (firstReal <= 1) return rows; // nothing (or only one point) to trim
  const start = firstReal - 1;
  const trimmed = rows.slice(start);
  return trimmed.length >= 2 ? trimmed : rows;
}
