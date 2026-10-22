export interface LimitStatus {
  category: string;
  limit: number;
  spent: number;
  percent: number;
}

/**
 * A short heads-up when the category you just logged is close to or over its
 * monthly limit, or null when there is nothing to say. The category's parent
 * is checked too, since a limit can be set on the group.
 */
export function limitWarning(
  limits: LimitStatus[] | null | undefined,
  category: string,
  parent: string | null | undefined,
  labelFor: (c: string) => string,
  formatMoney: (v: number) => string,
): string | null {
  const hit = (limits ?? [])
    .filter((l) => l.category === category || (parent && l.category === parent))
    .sort((a, b) => b.percent - a.percent)[0];
  if (!hit || hit.percent < 80) return null;
  const name = labelFor(hit.category);
  if (hit.percent >= 100) return `${name} is over its ${formatMoney(hit.limit)} limit this month (${Math.round(hit.percent)}%).`;
  return `${name} is at ${Math.round(hit.percent)}% of its ${formatMoney(hit.limit)} limit.`;
}
