export interface DupEntry {
  id: number | string;
  entryType: string;
  entryDate: string;
  amount: number;
  currency: string;
  category: string;
  description?: string | null;
}

/**
 * An expense already logged that looks like the one about to be saved: same day, amount and
 * currency, and either the same category or the same note. Returns it so the form can ask
 * "did you mean to log this twice?" Lets repeat purchases through if the user confirms.
 */
export function findDuplicate(
  entries: DupEntry[] | null | undefined,
  candidate: { amount: number; currency: string; date: string; category: string; description?: string },
): DupEntry | null {
  const note = (candidate.description ?? "").trim().toLowerCase();
  for (const e of entries ?? []) {
    if (e.entryType !== "expense" || e.entryDate !== candidate.date || e.currency !== candidate.currency) continue;
    if (Math.abs(e.amount - candidate.amount) > 0.004) continue;
    const sameNote = note !== "" && (e.description ?? "").trim().toLowerCase() === note;
    if (e.category === candidate.category || sameNote) return e;
  }
  return null;
}
