export interface DashboardSection {
  id: string;
  label: string;
}

/** Every card on the Dashboard that can be hidden. The headline numbers are always shown. */
export const DASHBOARD_SECTIONS: DashboardSection[] = [
  { id: "chart", label: "Net worth over time" },
  { id: "allocation", label: "Where your money is" },
  { id: "goals", label: "Goals" },
  { id: "emergency", label: "Emergency fund" },
  { id: "welcome", label: "Welcome back note" },
  { id: "started", label: "Getting started checklist" },
  { id: "attention", label: "Needs your attention" },
  { id: "upcoming", label: "Coming up (bills)" },
  { id: "moved", label: "What moved your net worth" },
  { id: "change", label: "How you are doing" },
  { id: "savings", label: "Savings rate" },
  { id: "projection", label: "Where you could be" },
  { id: "health", label: "Money Health" },
  { id: "stress", label: "Stress test" },
  { id: "breakdown", label: "Net worth breakdown" },
  { id: "benchmark", label: "You vs the market" },
  { id: "returns", label: "Returns by asset type" },
  { id: "cagr", label: "CAGR by holding" },
  { id: "movers", label: "Top gainers and losers" },
];

export const HIDDEN_SECTIONS_KEY = "nw_hidden_sections";

/** Reads the saved hidden ids, ignoring anything unknown or malformed. */
export function parseHiddenSections(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const known = new Set(DASHBOARD_SECTIONS.map((s) => s.id));
    return new Set(parsed.filter((id): id is string => typeof id === "string" && known.has(id)));
  } catch {
    return new Set();
  }
}

export function toggleSection(hidden: Set<string>, id: string): Set<string> {
  const next = new Set(hidden);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function serializeHiddenSections(hidden: Set<string>): string {
  return JSON.stringify([...hidden].sort());
}
