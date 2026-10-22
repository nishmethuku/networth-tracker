const NON_SPENDING = new Set(["cc-payment", "credit-card-payment", "card-payment"]);

/**
 * Card bill payments are not spending (the purchases on the card are already
 * logged), so totals leave them out. Mirrors the rule on the server: ignores
 * case, spaces, underscores and a trailing "s".
 */
export function isNonSpendingCategory(category: string | null | undefined): boolean {
  let key = (category ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (key.endsWith("s")) key = key.slice(0, -1);
  return NON_SPENDING.has(key);
}
