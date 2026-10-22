export interface DriverPoint {
  date: string;
  netWorth: number;
  liabilities?: number;
  byAssetType?: Record<string, number>;
}

export interface Driver {
  key: string; // asset type, or "liabilities"
  delta: number; // effect on net worth (positive helps)
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * What moved net worth over the last `days`: the change in each asset type
 * between the latest snapshot on or before (today - days) and the newest
 * snapshot, plus the effect of debt. Sorted by size, biggest first. Null when
 * no snapshot is old enough, or nothing changed.
 */
export function driversOfChange(
  history: DriverPoint[] | null | undefined,
  days: number,
  today: string,
): { drivers: Driver[]; total: number; fromDate: string } | null {
  if (!history || history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = addDays(today, -days);
  let base: DriverPoint | null = null;
  for (const p of sorted) if (p.date <= cutoff) base = p;
  const latest = sorted[sorted.length - 1];
  if (!base || base.date === latest.date) return null;

  const keys = new Set([...Object.keys(base.byAssetType ?? {}), ...Object.keys(latest.byAssetType ?? {})]);
  const drivers: Driver[] = [];
  for (const key of keys) {
    const delta = (latest.byAssetType?.[key] ?? 0) - (base.byAssetType?.[key] ?? 0);
    if (Math.abs(delta) >= 0.5) drivers.push({ key, delta });
  }
  const debtDelta = -((latest.liabilities ?? 0) - (base.liabilities ?? 0));
  if (Math.abs(debtDelta) >= 0.5) drivers.push({ key: "liabilities", delta: debtDelta });

  if (drivers.length === 0) return null;
  drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { drivers, total: latest.netWorth - base.netWorth, fromDate: base.date };
}
