export interface Freshness {
  text: string;
  /** True when a hand-entered value is old enough that it deserves an update. */
  stale: boolean;
}

/** "Updated 3 days ago" style label for a hand-entered valuation. Null when the date is unusable. */
export function freshness(updatedAt: string | null | undefined, now: Date = new Date(), staleAfterDays = 90): Freshness | null {
  if (!updatedAt) return null;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return null;
  const days = Math.max(0, Math.floor((now.getTime() - t) / 86400000));
  let text: string;
  if (days === 0) text = "Updated today";
  else if (days === 1) text = "Updated yesterday";
  else if (days < 60) text = `Updated ${days} days ago`;
  else if (days < 730) text = `Updated ${Math.round(days / 30.4)} months ago`;
  else text = `Updated ${Math.floor(days / 365)} years ago`;
  return { text, stale: days >= staleAfterDays };
}

/** True when the last backup is missing or older than `maxDays`. */
export function backupDue(lastBackupISO: string | null | undefined, today: string, maxDays = 30): boolean {
  if (!lastBackupISO) return true;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastBackupISO}T00:00:00Z`)) / 86400000;
  return Number.isNaN(days) ? true : days > maxDays;
}
