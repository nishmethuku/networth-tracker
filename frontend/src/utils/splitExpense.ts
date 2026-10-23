export interface SplitPart {
  category: string;
  amount: number;
}

export interface SplitProblem {
  ok: false;
  message: string;
}

export interface SplitOk {
  ok: true;
  /** The first part, applied to the existing entry. */
  keep: SplitPart;
  /** Every other part, each added as a new entry. */
  add: SplitPart[];
}

const cents = (n: number) => Math.round(n * 100);

/**
 * Checks that the parts of a split add up to the original amount (to the cent) and
 * returns what to do: change the original entry to the first part and add one new
 * entry for each of the others.
 */
export function planSplit(total: number, parts: SplitPart[]): SplitOk | SplitProblem {
  const filled = parts.filter((p) => p.category && p.amount > 0);
  if (filled.length < 2) return { ok: false, message: "Split it into at least two parts, each with a category and an amount." };
  if (parts.some((p) => p.amount < 0 || Number.isNaN(p.amount))) return { ok: false, message: "Amounts cannot be negative." };
  const sum = filled.reduce((s, p) => s + cents(p.amount), 0);
  if (sum !== cents(total)) {
    const diff = (cents(total) - sum) / 100;
    return {
      ok: false,
      message: diff > 0 ? `${diff.toFixed(2)} is still unassigned.` : `The parts are ${Math.abs(diff).toFixed(2)} over the total.`,
    };
  }
  return { ok: true, keep: filled[0], add: filled.slice(1) };
}

/** What is left of `total` after the given parts, to the cent (never below 0). */
export function remainder(total: number, parts: SplitPart[]): number {
  const used = parts.reduce((s, p) => s + (p.amount > 0 ? cents(p.amount) : 0), 0);
  return Math.max(0, cents(total) - used) / 100;
}
