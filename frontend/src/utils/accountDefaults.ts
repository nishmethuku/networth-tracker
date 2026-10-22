export const FALLBACK_ACCOUNT_NAME = "Main account";

/**
 * The account a new holding goes into when the Account field is left blank:
 * the account that already holds the most holdings (so a second purchase
 * lands next to the first instead of creating a stray "Account 1"), or a
 * plain "Main account" when there are none yet. Ties go to the name that
 * sorts first, so the choice is stable.
 */
export function defaultAccountName(accounts: { name: string; holdingCount: number }[] | undefined | null): string {
  const used = (accounts || []).filter((a) => a.name && a.holdingCount > 0);
  if (used.length === 0) return FALLBACK_ACCOUNT_NAME;
  const best = used.reduce((a, b) => (b.holdingCount > a.holdingCount || (b.holdingCount === a.holdingCount && b.name < a.name) ? b : a));
  return best.name;
}
