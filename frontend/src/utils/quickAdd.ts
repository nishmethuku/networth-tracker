export const QUICK_ADD_KEY = "nw_quick_add_last";

export interface QuickAddLast {
  category?: string;
  paidFrom?: string;
}

export interface QuickAddInput {
  amount: string;
  category: string;
  description: string;
  date: string;
  currency: string;
  /** "" for none, a cash holding id like "12", or a credit card like "card:5". */
  paidFrom: string;
}

/** The first problem with the form, in plain words, or null when it can be saved. */
export function validateQuickAdd(input: QuickAddInput, today: string): string | null {
  const amount = parseFloat(input.amount);
  if (!(amount > 0)) return "Enter an amount above zero.";
  if (!input.category) return "Pick a category.";
  if (!input.date) return "Pick a date.";
  if (input.date > today) return "The date cannot be in the future.";
  return null;
}

/** The body for POST /budget/entries. A credit card charges the card, a cash account is deducted. */
export function buildExpensePayload(input: QuickAddInput) {
  const payload: Record<string, unknown> = {
    entry_type: "expense",
    entry_date: input.date,
    amount: parseFloat(input.amount),
    currency: input.currency,
    category: input.category,
    description: input.description.trim() || null,
    is_recurring: false,
    recurring_frequency: null,
  };
  if (input.paidFrom.startsWith("card:")) payload.charge_liability_id = Number(input.paidFrom.slice(5));
  else if (input.paidFrom) payload.funding_source_holding_id = Number(input.paidFrom);
  return payload;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function yesterdayOf(today: string): string {
  return addDays(today, -1);
}

/** Last used category and paid-from choice, so repeat entries take two taps. Never throws. */
export function loadLast(): QuickAddLast {
  try {
    const raw = localStorage.getItem(QUICK_ADD_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return {
      category: typeof parsed.category === "string" ? parsed.category : undefined,
      paidFrom: typeof parsed.paidFrom === "string" ? parsed.paidFrom : undefined,
    };
  } catch {
    return {};
  }
}

export function saveLast(last: QuickAddLast): void {
  try {
    localStorage.setItem(QUICK_ADD_KEY, JSON.stringify(last));
  } catch {
    /* storage blocked: the form just will not remember */
  }
}
