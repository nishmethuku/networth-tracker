export interface VisitRecord {
  date: string; // YYYY-MM-DD of the last visit
  netWorth: number;
}

export interface SinceVisit {
  delta: number;
  pct: number | null;
  daysAgo: number;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/**
 * Change since the last day the person opened the app. Null on the first ever
 * visit, on a second visit the same day, and when the value is unchanged
 * to the cent (nothing worth saying).
 */
export function sinceLastVisit(prev: VisitRecord | null | undefined, current: number, today: string): SinceVisit | null {
  if (!prev || !Number.isFinite(prev.netWorth) || prev.date >= today) return null;
  const delta = current - prev.netWorth;
  if (Math.abs(delta) < 0.005) return null;
  return {
    delta,
    pct: prev.netWorth > 0 ? (delta / prev.netWorth) * 100 : null,
    daysAgo: daysBetween(prev.date, today),
  };
}

export function parseVisitRecord(raw: string | null | undefined): VisitRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && typeof v.netWorth === "number") {
      return { date: v.date, netWorth: v.netWorth };
    }
  } catch {
    /* fall through */
  }
  return null;
}
