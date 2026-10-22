import { useState } from "react";
import { parseVisitRecord, sinceLastVisit, type SinceVisit } from "../utils/sinceLastVisit";

const KEY = "nw_last_visit";
const SESSION_KEY = "nw_since_visit";

/**
 * Remembers net worth once per day in this browser so the Dashboard can say
 * what changed since the last visit. The answer is kept for the tab session so
 * a reload does not make it vanish.
 */
export function useSinceLastVisit(current: number | null | undefined, today: string): SinceVisit | null {
  const [result] = useState<SinceVisit | null>(() => {
    if (current == null || !Number.isFinite(current)) return null;
    try {
      const cached = sessionStorage.getItem(SESSION_KEY);
      if (cached) return JSON.parse(cached) as SinceVisit | null;
    } catch {
      /* ignore */
    }
    let computed: SinceVisit | null = null;
    try {
      const prev = parseVisitRecord(localStorage.getItem(KEY));
      computed = sinceLastVisit(prev, current, today);
      if (!prev || prev.date < today) localStorage.setItem(KEY, JSON.stringify({ date: today, netWorth: current }));
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(computed));
    } catch {
      /* storage blocked: no card */
    }
    return computed;
  });
  return result;
}
