export interface CheckHolding {
  id: number | string;
  label: string;
  assetType: string;
  account: string;
  value: number;
  country: string;
}

export interface DataIssue {
  id: string;
  message: string;
}

/** Simple sanity checks on the holdings list. Empty when everything looks fine. */
export function dataChecks(holdings: CheckHolding[] | null | undefined): DataIssue[] {
  if (!holdings || holdings.length === 0) return [];
  const issues: DataIssue[] = [];

  const seen = new Map<string, CheckHolding[]>();
  for (const h of holdings) {
    const key = `${h.assetType}|${h.account.trim().toLowerCase()}|${h.label.trim().toLowerCase()}`;
    seen.set(key, [...(seen.get(key) ?? []), h]);
  }
  const dupes = [...seen.values()].filter((g) => g.length > 1);
  if (dupes.length > 0) {
    issues.push({
      id: "duplicates",
      message: `${dupes.length} holding${dupes.length === 1 ? " appears" : "s appear"} more than once in the same account: ${dupes
        .slice(0, 3)
        .map((g) => g[0].label)
        .join(", ")}.`,
    });
  }

  const zero = holdings.filter((h) => !(h.value > 0));
  if (zero.length > 0) {
    issues.push({
      id: "zero-value",
      message: `${zero.length} holding${zero.length === 1 ? " has" : "s have"} no value: ${zero
        .slice(0, 3)
        .map((h) => h.label)
        .join(", ")}.`,
    });
  }

  const noCountry = holdings.filter((h) => !h.country.trim());
  if (noCountry.length > 0) {
    issues.push({
      id: "no-country",
      message: `${noCountry.length} holding${noCountry.length === 1 ? " has" : "s have"} no country set, which affects the country chart.`,
    });
  }

  return issues;
}
