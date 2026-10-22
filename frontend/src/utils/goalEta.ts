export interface GoalEta {
  /** Whole months until the goal at the recent pace. */
  months: number;
  /** YYYY-MM the goal would be reached. */
  reachedMonth: string;
}

function addMonths(iso: string, months: number): string {
  const [y, m] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Rough date a goal is reached if net worth keeps growing at its average pace
 * over the last `lookbackMonths`. Returns null when the goal is already met,
 * history is too short (under 60 days), the pace is flat or negative, or the
 * answer is more than 50 years away, so the app never shows a silly date.
 * `today` is YYYY-MM-DD in the person's timezone.
 */
export function goalEta(
  history: { date: string; netWorth: number }[] | null | undefined,
  current: number,
  target: number,
  today: string,
  lookbackMonths = 6,
): GoalEta | null {
  if (!history || history.length < 2 || target <= current) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - lookbackMonths);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const base = sorted.find((p) => p.date >= cutoffIso) ?? sorted[0];
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${base.date}T00:00:00Z`)) / 86400000;
  if (days < 60) return null;
  const perMonth = ((current - base.netWorth) / days) * 30.4375;
  if (!(perMonth > 0)) return null;
  const months = Math.ceil((target - current) / perMonth);
  if (months > 600) return null;
  return { months, reachedMonth: addMonths(today.slice(0, 7), months) };
}
